import { Pool, PoolClient } from 'pg';
import { config } from '../config';
import { logger } from './logger';

/**
 * PostgreSQL connection pool (Supabase-compatible)
 * This is the ONLY database connection in the system
 */

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.database.url,
      // Supabase requires SSL by default, even in development
      ssl: { rejectUnauthorized: false },
      max: 20, // Maximum pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000, // Phase 5: Increase timeout for remote DB
    });

    pool.on('error', (err) => {
      logger.error('Unexpected database pool error', { error: err.message });
    });

    logger.info('Database pool created');
  }

  return pool;
}

/**
 * Execute a query against the database
 */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query(text, params);
  return result.rows;
}

/**
 * Get a client from the pool for transactions
 * Remember to release it when done!
 */
export async function getClient(): Promise<PoolClient> {
  const pool = getPool();
  return pool.connect();
}

/**
 * Close the database pool gracefully
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}
