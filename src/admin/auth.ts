/**
 * Admin Authentication Middleware
 * 
 * WHY: Secure admin API with read/write scope separation
 * RESPONSIBILITY: 
 *   - Validate admin API keys
 *   - Determine scope (read vs write)
 *   - Attach admin context to request
 *   - Provide scope-checking helpers
 * 
 * SECURITY MODEL:
 *   - Two static API keys: READ and WRITE
 *   - READ: Can view all data, cannot modify
 *   - WRITE: Full access (inherits READ + can modify)
 *   - Keys loaded from environment variables
 *   - Bearer token authentication
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../lib/logger';

/**
 * Admin scope types
 */
export type AdminScope = 'read' | 'write';

/**
 * Extended Request with admin context
 */
export interface AdminRequest extends Request {
  admin: {
    scope: AdminScope;
    authenticated: boolean;
  };
}

/**
 * Standard admin error response
 */
function sendAdminError(
  res: Response,
  statusCode: number,
  error: string,
  message: string
): void {
  res.status(statusCode).json({
    error,
    message,
  });
}

/**
 * Main admin authentication middleware
 * 
 * Validates Bearer token and determines scope
 * Attaches admin context to request
 * 
 * Usage:
 *   router.use(adminAuth);
 */
export function adminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  // Check if Authorization header exists
  if (!authHeader) {
    logger.warn('Admin auth failed: Missing Authorization header', {
      path: req.path,
      method: req.method,
    });

    sendAdminError(
      res,
      401,
      'unauthorized',
      'Missing Authorization header. Use: Authorization: Bearer <admin_key>'
    );
    return;
  }

  // Check Bearer format
  if (!authHeader.startsWith('Bearer ')) {
    logger.warn('Admin auth failed: Invalid Authorization format', {
      path: req.path,
      method: req.method,
    });

    sendAdminError(
      res,
      401,
      'unauthorized',
      'Invalid Authorization format. Use: Authorization: Bearer <admin_key>'
    );
    return;
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  // Validate token is not empty
  if (!token || token.length < 10) {
    logger.warn('Admin auth failed: Invalid token', {
      path: req.path,
      method: req.method,
    });

    sendAdminError(res, 401, 'unauthorized', 'Invalid admin API key');
    return;
  }

  // Check against READ key
  if (token === config.admin.apiKeyRead) {
    (req as AdminRequest).admin = {
      scope: 'read',
      authenticated: true,
    };

    logger.info('Admin authenticated (READ scope)', {
      path: req.path,
      method: req.method,
      scope: 'read',
    });

    next();
    return;
  }

  // Check against WRITE key
  if (token === config.admin.apiKeyWrite) {
    (req as AdminRequest).admin = {
      scope: 'write',
      authenticated: true,
    };

    logger.info('Admin authenticated (WRITE scope)', {
      path: req.path,
      method: req.method,
      scope: 'write',
    });

    next();
    return;
  }

  // No match - invalid key
  logger.warn('Admin auth failed: Invalid API key', {
    path: req.path,
    method: req.method,
  });

  sendAdminError(res, 401, 'unauthorized', 'Invalid admin API key');
}

/**
 * Require specific admin scope middleware
 * 
 * Use after adminAuth middleware to enforce scope requirements
 * 
 * Usage:
 *   router.patch('/projects/:id', adminAuth, requireWriteScope, updateProject);
 */
export function requireWriteScope(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const adminReq = req as AdminRequest;

  if (!adminReq.admin || !adminReq.admin.authenticated) {
    sendAdminError(res, 401, 'unauthorized', 'Authentication required');
    return;
  }

  if (adminReq.admin.scope !== 'write') {
    logger.warn('Admin auth failed: Insufficient scope', {
      path: req.path,
      method: req.method,
      required: 'write',
      actual: adminReq.admin.scope,
    });

    sendAdminError(
      res,
      403,
      'forbidden',
      'Write scope required. Use ADMIN_API_KEY_WRITE for this operation.'
    );
    return;
  }

  next();
}

/**
 * Optional: Helper to check if request has admin auth
 * Useful for conditional logic
 */
export function hasAdminAuth(req: Request): boolean {
  const adminReq = req as AdminRequest;
  return adminReq.admin?.authenticated === true;
}

/**
 * Optional: Helper to get admin scope
 */
export function getAdminScope(req: Request): AdminScope | null {
  const adminReq = req as AdminRequest;
  return adminReq.admin?.scope || null;
}
