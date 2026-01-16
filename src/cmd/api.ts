/**
 * API Server Entry Point
 * 
 * Starts the Express HTTP server
 * Run with: npm run dev:api
 */

import { config } from '../config';
import { logger } from '../lib/logger';
import { getPool, closePool } from '../lib/db';
import { startServer } from '../api/server';

async function main() {
  try {
    logger.info('Starting OrbiCloud API server', {
      nodeEnv: config.nodeEnv,
      port: config.api.port,
    });

    // Initialize database pool
    const pool = getPool();
    await pool.query('SELECT NOW()'); // Test connection
    logger.info('Database connection established');

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
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await closePool();
  process.exit(0);
});

main();
