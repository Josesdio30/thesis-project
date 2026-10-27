import { Pool, PoolConfig } from 'pg';

// All connection details must come from explicit deployment configuration.
// Never let missing settings fall through to pg's ambient defaults.
function databaseConfig(): PoolConfig {
  const connectionString = process.env.LMS_POSTGRES_URL || process.env.DATABASE_URL;
  const limits = { max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 2000, ssl: false as const };
  if (connectionString) return { ...limits, connectionString };

  const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] as const;
  const missing = required.filter(key =>
    process.env[key] === undefined || (key !== 'DB_PASSWORD' && !process.env[key]?.trim())
  );
  if (missing.length) {
    throw new Error(`Missing database configuration: set LMS_POSTGRES_URL, DATABASE_URL, or all DB_* settings (missing: ${missing.join(', ')})`);
  }
  const port = Number(process.env.DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid DB_PORT: expected an integer between 1 and 65535');
  }
  return {
    ...limits,
    host: process.env.DB_HOST,
    port,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };
}

const dbConfig = databaseConfig();

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
