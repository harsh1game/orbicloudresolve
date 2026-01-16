import { config } from '../config';
import { logger } from '../lib/logger';
import { getClient } from '../lib/db';
import { PoolClient } from 'pg';
import { getProvider } from '../providers/factory';
import { Message } from '../providers/provider';

/**
 * Worker loop that processes queued messages
 * 
 * Features:
 * - Uses Postgres as queue with SELECT ... FOR UPDATE SKIP LOCKED
 * - Retry logic with exponential backoff
 * - Dead letter handling for messages exceeding max attempts
 * - Transaction-safe (crash-safe)
 */

interface QueuedMessage {
  id: string;
  project_id: string;
  type: string;
  from_address: string;
  to_address: string;
  subject: string | null;
  body: string;
  attempts: number;
  max_attempts: number;
}

/**
 * Calculate exponential backoff delay
 * Attempts: 1s, 5s, 30s, 5m, 30m, etc.
 */
function calculateBackoff(attempts: number): number {
  const delays = [1, 5, 30, 300, 1800]; // seconds
  const index = Math.min(attempts, delays.length - 1);
  return delays[index];
}

/**
 * Increment usage count for a project
 * Uses UPSERT to create row if it doesn't exist
 */
async function incrementUsage(
  client: PoolClient,
  projectId: string,
  messageType: string
): Promise<void> {
  // Get current period (YYYY-MM)
  const period = new Date().toISOString().slice(0, 7);

  await client.query(
    `INSERT INTO usage (project_id, period, message_type, count)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (project_id, period, message_type)
     DO UPDATE SET count = usage.count + 1, updated_at = NOW()`,
    [projectId, period, messageType]
  );
}

/**
 * Process a batch of queued messages
 * 
 * Handles:
 * - Initial attempts (next_attempt_at IS NULL or <= NOW)
 * - Retries with exponential backoff
 * - Dead letter for messages exceeding max_attempts
 */
