import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getSupabaseClient } from '../lib/db';
import { logger } from '../lib/logger';

// Extend Express Request to include project context
export interface AuthenticatedRequest extends Request {
  projectId: string;
  apiKeyId: string;
}

/**
 * Hash an API key using SHA-256
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a new API key
 */
export function generateApiKey(): { key: string; hash: string } {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const key = `orbi_${randomBytes}`;
  const hash = hashApiKey(key);
  return { key, hash };
}

/**
 * Authentication middleware - using Supabase client
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }

    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Invalid Authorization format. Use: Bearer <api_key>' });
      return;
    }

    const apiKey = authHeader.substring(7);

    if (!apiKey || apiKey.length < 10) {
      res.status(401).json({ error: 'Invalid API key format' });
      return;
    }

    const keyHash = hashApiKey(apiKey);
    const supabase = getSupabaseClient();

    // Lookup API key
    const { data: keyRecords, error: keyError } = await supabase
      .from('api_keys')
      .select('id, project_id, revoked_at')
      .eq('key_hash', keyHash);

    if (keyError) {
      logger.error('API key lookup failed', { error: keyError.message });
      res.status(500).json({ error: 'Authentication failed' });
      return;
    }

    if (!keyRecords || keyRecords.length === 0) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    const keyRecord = keyRecords[0];

    if (keyRecord.revoked_at) {
      res.status(401).json({ error: 'API key has been revoked' });
      return;
    }

    // Check project status
    const { data: projectRecords, error: projectError } = await supabase
      .from('projects')
      .select('status')
      .eq('id', keyRecord.project_id);

    if (projectError) {
      logger.error('Project lookup failed', { error: projectError.message });
      res.status(500).json({ error: 'Authentication failed' });
      return;
    }

    if (!projectRecords || projectRecords.length === 0 || projectRecords[0].status !== 'active') {
      res.status(403).json({ error: 'Project is not active' });
      return;
    }

    // Update last_used_at (fire and forget)
    void supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyRecord.id);

    // Attach project context
    (req as AuthenticatedRequest).projectId = keyRecord.project_id;
    (req as AuthenticatedRequest).apiKeyId = keyRecord.id;

    next();
  } catch (error: any) {
    logger.error('Auth middleware error', { error: error.message });
    res.status(500).json({ error: 'Authentication failed' });
  }
}
