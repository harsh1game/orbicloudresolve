/**
 * Usage Handlers
 * 
 * WHY: Handle admin endpoints for usage analytics
 * RESPONSIBILITY: Current usage, historical usage
 */

import { Request, Response } from 'express';
import { logger } from '../../../admin/lib/logger';
import * as queries from '../queries';

/**
 * GET /v1/admin/projects/:id/usage
 * Get current month usage breakdown
 */
export async function getCurrentUsage(req: Request, res: Response): Promise<void> {
  try {
    const { id: projectId } = req.params;

    // Get project to verify existence
    const project = await queries.getProjectById(projectId);

    if (!project) {
      res.status(404).json({
        error: 'not_found',
        message: 'Project not found',
      });
      return;
    }

    const currentPeriod = new Date().toISOString().slice(0, 7);

    // Get usage
    const usage = await queries.getCurrentUsage(projectId);

    // Build by_type object
    const byType: Record<string, number> = {
      email: 0,
      sms: 0,
      whatsapp: 0,
      push: 0,
    };

    let total = 0;
    usage.forEach((u) => {
      byType[u.message_type] = u.count;
      total += u.count;
    });

    // Calculate quota remaining
    const quotaRemaining =
      project.monthly_limit !== null ? project.monthly_limit - total : null;

    const usagePercent =
      project.monthly_limit !== null && project.monthly_limit > 0
        ? Math.round((total / project.monthly_limit) * 10000) / 100
        : null;

    const response = {
      project_id: projectId,
      period: currentPeriod,
      total,
      by_type: byType,
      limits: {
        monthly_limit: project.monthly_limit,
        rate_limit_per_minute: project.rate_limit_per_minute,
      },
      quota_remaining: quotaRemaining,
      usage_percent: usagePercent,
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Failed to get current usage', {
      error: error.message,
      projectId: req.params.id,
    });
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to get current usage',
    });
  }
}

/**
 * GET /v1/admin/projects/:id/usage/history
 * Get historical usage for last N months
 */
export async function getUsageHistory(req: Request, res: Response): Promise<void> {
  try {
    const { id: projectId } = req.params;
    const { months } = req.query;

    // Get project to verify existence
    const project = await queries.getProjectById(projectId);

    if (!project) {
      res.status(404).json({
        error: 'not_found',
        message: 'Project not found',
      });
      return;
    }

    // Validate months param
    const parsedMonths = months ? parseInt(months as string, 10) : 6;
    const validMonths = Math.min(Math.max(1, parsedMonths), 12); // between 1 and 12

    // Get usage history
    const usage = await queries.getUsageHistory(projectId, validMonths);

    // Group by period
    const historyMap: Record<
      string,
      { period: string; total: number; by_type: Record<string, number>; limit: number | null }
    > = {};

    usage.forEach((u) => {
      if (!historyMap[u.period]) {
        historyMap[u.period] = {
          period: u.period,
          total: 0,
          by_type: {},
          limit: project.monthly_limit,
        };
      }
      historyMap[u.period].by_type[u.message_type] = u.count;
      historyMap[u.period].total += u.count;
    });

    // Convert to array and sort
    const history = Object.values(historyMap).sort((a, b) => a.period.localeCompare(b.period));

    const response = {
      project_id: projectId,
      history,
      months: validMonths,
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Failed to get usage history', {
      error: error.message,
      projectId: req.params.id,
    });
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to get usage history',
    });
  }
}
