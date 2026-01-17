/**
 * Project Handlers
 * 
 * WHY: Handle admin endpoints for project management
 * RESPONSIBILITY: List projects, get project details
 */

import { Request, Response } from 'express';
import { logger } from '../../../admin/lib/logger';
import * as queries from '../queries';

/**
 * Validation helpers
 */
function validatePagination(limit?: string, offset?: string): { limit: number; offset: number } {
  const parsedLimit = limit ? parseInt(limit, 10) : 50;
  const parsedOffset = offset ? parseInt(offset, 10) : 0;

  // Validate limit: default 50, max 100
  const validLimit = Math.min(Math.max(1, parsedLimit), 100);

  // Validate offset: must be >= 0
  const validOffset = Math.max(0, parsedOffset);

  return { limit: validLimit, offset: validOffset };
}

/**
 * GET /v1/admin/projects
 * List all projects with current usage snapshot
 */
export async function listProjects(req: Request, res: Response): Promise<void> {
  try {
    const { status, limit, offset } = req.query;

    // Validate pagination
    const pagination = validatePagination(limit as string, offset as string);

    // Validate status filter
    const validStatuses = ['active', 'suspended'];
    const statusFilter =
      status && validStatuses.includes(status as string) ? (status as string) : null;

    // Get projects with usage
    const projects = await queries.getProjectsWithUsage(statusFilter, pagination);

    // Get total count
    const total = await queries.getTotalProjectsCount(statusFilter);

    // Transform response
    const response = {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        owner_email: p.owner_email,
        status: p.status,
        created_at: p.created_at,
        limits: {
          monthly_limit: p.monthly_limit,
          rate_limit_per_minute: p.rate_limit_per_minute,
        },
        usage_current_month: {
          total: p.usage_current_month,
        },
        quota_remaining:
          p.monthly_limit !== null ? p.monthly_limit - p.usage_current_month : null,
      })),
      pagination: {
        total,
        limit: pagination.limit,
        offset: pagination.offset,
        has_more: pagination.offset + pagination.limit < total,
      },
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Failed to list projects', { error: error.message });
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to list projects',
    });
  }
}

/**
 * GET /v1/admin/projects/:id
 * Get detailed project information
 */
export async function getProject(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // Get project
    const project = await queries.getProjectById(id);

    if (!project) {
      res.status(404).json({
        error: 'not_found',
        message: 'Project not found',
      });
      return;
    }

    // Get current month usage by type
    const currentPeriod = new Date().toISOString().slice(0, 7);
    const usageByType = await queries.getProjectUsageByType(id, currentPeriod);

    // Get usage by status (current month)
    const usageByStatus = await queries.getProjectUsageByStatus(id);

    // Get API keys
    const apiKeys = await queries.getProjectApiKeys(id);

    // Get current rate limit
    const rateLimit = await queries.getCurrentRateLimit(id);

    // Calculate totals
    const totalUsage = usageByType.reduce((sum, u) => sum + u.count, 0);
    const byType: Record<string, number> = {};
    usageByType.forEach((u) => {
      byType[u.message_type] = u.count;
    });

    const byStatus: Record<string, number> = {};
    usageByStatus.forEach((u) => {
      byStatus[u.status] = u.count;
    });

    // Build response
    const response = {
      id: project.id,
      name: project.name,
      owner_email: project.owner_email,
      status: project.status,
      created_at: project.created_at,
      limits: {
        monthly_limit: project.monthly_limit,
        rate_limit_per_minute: project.rate_limit_per_minute,
      },
      usage_current_month: {
        period: currentPeriod,
        total: totalUsage,
        by_type: {
          email: byType.email || 0,
          sms: byType.sms || 0,
          whatsapp: byType.whatsapp || 0,
          push: byType.push || 0,
        },
        by_status: {
          delivered: byStatus.delivered || 0,
          failed: byStatus.failed || 0,
          queued: byStatus.queued || 0,
          dead: byStatus.dead || 0,
        },
      },
      quota_remaining: project.monthly_limit !== null ? project.monthly_limit - totalUsage : null,
      api_keys: apiKeys.map((k) => ({
        id: k.id,
        name: k.name,
        created_at: k.created_at,
        last_used_at: k.last_used_at,
        revoked_at: k.revoked_at,
      })),
      rate_limit_current_minute: rateLimit
        ? {
          count: rateLimit.count,
          limit: project.rate_limit_per_minute,
          window: rateLimit.minute_window,
        }
        : null,
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Failed to get project', { error: error.message, projectId: req.params.id });
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to get project',
    });
  }
}
