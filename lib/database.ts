import { Pool, PoolConfig } from 'pg';

// Database configuration
const dbConfig: PoolConfig = {
  host: process.env.DB_HOST || '31.97.50.49',
  port: parseInt(process.env.DB_PORT || '9999'),
  database: process.env.DB_NAME || 'sinlui_ujicoba',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'P@ostgres!',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: false,
};

// Create connection pool
const pool = new Pool(dbConfig);

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Test connection function
export const testConnection = async (): Promise<boolean> => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('Database connection successful!');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
};

// Query function
export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('Executed query', { text, duration, rows: res.rowCount });
  return res;
};

// Get client from pool
export const getClient = async () => {
  return await pool.connect();
};

// Close pool
export const closePool = async () => {
  await pool.end();
};

export default pool;
