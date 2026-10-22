
import { Pool } from 'pg';
import { resolvePgPoolSsl } from '@/lib/pg-ssl';

let lmsPool: Pool | null = null;

function getLmsPool() {
  if (lmsPool) {
    return lmsPool;
  }

  const connectionString = process.env.LMS_POSTGRES_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('Missing LMS_POSTGRES_URL or DATABASE_URL environment variable');
  }

  lmsPool = new Pool({
    connectionString,
    ssl: resolvePgPoolSsl(),
  });

  return lmsPool;
}

/**
 * Executes a read-only SELECT query against the LMS database.
 * Throws an error if the query attempts to modify data.
 * 
 * @param sql The SQL query string
 * @param params Optional parameters for the query
 * @returns Array of rows
 */
export async function queryLMS<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const cleanSql = sql.trim().toUpperCase();
  
  // Basic security check to prevent write operations
  if (
    cleanSql.startsWith('INSERT') || 
    cleanSql.startsWith('UPDATE') || 
    cleanSql.startsWith('DELETE') ||
    cleanSql.startsWith('DROP') ||
    cleanSql.startsWith('ALTER') ||
    cleanSql.startsWith('TRUNCATE')
  ) {
    throw new Error('Only SELECT queries are allowed on the LMS database via this client.');
  }

  const pool = getLmsPool();
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}
