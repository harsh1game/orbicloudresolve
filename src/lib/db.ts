import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

let supabase: SupabaseClient;

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

// Helper function for queries (compatible with old code structure)
export const query = async <T extends any = any>(
  table: string,
  options?: any
): Promise<T[]> => {
  const client = getSupabaseClient();
  const { data, error } = await client.from(table).select('*');
  
  if (error) throw error;
  return data as T[];
};

// For raw SQL queries (used by worker and complex queries)
export const rpc = async <T extends any = any>(
  functionName: string,
  params?: any
): Promise<T[]> => {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc(functionName, params);
  
  if (error) throw error;
  return data as T[];
};

// Cleanup (not really needed for Supabase client but keeping for compatibility)
export const closePool = async (): Promise<void> => {
  // Supabase client doesn't need explicit cleanup
};

// Backward compatibility shims for code not yet migrated
export const getPool = () => {
  // Return a mock pool-like object for compatibility
  // Real implementation uses Supabase client above
  return {
    query: async (text: string, params?: any[]) => {
      // For now, throw an error to identify code that needs migration
      throw new Error('Direct pool.query() not supported with Supabase client. Use rpc() or Supabase methods.');
    },
    end: async () => {},
  };
};

export const getClient = async () => {
  // Return a mock client-like object for compatibility
  // Real implementation uses Supabase client above
  return {
    query: async (text: string, params?: any[]) => {
      // For now, throw an error to identify code that needs migration
      throw new Error('Direct client.query() not supported with Supabase client. Use rpc() or Supabase methods.');
    },
    release: () => {},
  };
};
