#!/usr/bin/env node
/**
 * Migration runner for the aux (AI) database.
 *
 * DB1 has Prisma migrations; DB2 has been hand-applied with `psql` since it was
 * created, which offers no record of what ran where. This adds the missing
 * ledger: `schema_migrations_aux`, keyed by filename with a SHA-256 checksum.
 *
 * Editing an already-applied file is a hard error rather than a warning — a
 * silently mutated migration means two databases that claim the same version
 * but do not match, which is exactly the failure this table exists to prevent.
 *
 *   node db/ai-db/migrate.mjs --init      initialize a new empty AUX database
 *   node db/ai-db/migrate.mjs             apply everything pending
 *   node db/ai-db/migrate.mjs --baseline  record the 7 legacy files as applied
 *                                       (they predate this runner) without
 *                                       executing them
 *   node db/ai-db/migrate.mjs --status    show the ledger and exit
 *   node db/ai-db/migrate.mjs --dry-run   list what would run
 *
 * Lives in db/ai-db/ rather than scripts/ because .gitignore excludes /scripts,
 * and schema migrations must be version controlled.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadProjectEnv } from '../../scripts/lib/load-env.cjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCAL_DIR = join(HERE, 'local');

/** Applied by hand before this runner existed; `--baseline` records them. */
const LEGACY_FILES = [
  '001_extensions.sql',
  '002_acs_tables.sql',
  '003_pds_tables.sql',
  '004_remove_assistant_id.sql',
  '005_add_resource_id.sql',
  '006_pds_enhancements.sql',
  '007_admin_ai_tables.sql',
];

function sqlFiles() {
  const legacy = LEGACY_FILES.map(name => ({ name, path: join(HERE, name) }));
  const local = existsSync(LOCAL_DIR)
    ? readdirSync(LOCAL_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort()
        .map(name => ({ name: `local/${name}`, path: join(LOCAL_DIR, name) }))
    : [];
  return [...legacy, ...local];
}

const checksum = sql => createHash('sha256').update(sql, 'utf8').digest('hex');

async function main() {
  loadProjectEnv();
  const connectionString = process.env.AUX_POSTGRES_URL;
  if (!connectionString) {
    console.error('AUX_POSTGRES_URL is not set (check .env.local)');
    process.exit(1);
  }

  const args = new Set(process.argv.slice(2));
  const baseline = args.has('--baseline');
  const initialize = args.has('--init');
  if (initialize && baseline) throw new Error('Use --init for a fresh database or --baseline for an existing schema, not both');
  const dryRun = args.has('--dry-run');
  const statusOnly = args.has('--status');

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    if (initialize) {
      const { rows } = await client.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations_aux'"
      );
      const { rows: [ledger] } = await client.query("SELECT to_regclass('public.schema_migrations_aux') AS name");
      const recorded = ledger.name ? (await client.query('SELECT count(*)::int AS count FROM schema_migrations_aux')).rows[0].count : 0;
      if (rows.length && !recorded) throw new Error('--init requires an empty public schema; use reviewed --baseline for existing AUX tables');
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations_aux (
        filename    VARCHAR PRIMARY KEY,
        checksum    VARCHAR NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        baselined   BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);

    const { rows } = await client.query('SELECT filename, checksum, baselined FROM schema_migrations_aux');
    const applied = new Map(rows.map(r => [r.filename, r]));

    if (statusOnly) {
      for (const { name, path } of sqlFiles()) {
        const record = applied.get(name);
        const state = !record ? 'PENDING' : record.baselined ? 'baselined' : 'applied';
        const drifted = record && record.checksum !== checksum(readFileSync(path, 'utf8'));
        console.log(`  ${drifted ? 'DRIFTED ' : ''}${state.padEnd(10)} ${name}`);
      }
      return;
    }

    let count = 0;
    for (const { name, path } of sqlFiles()) {
      const sql = readFileSync(path, 'utf8');
      const digest = checksum(sql);
      const record = applied.get(name);

      if (record) {
        if (record.checksum !== digest) {
          throw new Error(
            `${name} changed after it was applied.\n` +
              `  recorded: ${record.checksum}\n  on disk:  ${digest}\n` +
              `Migrations are immutable — add a new file instead of editing this one.`
          );
        }
        continue;
      }

      const isLegacy = LEGACY_FILES.includes(name);
      if (baseline && isLegacy) {
        if (!dryRun) {
          await client.query(
            'INSERT INTO schema_migrations_aux (filename, checksum, baselined) VALUES ($1, $2, TRUE)',
            [name, digest]
          );
        }
        console.log(`  baselined  ${name}`);
        count++;
        continue;
      }

      if (isLegacy && !baseline && !initialize) {
        throw new Error(
          `${name} is a legacy migration with no ledger entry.\n` +
            `It was applied by hand before this runner existed. Run once with ` +
            `--baseline to record the legacy files, then run again.`
        );
      }

      if (dryRun) {
        console.log(`  would apply ${name}`);
        count++;
        continue;
      }

      // Each migration is atomic: a failure halfway through leaves no ledger
      // row and no partial schema.
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations_aux (filename, checksum) VALUES ($1, $2)',
          [name, digest]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`${name} failed: ${error.message}`);
      }
      console.log(`  applied    ${name}`);
      count++;
    }

    console.log(count === 0 ? '  nothing to do — schema is up to date' : `\n${count} migration(s) processed`);
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(`\nmigrate: ${error.message}\n`);
  process.exit(1);
});
