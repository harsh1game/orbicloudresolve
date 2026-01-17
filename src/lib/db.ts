import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../config';

// Supabase client for simple REST API queries
let supabase: SupabaseClient;

// PostgreSQL pool for transactions, locking, and complex queries
let pool: Pool;

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(
      config.supabase.url,
      config.supabase.serviceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }
  return supabase;
}

export function getPool(): Pool {
  if (!pool) {
    // Use DATABASE_URL if available (for transactional operations)
    // Otherwise construct from Supabase URL
    const dbUrl = config.database.url || 
      `postgresql://postgres.yvzofljxfonsxnmwjbcy:${config.supabase.serviceKey.split('.')[2]}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;
    
    pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

// Simple queries using Supabase (for API reads)
export const query = async <T extends any = any>(text: string, params?: any[]): Promise<T[]> => {
  // For simple SELECT queries, we could use Supabase
  // But for compatibility, use PostgreSQL pool
  const pool = getPool();
  const res: QueryResult = await pool.query(text, params);
  return res.rows as T[];
};

// Get client for transactions (worker, rate limiting)
export const getClient = async (): Promise<PoolClient> => {
  const pool = getPool();
  return pool.connect();
};

// Cleanup
export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
  }
};

