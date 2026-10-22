import postgres from 'postgres';
<<<<<<< HEAD
=======
import { resolvePostgresSsl } from '@/lib/pg-ssl';
>>>>>>> test-plagiarism-correction-feature

const sql = postgres({
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DATABASE,
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
<<<<<<< HEAD
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
=======
  ssl: resolvePostgresSsl(),
>>>>>>> test-plagiarism-correction-feature
  max: 10,
});

export default sql;
