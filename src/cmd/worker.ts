/**
 * Worker Entry Point
 * 
 * Starts the background worker that processes queued messages
 * Run with: npm run dev:worker
 */

import { config } from '../config';
import { logger } from '../lib/logger';
import { getPool, closePool } from '../lib/db';
import { startWorker } from '../worker/worker';

async function main() {
  try {
    logger.info('Starting OrbiCloud worker', {
      nodeEnv: config.nodeEnv,
      pollIntervalMs: config.worker.pollIntervalMs,
      batchSize: config.worker.batchSize,
    });

    // Initialize database pool
    const pool = getPool();
    await pool.query('SELECT NOW()'); // Test connection
    logger.info('Database connection established');

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
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await closePool();
  process.exit(0);
});

main();
