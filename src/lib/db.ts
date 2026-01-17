import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../config';

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.database.url,
      // Supabase requires SSL, even for the pooler in production
      // When connecting directly via IPv6, it also requires it.
      // We use rejectUnauthorized: false to allow self-signed certs if needed (common in some PaaS)
      ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : undefined,
      max: 20, // Maximum pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

export const query = async <T extends any = any>(text: string, params?: any[]): Promise<T[]> => {
  const pool = getPool();
  const res: QueryResult = await pool.query(text, params);
  return res.rows;
};

export const getClient = async (): Promise<PoolClient> => {
  const pool = getPool();
  return pool.connect();
};

export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
  }
};
