import { loadProjectEnv } from './lib/load-env.cjs';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

loadProjectEnv();

const { Pool } = pg;

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AUX_POSTGRES_URL'];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const pool = new Pool({
  connectionString: process.env.AUX_POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

const jsonColumns = new Set([
  'acs_assignments.rubric',
  'acs_grading_results.citations',
  'acs_grading_results.rubric_alignment',
  'pds_comparisons.matched_chunks',
  'pds_audit_logs.metadata',
]);

const vectorColumns = new Set([
  'pds_embeddings.vector',
]);

const tableOrder = [
  'acs_assignments',
  'acs_uploaded_files',
  'acs_grading_jobs',
  'acs_grading_results',
  'acs_token_usage',
  'pds_detections',
  'pds_chunks',
  'pds_embeddings',
  'pds_comparisons',
  'pds_flags',
  'pds_teacher_actions',
  'pds_audit_logs',
];

const columnRenameMap = {
  acs_uploaded_files: {
    uploaded_at: 'created_at',
  },
};

function toVectorLiteral(value) {
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    return `[${value.join(',')}]`;
  }

  if (typeof value === 'string') {
    return value;
  }

  throw new Error(`Unsupported vector value: ${JSON.stringify(value)}`);
}

function toParamValue(table, column, value) {
  const key = `${table}.${column}`;

  if (vectorColumns.has(key)) {
    return toVectorLiteral(value);
  }

  if (jsonColumns.has(key)) {
    return JSON.stringify(value ?? null);
  }

  return value ?? null;
}

function toPlaceholder(table, column, index) {
  const key = `${table}.${column}`;

  if (vectorColumns.has(key)) {
    return `$${index}::vector`;
  }

  if (jsonColumns.has(key)) {
    return `$${index}::jsonb`;
  }

  return `$${index}`;
}

async function fetchAllRows(table) {
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to fetch ${table} from Supabase: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

async function getTargetCount(client, table) {
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return result.rows[0]?.count ?? 0;
}

async function getTargetColumns(client, table) {
  const result = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [table]
  );

  return result.rows.map((row) => row.column_name);
}

function normalizeRow(table, row, targetColumnsSet) {
  const renameMap = columnRenameMap[table] ?? {};
  const normalized = {};

  for (const [sourceColumn, value] of Object.entries(row)) {
    const targetColumn = renameMap[sourceColumn] ?? sourceColumn;

    if (!targetColumnsSet.has(targetColumn)) {
      continue;
    }

    normalized[targetColumn] = value;
  }

  if (table === 'acs_assignments' && typeof normalized.rerun_grading === 'string') {
    normalized.rerun_grading = normalized.rerun_grading === 'true';
  }

  return normalized;
}

async function insertRows(client, table, rows) {
  if (rows.length === 0) {
    return;
  }

  const targetColumns = await getTargetColumns(client, table);
  const targetColumnsSet = new Set(targetColumns);
  const normalizedRows = rows.map((row) => normalizeRow(table, row, targetColumnsSet));
  const columns = targetColumns.filter((column) =>
    normalizedRows.some((row) => row[column] !== undefined)
  );
  const batchSize = 250;

  if (columns.length === 0) {
    throw new Error(`No compatible target columns found for table ${table}`);
  }

  for (let offset = 0; offset < normalizedRows.length; offset += batchSize) {
    const chunk = normalizedRows.slice(offset, offset + batchSize);
    const values = [];
    const tuples = chunk.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(toParamValue(table, column, row[column]));
        return toPlaceholder(table, column, values.length);
      });

      return `(${placeholders.join(', ')})`;
    });

    const sql = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES ${tuples.join(', ')}
      ON CONFLICT (id) DO NOTHING
    `;

    await client.query(sql, values);
  }
}

async function migrateTable(client, table) {
  const sourceRows = await fetchAllRows(table);
  const targetCountBefore = await getTargetCount(client, table);

  console.log(`[migrate] ${table}: source=${sourceRows.length}, target_before=${targetCountBefore}`);

  if (sourceRows.length === 0) {
    return { sourceCount: 0, targetCountAfter: targetCountBefore };
  }

  await insertRows(client, table, sourceRows);

  const targetCountAfter = await getTargetCount(client, table);
  console.log(`[migrate] ${table}: target_after=${targetCountAfter}`);

  return { sourceCount: sourceRows.length, targetCountAfter };
}

async function main() {
  const client = await pool.connect();

  try {
    for (const table of tableOrder) {
      await migrateTable(client, table);
    }

    console.log('[migrate] completed');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[migrate] failed:', error);
  process.exitCode = 1;
});
