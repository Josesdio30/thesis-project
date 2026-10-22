import { Pool, PoolClient, QueryResultRow } from 'pg';
import { resolvePgPoolSsl } from '@/lib/pg-ssl';

let auxPool: Pool | null = null;

function getAuxPool() {
  if (auxPool) {
    return auxPool;
  }

  const connectionString = process.env.AUX_POSTGRES_URL;

  if (!connectionString) {
    throw new Error('Missing AUX_POSTGRES_URL environment variable');
  }

  auxPool = new Pool({
    connectionString,
    ssl: resolvePgPoolSsl(),
  });

  return auxPool;
}

export async function queryAux<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = getAuxPool();
  const client = await pool.connect();

  try {
    const result = await client.query<T>(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function withAuxTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getAuxPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