async function processBatch(): Promise<void> {
  const client = await getClient();

  try {
    // Start a transaction
    await client.query('BEGIN');

    // Lock and fetch queued messages ready for processing
    // Includes: new messages + messages ready for retry
    const result = await client.query<QueuedMessage>(
      `SELECT id, project_id, type, from_address, to_address, subject, body, attempts, max_attempts
       FROM messages
       WHERE status = 'queued'
         AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [config.worker.batchSize]
    );

    const messages = result.rows;

    if (messages.length === 0) {
      // No messages to process
      await client.query('COMMIT');
      return;
    }

    logger.info(`Processing ${messages.length} messages`);

    // Process each message
    for (const message of messages) {
      // Phase 3: Check if project is suspended
      const projectCheck = await client.query<{ status: string }>(
        'SELECT status FROM projects WHERE id = $1',
        [message.project_id]
      );

      if (projectCheck.rows.length > 0 && projectCheck.rows[0].status === 'suspended') {
        logger.warn('Skipping message for suspended project', {
          messageId: message.id,
          projectId: message.project_id,
        });

        // Emit skipped event (don't change message status - stays queued)
        await client.query(
          `INSERT INTO events (message_id, project_id, event_type, provider_response)
           VALUES ($1, $2, $3, $4)`,
          [
            message.id,
            message.project_id,
            'skipped',
            JSON.stringify({ reason: 'Project suspended' }),
          ]
        );

        continue; // Skip to next message
      }

      // Check if message has exceeded max attempts
      if (message.attempts >= message.max_attempts) {
        logger.warn('Message exceeded max attempts, moving to dead letter', {
          messageId: message.id,
          attempts: message.attempts,
          maxAttempts: message.max_attempts,
        });

        // Mark as dead
        await client.query(
          `UPDATE messages SET status = 'dead', updated_at = NOW() WHERE id = $1`,
          [message.id]
        );

        await client.query(
          `INSERT INTO events (message_id, project_id, event_type, provider_response)
           VALUES ($1, $2, $3, $4)`,
          [
            message.id,
            message.project_id,
            'dead',
            JSON.stringify({ reason: 'Max attempts exceeded', attempts: message.attempts }),
          ]
        );

        continue;
      }

      logger.info('Processing message', {
        messageId: message.id,
        type: message.type,
        attempt: message.attempts + 1,
        maxAttempts: message.max_attempts,
        to: message.to_address,
        from: message.from_address,
      });

      try {
        // Increment attempt counter
        await client.query(
          `UPDATE messages SET attempts = attempts + 1 WHERE id = $1`,
          [message.id]
        );

        // Get the appropriate provider for this message type
        const provider = getProvider(message.type);

        // Send via provider with timeout protection (Phase 3)
        const timeoutMs = 10000; // 10s timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Provider request timed out')), timeoutMs);
        });

        const result = await Promise.race([
          provider.send(message as Message),
          timeoutPromise
        ]) as any; // Cast because timeoutPromise never resolves to ProviderResult

        if (result.success) {
          // Mark as delivered
          await client.query(
            `UPDATE messages SET status = 'delivered', updated_at = NOW() WHERE id = $1`,
            [message.id]
          );

          await client.query(
            `INSERT INTO events (message_id, project_id, event_type, provider_response) 
             VALUES ($1, $2, $3, $4)`,
            [message.id, message.project_id, 'delivered', JSON.stringify(result.provider_response)]
          );

          // Increment usage count on successful delivery
          await incrementUsage(client, message.project_id, message.type);

          logger.info('Message delivered', {
            messageId: message.id,
            projectId: message.project_id,
            attempt: message.attempts + 1,
          });
        } else {
          // Provider returned failure
          if (result.retryable) {
            // Transient failure - schedule retry with exponential backoff
            const backoffSeconds = calculateBackoff(message.attempts + 1);
            const nextAttempt = new Date(Date.now() + backoffSeconds * 1000);

            await client.query(
              `UPDATE messages 
               SET next_attempt_at = $1, updated_at = NOW() 
               WHERE id = $2`,
              [nextAttempt, message.id]
            );

            await client.query(
              `INSERT INTO events (message_id, project_id, event_type, provider_response) 
               VALUES ($1, $2, $3, $4)`,
              [
                message.id,
                message.project_id,
                'failed',
                JSON.stringify({
                  ...result.provider_response,
                  retryable: true,
                  next_attempt_at: nextAttempt,
                  backoff_seconds: backoffSeconds,
                }),
              ]
            );

            logger.warn('Message failed (retryable), scheduled for retry', {
              messageId: message.id,
              error: result.error_message,
              nextAttempt: nextAttempt.toISOString(),
              backoffSeconds,
            });
          } else {
            // Permanent failure - mark as failed, do NOT retry
            await client.query(
              `UPDATE messages SET status = 'failed', updated_at = NOW() WHERE id = $1`,
              [message.id]
            );

            await client.query(
              `INSERT INTO events (message_id, project_id, event_type, provider_response) 
               VALUES ($1, $2, $3, $4)`,
              [
                message.id,
                message.project_id,
                'failed',
                JSON.stringify({ ...result.provider_response, retryable: false }),
              ]
            );

            logger.error('Message failed (permanent)', {
              messageId: message.id,
              error: result.error_message,
            });
          }
        }
      } catch (error: any) {
        // Uncaught provider error - treat as transient, schedule retry
        const backoffSeconds = calculateBackoff(message.attempts + 1);
        const nextAttempt = new Date(Date.now() + backoffSeconds * 1000);

        await client.query(
          `UPDATE messages 
           SET next_attempt_at = $1, updated_at = NOW() 
           WHERE id = $2`,
          [nextAttempt, message.id]
        );

        await client.query(
          `INSERT INTO events (message_id, project_id, event_type, provider_response) 
           VALUES ($1, $2, $3, $4)`,
          [
            message.id,
            message.project_id,
            'failed',
            JSON.stringify({
              error: error.message,
              retryable: true,
              next_attempt_at: nextAttempt,
              backoff_seconds: backoffSeconds,
            }),
          ]
        );

        logger.error('Provider exception (retryable)', {
          messageId: message.id,
          error: error.message,
          nextAttempt: nextAttempt.toISOString(),
          backoffSeconds,
        });
      }
    }

    // Commit the transaction
    await client.query('COMMIT');
  } catch (error: any) {
    // Rollback on error
    await client.query('ROLLBACK');
    logger.error('Error processing batch', { error: error.message });
  } finally {
    // Always release the client back to the pool
    client.release();
  }
}

/**
 * Phase 3: Worker metrics (for heartbeat logging)
 */
interface WorkerMetrics {
  messagesProcessed: number;
  messagesFailed: number;
  messagesRetried: number;
  lastHeartbeat: number;
}

const metrics: WorkerMetrics = {
  messagesProcessed: 0,
  messagesFailed: 0,
  messagesRetried: 0,
  lastHeartbeat: Date.now(),
};

/**
 * Phase 3: Enhanced processBatch with metrics tracking
 */
async function processBatchWithMetrics(): Promise<void> {
  const startTime = Date.now();

  try {
    await processBatch();
  } catch (error: any) {
    logger.error('Batch processing error', { error: error.message });
  }

  // Update heartbeat log every 30 seconds
  const now = Date.now();
  if (now - metrics.lastHeartbeat >= 30000) {
    logger.info('Worker heartbeat', {
      uptime_seconds: Math.floor((now - metrics.lastHeartbeat) / 1000),
      messages_processed: metrics.messagesProcessed,
      messages_failed: metrics.messagesFailed,
      messages_retried: metrics.messagesRetried,
      last_batch_duration_ms: now - startTime,
    });

    metrics.lastHeartbeat = now;
  }
}

/**
 * Phase 3: Startup validation
 */
function validateWorkerConfiguration(): void {
  logger.info('Worker startup validation');

  // Warn if batch size seems unsafe
  if (config.worker.batchSize > 100) {
    logger.warn('Large batch size detected - may cause transaction timeouts', {
      batchSize: config.worker.batchSize,
      recommended: 10,
    });
  }

  // Warn if poll interval is too aggressive
  if (config.worker.pollIntervalMs < 100) {
    logger.warn('Very aggressive poll interval - may cause database load', {
      pollIntervalMs: config.worker.pollIntervalMs,
      recommended: 1000,
    });
  }

  logger.info('Worker configuration validated');
}

/**
 * Worker loop
 * Polls for messages at regular intervals
 * Phase 3: Added heartbeat logging and graceful shutdown
 */
/**
 * Janitor: Clean up old data
 * Deletes events and terminal messages older than 30 days
 */
async function runJanitor(): Promise<void> {
  const client = await getClient();
  try {
    const days = 30; // Hard retention requirement
    logger.info('Janitor starting cleanup', { days });

    // 1. Delete old events (batches of 1000)
    let deletedEvents = 0;
    while (true) {
      const result = await client.query(
        `DELETE FROM events 
         WHERE id IN (
            SELECT id FROM events 
            WHERE created_at < NOW() - INTERVAL '${days} days' 
            LIMIT 1000
         )`
      );
      const count = result.rowCount || 0;
      deletedEvents += count;
      if (count === 0) break;
      await new Promise(r => setTimeout(r, 100)); // Breathing room
    }

    // 2. Delete old terminal messages (batches of 1000)
    let deletedMessages = 0;
    while (true) {
      const result = await client.query(
        `DELETE FROM messages 
         WHERE id IN (
            SELECT id FROM messages 
            WHERE status IN ('delivered', 'failed', 'dead')
              AND created_at < NOW() - INTERVAL '${days} days'
            LIMIT 1000
         )`
      );
      const count = result.rowCount || 0;
      deletedMessages += count;
      if (count === 0) break;
      await new Promise(r => setTimeout(r, 100));
    }

    if (deletedEvents > 0 || deletedMessages > 0) {
      logger.info('Janitor cleanup complete', { deletedEvents, deletedMessages });
    }
  } catch (e: any) {
    logger.error('Janitor failed', { error: e.message });
  } finally {
    client.release();
  }
}

let workerInterval: NodeJS.Timeout | null = null;
let janitorInterval: NodeJS.Timeout | null = null;
let isShuttingDown = false;

export async function startWorker(): Promise<void> {
  logger.info('Worker started', {
    pollIntervalMs: config.worker.pollIntervalMs,
    batchSize: config.worker.batchSize,
  });

  // Phase 3: Startup validation
  validateWorkerConfiguration();

  // Schedule Janitor (Phase 5)
  // Run once on startup (after 10s delay), then every hour
  setTimeout(runJanitor, 10000);
  janitorInterval = setInterval(runJanitor, 60 * 60 * 1000);

  // Simple polling loop
  // In production, consider using Postgres LISTEN/NOTIFY for immediate processing
  workerInterval = setInterval(async () => {
    if (isShuttingDown) {
      logger.info('Worker is shutting down, skipping polling');
      return;
    }

    try {
      await processBatchWithMetrics();
    } catch (error: any) {
      logger.error('Worker loop error', { error: error.message });
    }
  }, config.worker.pollIntervalMs);

  logger.info('Worker polling started');

  // Phase 3: Graceful shutdown handling
  const shutdown = async () => {
    logger.info('Worker received shutdown signal');
    isShuttingDown = true;

    if (workerInterval) {
      clearInterval(workerInterval);
      logger.info('Worker polling stopped');
    }
    if (janitorInterval) {
      clearInterval(janitorInterval);
    }

    // Wait for current batch to complete (max 5 seconds)
    await new Promise((resolve) => setTimeout(resolve, 5000));

    logger.info('Worker shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
