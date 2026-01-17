/**
 * Write Handlers - Project Updates
 * 
 * WHY: Handle WRITE operations for project management
 * RESPONSIBILITY: Update project status, limits, and tier
 * 
 * All handlers require WRITE scope (enforced by middleware)
 */

import { Request, Response } from 'express';
import { logger } from '../../../admin/lib/logger';
import * as queries from '../queries';
import { getTierById } from '../tiers';
import { logAdminEvent } from '../audit';

/**
 * PATCH /v1/admin/projects/:id/status
 * Update project status (suspend/activate)
 */
export async function updateProjectStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id: projectId } = req.params;
    const { status } = req.body;

    // Validate status field
    if (!status) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Missing required field: status',
      });
      return;
    }

    // Validate status value
    const validStatuses = ['active', 'suspended'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({
        error: 'validation_error',
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
      return;
    }

    // Check project exists
    const project = await queries.getProjectById(projectId);
    if (!project) {
      res.status(404).json({
        error: 'not_found',
        message: 'Project not found',
      });
      return;
    }

    // Update status
    const updated = await queries.updateProjectStatus(projectId, status);

    // Phase 3: Audit log (best-effort, non-blocking)
    logAdminEvent({
      adminScope: 'write',
      action: status === 'suspended' ? 'project.suspended' : 'project.activated',
      projectId,
      metadata: {
        old_status: project.status,
        new_status: status,
      },
    });

    logger.info('Project status updated', {
      projectId,
      oldStatus: project.status,
      newStatus: status,
    });

    res.json({
      id: updated.id,
      name: updated.name,
      owner_email: updated.owner_email,
      status: updated.status,
    });
  } catch (error: any) {
    logger.error('Failed to update project status', {
      error: error.message,
      projectId: req.params.id,
    });
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to update project status',
    });
  }
}

/**
 * PATCH /v1/admin/projects/:id/limits
 * Update project limits (monthly quota and/or rate limit)
 */
export async function updateProjectLimits(req: Request, res: Response): Promise<void> {
  try {
    const { id: projectId } = req.params;
    const { monthly_limit, rate_limit_per_minute } = req.body;

    // Validate: at least one field required
    if (monthly_limit === undefined && rate_limit_per_minute === undefined) {
      res.status(400).json({
        error: 'validation_error',
        message: 'At least one field is required: monthly_limit, rate_limit_per_minute',
      });
      return;
    }

    // Validate monthly_limit
    if (monthly_limit !== undefined && monthly_limit !== null) {
      if (typeof monthly_limit !== 'number' || monthly_limit < 0) {
        res.status(400).json({
          error: 'validation_error',
          message: 'monthly_limit must be null or a non-negative integer',
        });
        return;
      }
    }

    // Validate rate_limit_per_minute
    if (rate_limit_per_minute !== undefined && rate_limit_per_minute !== null) {
      if (typeof rate_limit_per_minute !== 'number' || rate_limit_per_minute < 1) {
        res.status(400).json({
          error: 'validation_error',
          message: 'rate_limit_per_minute must be null or an integer >= 1',
        });
        return;
      }
    }

    // Check project exists
    const project = await queries.getProjectById(projectId);
    if (!project) {
      res.status(404).json({
        error: 'not_found',
        message: 'Project not found',
      });
      return;
    }

    // Safety check: monthly_limit must be >= current usage
    if (monthly_limit !== undefined && monthly_limit !== null) {
      const currentUsage = await queries.getCurrentMonthUsage(projectId);

      if (monthly_limit < currentUsage) {
        res.status(400).json({
          error: 'limit_below_usage',
          message: `Cannot set monthly_limit to ${monthly_limit}. Current usage this month: ${currentUsage}`,
          current_usage: currentUsage,
          requested_limit: monthly_limit,
        });
        return;
      }
    }

    // Update limits
    const updated = await queries.updateProjectLimits(projectId, monthly_limit, rate_limit_per_minute);

    // Phase 3: Audit log (best-effort, non-blocking)
    logAdminEvent({
      adminScope: 'write',
      action: 'project.limits.updated',
      projectId,
      metadata: {
        old_monthly_limit: project.monthly_limit,
        new_monthly_limit: updated.monthly_limit,
        old_rate_limit: project.rate_limit_per_minute,
        new_rate_limit: updated.rate_limit_per_minute,
      },
    });

    logger.info('Project limits updated', {
      projectId,
      monthly_limit: updated.monthly_limit,
      rate_limit_per_minute: updated.rate_limit_per_minute,
    });

    res.json({
      id: updated.id,
      name: updated.name,
      limits: {
        monthly_limit: updated.monthly_limit,
        rate_limit_per_minute: updated.rate_limit_per_minute,
      },
    });
  } catch (error: any) {
    logger.error('Failed to update project limits', {
      error: error.message,
      projectId: req.params.id,
    });
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to update project limits',
    });
  }
}

/**
 * PATCH /v1/admin/projects/:id/tier
 * Apply a pricing tier to a project
 */
export async function updateProjectTier(req: Request, res: Response): Promise<void> {
  try {
    const { id: projectId } = req.params;
    const { tier: tierId } = req.body;

    // Validate tier field
    if (!tierId) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Missing required field: tier',
      });
      return;
    }

    // Validate tier exists
    const tier = getTierById(tierId);
    if (!tier) {
      res.status(400).json({
        error: 'validation_error',
        message: `Invalid tier: ${tierId}. Valid tiers: free, starter, pro, enterprise`,
      });
      return;
    }

    // Check project exists
    const project = await queries.getProjectById(projectId);
    if (!project) {
      res.status(404).json({
        error: 'not_found',
        message: 'Project not found',
      });
      return;
    }

    // Safety check: tier's monthly_limit must be >= current usage (if not null)
    if (tier.limits.monthly_limit !== null) {
      const currentUsage = await queries.getCurrentMonthUsage(projectId);

      if (tier.limits.monthly_limit < currentUsage) {
        res.status(400).json({
          error: 'tier_below_usage',
          message: `Cannot apply tier "${tier.name}". Tier limit: ${tier.limits.monthly_limit}, Current usage: ${currentUsage}`,
          tier_limit: tier.limits.monthly_limit,
          current_usage: currentUsage,
        });
        return;
      }
    }

    // Apply tier limits
    const updated = await queries.applyTierToProject(
      projectId,
      tier.limits.monthly_limit,
      tier.limits.rate_limit_per_minute
    );

    // Phase 3: Audit log (best-effort, non-blocking)
    logAdminEvent({
      adminScope: 'write',
      action: 'project.tier.applied',
      projectId,
      metadata: {
        tier: tier.id,
        old_monthly_limit: project.monthly_limit,
        new_monthly_limit: updated.monthly_limit,
        old_rate_limit: project.rate_limit_per_minute,
        new_rate_limit: updated.rate_limit_per_minute,
      },
    });

    logger.info('Tier applied to project', {
      projectId,
      tier: tier.id,
      monthly_limit: updated.monthly_limit,
      rate_limit_per_minute: updated.rate_limit_per_minute,
    });

    res.json({
      id: updated.id,
      name: updated.name,
      tier: tier.id,
      limits: {
        monthly_limit: updated.monthly_limit,
        rate_limit_per_minute: updated.rate_limit_per_minute,
      },
    });
  } catch (error: any) {
    logger.error('Failed to apply tier to project', {
      error: error.message,
      projectId: req.params.id,
    });
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to apply tier',
    });
  }
}
