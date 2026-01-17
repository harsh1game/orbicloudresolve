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

// For raw SQL queries - use Supabase RPC
export const rpc = async <T extends any = any>(
  functionName: string,
  params?: any
): Promise<T[]> => {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc(functionName, params);
  
  if (error) throw error;
  return data as T[];
};

// Query helper - translates simple SQL to Supabase queries
export const query = async <T extends any = any>(
  text: string,
  params?: any[]
): Promise<T[]> => {
  // For now, throw error to identify code that needs migration to Supabase client
  throw new Error(`Direct SQL not supported. Query: ${text}. Use Supabase client or RPC functions.`);
};

// Stub for compatibility
export const getPool = () => {
  throw new Error('getPool() not supported with Supabase client');
};

// Stub for compatibility  
export const getClient = async () => {
  throw new Error('getClient() not supported with Supabase client');
};

// Cleanup
export const closePool = async (): Promise<void> => {
  // Supabase client doesn't need cleanup
};
