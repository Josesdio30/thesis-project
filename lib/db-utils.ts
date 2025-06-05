import { PoolClient } from 'pg';
import pool from './database';

export interface DatabaseTransaction {
  query: (text: string, params?: any[]) => Promise<any>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  // release: () => void;
}

/**
 * Execute a database query with automatic connection management
 */
export async function withDatabase<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

/**
 * Execute queries within a transaction
 */
export async function withTransaction<T>(callback: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const transaction: DatabaseTransaction = {
      query: (text: string, params?: any[]) => client.query(text, params),
      commit: async () => {
        await client.query('COMMIT');
      },
      rollback: async () => {
        await client.query('ROLLBACK');
      },
      // release: () => client.release()
    };

    const result = await callback(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if database is connected and healthy
 */
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  error?: string;
  timestamp: string;
}> {
  try {
    const result = await withDatabase(async (client) => {
      const res = await client.query('SELECT NOW() as current_time, version() as pg_version');
      return res.rows[0];
    });

    return {
      connected: true,
      timestamp: result.current_time,
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }
}
