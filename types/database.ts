import { PoolClient, QueryResult, QueryResultRow } from 'pg';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  ssl?: boolean;
}

export interface DatabaseResult<T extends QueryResultRow = any> extends QueryResult<T> {
  rows: T[];
}

export interface DatabaseClient {
  query<T extends QueryResultRow = any>(text: string, values?: any[]): Promise<DatabaseResult<T>>;
  release(err?: Error | boolean): void;
}

export interface DatabaseHealth {
  connected: boolean;
  error?: string;
  timestamp: string;
  version?: string;
}

export interface QueryOptions {
  timeout?: number;
  retries?: number;
}

export interface ConnectionPoolStats {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}
