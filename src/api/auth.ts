/**
 * API Key Authentication Middleware
 * 
 * WHY: Authenticates requests using Bearer token in Authorization header.
 * RESPONSIBILITY: 
 *   - Extract API key from header
 *   - Hash and lookup in database
 *   - Reject revoked or invalid keys
 *   - Attach project_id to request for downstream handlers
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { query } from '../admin/lib/db';
import { logger } from '../admin/lib/logger';

// Extend Express Request to include project context
export interface AuthenticatedRequest extends Request {
  projectId: string;
  apiKeyId: string;
}

interface ApiKeyRow {
  id: string;
  project_id: string;
  revoked_at: string | null;
}

interface ProjectRow {
  status: string;
}

/**
 * Hash an API key using SHA-256
 * We never store plaintext keys - only hashes
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a new API key
 * Format: orbi_<random_hex>
 * Returns both the plaintext key (to show user once) and the hash (to store)
 */
export function generateApiKey(): { key: string; hash: string } {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const key = `orbi_${randomBytes}`;
  const hash = hashApiKey(key);
  return { key, hash };
}

/**
 * Authentication middleware
 * Validates Bearer token and attaches project context to request
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }

    // Must be Bearer token
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Invalid Authorization format. Use: Bearer <api_key>' });
      return;
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!apiKey || apiKey.length < 10) {
      res.status(401).json({ error: 'Invalid API key format' });
      return;
    }

    // Hash the key and lookup in database
    const keyHash = hashApiKey(apiKey);

    const keyRows = await query<ApiKeyRow>(
      `SELECT id, project_id, revoked_at 
       FROM api_keys 
       WHERE key_hash = $1`,
      [keyHash]
    );

    if (keyRows.length === 0) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    const keyRecord = keyRows[0];

    // Check if key is revoked
    if (keyRecord.revoked_at) {
      res.status(401).json({ error: 'API key has been revoked' });
      return;
    }

    // Check if project is active
    const projectRows = await query<ProjectRow>(
      `SELECT status FROM projects WHERE id = $1`,
      [keyRecord.project_id]
    );

    if (projectRows.length === 0 || projectRows[0].status !== 'active') {
      res.status(403).json({ error: 'Project is not active' });
      return;
    }

    // Update last_used_at (fire and forget - don't block the request)
    query(
      `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
      [keyRecord.id]
    ).catch((err) => {
      logger.warn('Failed to update last_used_at', { error: err.message });
    });

    // Attach project context to request
    (req as AuthenticatedRequest).projectId = keyRecord.project_id;
    (req as AuthenticatedRequest).apiKeyId = keyRecord.id;

    next();
  } catch (error: any) {
    logger.error('Auth middleware error', { error: error.message });
    res.status(500).json({ error: 'Authentication failed' });
  }
}
