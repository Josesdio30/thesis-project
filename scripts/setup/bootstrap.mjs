#!/usr/bin/env node
import { parseArgs } from 'node:util';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { loadProjectEnv } from '../lib/load-env.cjs';
import { bootstrapDatabase, validateBootstrapInput } from './bootstrap-core.mjs';

async function main() {
  const { values } = parseArgs({ options: {
    username: { type: 'string' }, email: { type: 'string' }, name: { type: 'string', default: 'System Administrator' },
    code: { type: 'string', default: 'ADM-INITIAL' }, 'password-stdin': { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: npm run db:bootstrap -- --username USER --email EMAIL --password-stdin [--name NAME] [--code CODE]');
    console.log('Reads password from stdin. Creates minimum master data and one admin; never resets existing passwords.');
    return;
  }
  if (!values['password-stdin'] || process.stdin.isTTY) throw new Error('Pipe password through stdin with --password-stdin (see runbook)');
  process.stdin.setEncoding('utf8');
  let password = '';
  for await (const chunk of process.stdin) {
    password += chunk.toString();
    if (Buffer.byteLength(password) > 1024) throw new Error('Password input too long');
  }
  // Accept one line from secret tools while preserving spaces inside the password.
  password = password.replace(/\r?\n$/, '');
  const input = validateBootstrapInput({ username: values.username, email: values.email, name: values.name, code: values.code, password });
  loadProjectEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const target = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('DATABASE_URL must be PostgreSQL');
  console.log(`Bootstrap target: ${target.hostname}:${target.port || '5432'}${target.pathname}`);
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const result = await bootstrapDatabase(client, input, await bcrypt.hash(password, 12));
    console.log(result.created ? `Admin created (id=${result.userId}); master data ready` : `Admin already exists (id=${result.userId}); password unchanged; master data ready`);
  } finally { await client.end(); }
}
main().catch(error => {
  // PostgreSQL detail may contain row data (including hashes); print only safe messages.
  console.error(error.code ? `Bootstrap database error (${error.code}); check target, schema and constraints` : `Bootstrap: ${error.message}`);
  process.exitCode = 1;
});
