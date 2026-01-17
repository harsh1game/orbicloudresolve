import { config } from '../config';
import { logger } from '../lib/logger';
import { getSupabaseClient } from '../lib/db';
import { startServer } from '../api/server';

async function main() {
  try {
    logger.info('Starting OrbiCloud API server', {
      nodeEnv: config.nodeEnv,
      port: config.api.port,
    });

    // Verify Supabase connection
    const supabase = getSupabaseClient();
    logger.info('Supabase client initialized');

    // Start HTTP server
    startServer();
  } catch (error: any) {
    logger.error('Failed to start API server', { error: error.message });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

main();
