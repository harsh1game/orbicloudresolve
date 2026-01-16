/**
 * Admin Audit Logging
 * 
 * WHY: Track admin actions for compliance and debugging
 * RESPONSIBILITY: Write audit events to admin_events table
 * 
 * Design:
 * - Best-effort logging (failures don't block actions)
 * - Simple async fire-and-forget
 * - No retry logic (keeps it lightweight)
 */

import { query } from '../lib/db';
import { logger } from '../lib/logger';

export interface AuditEventParams {
  adminScope: 'read' | 'write';
  action: string;
  projectId: string;
  metadata?: Record<string, any>;
}

/**
 * Log an admin action to admin_events table
 * 
 * This is fire-and-forget: failures are logged but don't throw
 */
export async function logAdminEvent(params: AuditEventParams): Promise<void> {
  try {
    await query(
      `INSERT INTO admin_events (admin_scope, action, project_id, metadata)
       VALUES ($1, $2, $3, $4)`,
      [
        params.adminScope,
        params.action,
        params.projectId,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ]
    );

    logger.info('Admin audit event logged', {
      action: params.action,
      projectId: params.projectId,
    });
  } catch (error: any) {
    // Best-effort: log failure but don't throw
    logger.error('Failed to write admin audit event', {
      error: error.message,
      action: params.action,
      projectId: params.projectId,
    });
  }
}
