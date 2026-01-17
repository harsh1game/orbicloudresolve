import { config } from '../config';
import { logger } from '../lib/logger';
import { getSupabaseClient } from '../lib/db';
import { startWorker } from '../worker/worker';

async function main() {
  try {
    logger.info('Starting OrbiCloud worker', {
      nodeEnv: config.nodeEnv,
      pollIntervalMs: config.worker.pollIntervalMs,
      batchSize: config.worker.batchSize,
    });

    // Verify Supabase connection
    const supabase = getSupabaseClient();
    logger.info('Supabase client initialized');

    // Start worker loop
    await startWorker();
  } catch (error: any) {
    logger.error('Failed to start worker', { error: error.message });
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
