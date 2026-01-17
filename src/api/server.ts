import express, { Request, Response } from 'express';
import { config } from '../config';
import { logger } from '../lib/logger';
import { getSupabaseClient, rpc } from '../lib/db';
import { authMiddleware, AuthenticatedRequest } from './auth';
import { checkMonthlyQuota, checkRateLimit } from './limits';
// import adminRoutes from '../../admin/routes';

const app = express();

// Middleware
app.use(express.json({ limit: '100kb' })); // Phase 3: Limit JSON body size

// Mount admin routes (Disabled for V2 refactor)
// app.use('/v1/admin', adminRoutes);

// Mount customer routes (Phase 4)
import customerRoutes from './routes';
app.use('/v1', customerRoutes);

// Health check endpoint (no auth required)
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'orbicloud-api',
  });
});

// ... (routes omitted) ...

// Function removed (duplicate)


/**
 * POST /v1/messages
 * 
 * Accepts a message payload, validates it, inserts into database with status=queued,
 * creates a "requested" event, and returns 202 Accepted.
 * 
 * Features:
 * - API key authentication
 * - Idempotency via optional idempotency_key
 * - Monthly quota enforcement
 * - Per-minute rate limiting
 * 
 * Provider selection: STUBBED - will use global Google Email API later
 */
app.post('/v1/messages', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { to, from, subject, body, idempotency_key } = req.body;
    const projectId = (req as AuthenticatedRequest).projectId;
    const supabase = getSupabaseClient();

    // Basic validation
    if (!to || !from || !body) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Missing required fields: to, from, body',
      });
    }

    // TODO: Validate email format

    // Phase 3: Check project status (enforce suspension)
    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('status')
      .eq('id', projectId)
      .single();

    if (projectError || !projectData) {
      logger.error('Project lookup failed', { error: projectError?.message, projectId });
      return res.status(500).json({
        error: 'internal_error',
        message: 'Internal server error',
      });
    }

    if (projectData.status === 'suspended') {
      logger.warn('Message rejected: project suspended', { projectId });
      return res.status(403).json({
        error: 'project_suspended',
        message: 'This project is suspended',
      });
    }

    // Check monthly quota
    const quotaCheck = await checkMonthlyQuota(projectId);
    if (quotaCheck.exceeded) {
      logger.warn('Monthly quota exceeded', {
        projectId,
        current: quotaCheck.current,
        limit: quotaCheck.limit,
      });

      return res.status(429).json({
        error: 'monthly_quota_exceeded',
        message: `Monthly quota exceeded. Limit: ${quotaCheck.limit}, Current: ${quotaCheck.current}`,
        quota: {
          limit: quotaCheck.limit,
          current: quotaCheck.current,
        },
      });
    }

    // Check rate limit (per minute)
    const rateLimitCheck = await checkRateLimit(projectId);
    if (rateLimitCheck.exceeded) {
      logger.warn('Rate limit exceeded', {
        projectId,
        current: rateLimitCheck.current,
        limit: rateLimitCheck.limit,
      });

      return res.status(429).json({
        error: 'rate_limit_exceeded',
        message: `Rate limit exceeded. You have exceeded your per-minute limit of ${rateLimitCheck.limit} messages`,
        rate_limit: {
          limit: rateLimitCheck.limit,
          current: rateLimitCheck.current,
          window: 'per_minute',
        },
      });
    }

    // Idempotency check: If idempotency_key provided, check for existing message
    if (idempotency_key) {
      const { data: existingMessages, error: idempError } = await supabase
        .from('messages')
        .select('id, status')
        .eq('project_id', projectId)
        .eq('idempotency_key', idempotency_key);

      if (idempError) {
        logger.error('Idempotency check failed', { error: idempError.message, projectId });
        return res.status(500).json({
          error: 'internal_error',
          message: 'Internal server error',
        });
      }

      if (existingMessages && existingMessages.length > 0) {
        logger.info('Duplicate idempotency_key detected, returning existing message', {
          messageId: existingMessages[0].id,
          idempotencyKey: idempotency_key,
          projectId,
        });

        return res.status(200).json({
          message_id: existingMessages[0].id,
          status: existingMessages[0].status,
          duplicate: true,
        });
      }
    }

    // Insert message with status=queued AND create "requested" event atomically
    const result = await rpc<{ message_id: string; status: string; is_duplicate: boolean }>(
      'create_message_with_event',
      {
        p_project_id: projectId,
        p_type: 'email',
        p_from: from,
        p_to: to,
        p_subject: subject || null,
        p_body: body,
        p_idempotency_key: idempotency_key || null
      }
    );

    if (!result || result.length === 0) {
      logger.error('Message creation failed - no result from RPC', { projectId });
      return res.status(500).json({
        error: 'internal_error',
        message: 'Internal server error',
      });
    }

    const messageId = result[0].message_id;

    logger.info('Message queued', { messageId, projectId, to, from });

    // Return 202 Accepted with message ID
    res.status(202).json({
      message_id: messageId,
      status: 'queued',
    });
  } catch (error: any) {
    logger.error('Failed to queue message', { error: error.message });
    res.status(500).json({
      error: 'internal_error',
      message: 'Internal server error',
    });
  }
});


// Phase 5: Global Error Handler
// Ensures no HTML stack traces or plaintext errors leak to users
app.use((err: any, req: Request, res: Response, next: any) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    error: 'internal_error',
    message: 'Internal server error',
  });
});

export function startServer(): void {
  const server = app.listen(config.api.port, () => {
    logger.info(`API server listening on port ${config.api.port}`);
  });

  // Phase 3: Graceful shutdown for API
  const shutdown = () => {
    logger.info('API server received shutdown signal');
    server.close(() => {
      logger.info('API server closed');
      // process.exit(0) managed by worker or main process if needed, 
      // but here we exit to ensure container stops.
      process.exit(0);
    });

    // Force close after 10s
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
