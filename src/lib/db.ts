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
