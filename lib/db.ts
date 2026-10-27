import postgres from 'postgres';
import { resolvePostgresSsl } from '@/lib/pg-ssl';

const sql = postgres({
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DATABASE,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  ssl: resolvePostgresSsl(),
  max: 10,
});

export default sql;
