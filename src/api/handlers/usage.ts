/**
 * Customer Handlers: Usage Analytics
 * 
 * Read-only access to project usage data.
 */
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../auth';
import * as queries from '../queries';

export async function getCurrentUsage(req: Request, res: Response) {
  const projectId = (req as AuthenticatedRequest).projectId;

  try {
    // Get usage breakdown
    const usage = await queries.getCustomerUsage(projectId);

    // Calculate total
    const total = usage.reduce((sum: number, row: any) => sum + parseInt(row.count, 10), 0);

    // Format response
    const currentPeriod = new Date().toISOString().slice(0, 7);
    const breakdown = usage.reduce((acc: Record<string, number>, row: any) => {
      acc[row.message_type] = parseInt(row.count, 10);
      return acc;
    }, {} as Record<string, number>);

    res.json({
      period: currentPeriod,
      total,
      breakdown
    });
  } catch (error: any) {
    res.status(500).json({ error: 'internal_error' });
  }
}

export async function getUsageHistory(req: Request, res: Response) {
  const projectId = (req as AuthenticatedRequest).projectId;
  const months = Math.min(Math.max(parseInt(req.query.months as string) || 12, 1), 12);

  try {
    const history = await queries.getCustomerUsageHistory(projectId, months);

    // Group by period
    const grouped = history.reduce((acc: Record<string, any>, row: any) => {
      const period = row.period;
      if (!acc[period]) {
        acc[period] = { period, total: 0 };
      }
      acc[period].total += parseInt(row.count, 10);
      return acc;
    }, {} as Record<string, any>);

    const data = Object.values(grouped).sort((a: any, b: any) => a.period.localeCompare(b.period));

    res.json({
      data,
      months_requested: months
    });
  } catch (error: any) {
    res.status(500).json({ error: 'internal_error' });
  }
}
