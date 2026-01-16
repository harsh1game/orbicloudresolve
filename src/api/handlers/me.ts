/**
 * Customer Handlers: Identity & Limits
 */
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../auth';
import * as queries from '../queries'; // Customer queries

export async function getMe(req: Request, res: Response) {
  const projectId = (req as AuthenticatedRequest).projectId;

  try {
    const project = await queries.getProjectIdentity(projectId);

    if (!project) {
      // Should not happen for authenticated requests
      return res.status(404).json({ error: 'project_not_found' });
    }

    res.json({
      id: project.id,
      name: project.name,
      status: project.status,
      limits: {
        monthly: project.monthly_limit,
        rate_per_minute: project.rate_limit_per_minute
      },
      usage: {
        current_month: project.current_usage,
        remaining: project.monthly_limit ? Math.max(0, project.monthly_limit - project.current_usage) : null
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'internal_error' });
  }
}
