import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const config = {
  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
  },

  // Database (legacy, kept for migration reference)
  database: {
    url: process.env.DATABASE_URL || '',
  },

  // API Server
  api: {
    port: parseInt(process.env.API_PORT || '3000', 10),
  },

  // Worker
  worker: {
    pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '1000', 10),
    batchSize: parseInt(process.env.WORKER_BATCH_SIZE || '10', 10),
  },

  // Admin API
  admin: {
    apiKeyRead: process.env.ADMIN_API_KEY_READ || '',
    apiKeyWrite: process.env.ADMIN_API_KEY_WRITE || '',
  },

  // Environment
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV !== 'production',
};

// Validate required config
if (!config.database.url && (!config.supabase.url || !config.supabase.serviceKey)) {
  throw new Error('Either DATABASE_URL or (SUPABASE_URL + SUPABASE_SERVICE_KEY) are required');
}

// Validate admin API keys (optional but recommended)
if (!config.admin.apiKeyRead || !config.admin.apiKeyWrite) {
  console.warn('WARNING: Admin API keys not configured. Admin endpoints will be inaccessible.');
}
