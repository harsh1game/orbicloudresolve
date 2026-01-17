import { config } from '../config';
import { logger } from '../lib/logger';
import { getSupabaseClient, rpc } from '../lib/db';
import { getProvider } from '../providers/factory';
import { Message } from '../providers/provider';

/**
 * Worker - Supabase REST API version
 * Uses RPC functions for all database operations
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
 * Process a batch of queued messages using RPC
 */
async function processBatch(): Promise<void> {
  try {
    // Dequeue messages (uses FOR UPDATE SKIP LOCKED internally)
    const messages = await rpc<QueuedMessage>('dequeue_messages', {
      batch_size: config.worker.batchSize
    });

    if (!messages || messages.length === 0) {
      return; // No messages to process
    }

    logger.info(`Processing ${messages.length} messages`);

    // Process each message
    for (const message of messages) {
      await processMessage(message);
    }
  } catch (error: any) {
    logger.error('Batch processing failed', { error: error.message });
  }
}

/**
 * Process a single message
 */
async function processMessage(message: QueuedMessage): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    // Check if project is suspended
    const { data: projects } = await supabase
      .from('projects')
      .select('status')
      .eq('id', message.project_id)
      .single();

    if (projects?.status === 'suspended') {
      logger.warn('Skipping message for suspended project', {
        messageId: message.id,
        projectId: message.project_id,
      });

      // Insert skipped event
      await supabase.from('events').insert({
        message_id: message.id,
        project_id: message.project_id,
        event_type: 'skipped',
        provider_response: { reason: 'Project suspended' }
      });

      return;
    }

    // Increment attempts counter
    await rpc('increment_message_attempts', { p_message_id: message.id });

    // Check for dead letter (max attempts exceeded)
    if (message.attempts >= message.max_attempts) {
      logger.warn('Message exceeded max attempts', {
        messageId: message.id,
        attempts: message.attempts,
        maxAttempts: message.max_attempts,
      });

      await rpc('mark_message_dead', {
        p_message_id: message.id,
        p_project_id: message.project_id,
        p_attempts: message.attempts + 1
      });

      return;
    }

    // Get provider and attempt delivery
    const provider = getProvider(message.type);

    const providerMessage: Message = {
      id: message.id,
      project_id: message.project_id,
      type: message.type,
      from_address: message.from_address,
      to_address: message.to_address,
      subject: message.subject,
      body: message.body,
    };

    logger.info('Attempting delivery', {
      messageId: message.id,
      type: message.type,
      attempt: message.attempts + 1,
    });

    const result = await provider.send(providerMessage);

    // Process delivery result
    await rpc('process_message_delivery', {
      p_message_id: message.id,
      p_success: result.success,
      p_retryable: result.retryable || false,
      p_provider_response: result.provider_response || null,
      p_error_message: result.error_message || null,
      p_project_id: message.project_id,
      p_message_type: message.type
    });

    if (result.success) {
      logger.info('Message delivered successfully', { messageId: message.id });
    } else if (result.retryable) {
      logger.warn('Message delivery failed (retryable)', {
        messageId: message.id,
        error: result.error_message,
      });
    } else {
      logger.error('Message delivery failed (permanent)', {
        messageId: message.id,
        error: result.error_message,
      });
    }
  } catch (error: any) {
    logger.error('Message processing error', {
      messageId: message.id,
      error: error.message,
    });

    // Mark as failed with temporary error
    await rpc('process_message_delivery', {
      p_message_id: message.id,
      p_success: false,
      p_retryable: true,
      p_provider_response: null,
      p_error_message: `Internal error: ${error.message}`,
      p_project_id: message.project_id,
      p_message_type: message.type
    }).catch((err: Error) => {
      logger.error('Failed to record error', {
        messageId: message.id,
        error: err.message
      });
    });
  }
}

/**
 * Janitor: Clean up old tracking data
 */
async function runJanitor(): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // Keep 7 days

    // Clean up old rate limit tracking
    const { error: rateLimitError } = await supabase
      .from('rate_limit_tracking')
      .delete()
      .lt('minute_window', cutoffDate.toISOString());

    if (rateLimitError) {
      logger.warn('Janitor: rate limit cleanup failed', {
        error: rateLimitError.message
      });
    } else {
      logger.debug('Janitor: cleaned up old rate limit data');
    }

    // Clean up delivered messages older than 90 days
    const deliveredCutoff = new Date();
    deliveredCutoff.setDate(deliveredCutoff.getDate() - 90);

    const { error: messagesError } = await supabase
      .from('messages')
      .delete()
      .eq('status', 'delivered')
      .lt('updated_at', deliveredCutoff.toISOString());

    if (messagesError) {
      logger.warn('Janitor: message cleanup failed', {
        error: messagesError.message
      });
    } else {
      logger.debug('Janitor: cleaned up old delivered messages');
    }
  } catch (error: any) {
    logger.error('Janitor run failed', { error: error.message });
  }
}

/**
 * Main worker loop
 */
let workerInterval: NodeJS.Timeout | null = null;
let janitorInterval: NodeJS.Timeout | null = null;
let shuttingDown = false;

export async function startWorker(): Promise<void> {
  logger.info('Worker started', {
    pollIntervalMs: config.worker.pollIntervalMs,
    batchSize: config.worker.batchSize,
  });

  // Main processing loop
  workerInterval = setInterval(async () => {
    if (shuttingDown) return;

    try {
      await processBatch();
    } catch (error: any) {
      logger.error('Worker loop error', { error: error.message });
    }
  }, config.worker.pollIntervalMs);

  // Janitor runs every hour
  janitorInterval = setInterval(async () => {
    if (shuttingDown) return;

    try {
      await runJanitor();
    } catch (error: any) {
      logger.error('Janitor error', { error: error.message });
    }
  }, 60 * 60 * 1000);

  // Run janitor immediately on startup
  await runJanitor();

  // Graceful shutdown handler
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info('Worker shutting down...');

    if (workerInterval) clearInterval(workerInterval);
    if (janitorInterval) clearInterval(janitorInterval);

    logger.info('Worker stopped');
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
