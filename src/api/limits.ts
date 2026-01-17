/**
 * Project Limits Enforcement
 * 
 * WHY: Prevent abuse and enforce fair usage policies
 * RESPONSIBILITY: Check monthly quotas and rate limits before accepting messages
 * 
 * Uses Postgres only - no Redis, no in-memory caches
 * Safe under high concurrency
 */

import { query, getClient } from '../admin/lib/db';
import { logger } from '../admin/lib/logger';

interface Project {
  monthly_limit: number | null;
  rate_limit_per_minute: number | null;
}

/**
 * Check if project has exceeded monthly quota
 * Returns true if over limit, false if OK
 */
export async function checkMonthlyQuota(projectId: string): Promise<{ exceeded: boolean; current: number; limit: number | null }> {
  // Get current period (YYYY-MM)
  const period = new Date().toISOString().slice(0, 7);

  // Get project limits
  const projectRows = await query<Project>(
    'SELECT monthly_limit FROM projects WHERE id = $1',
    [projectId]
  );

  if (projectRows.length === 0) {
    throw new Error('Project not found');
  }

  const monthlyLimit = projectRows[0].monthly_limit;

  // NULL = unlimited
  if (monthlyLimit === null) {
    return { exceeded: false, current: 0, limit: null };
  }

  // Get current month's usage across all message types
  const usageRows = await query<{ total: number }>(
    `SELECT COALESCE(SUM(count), 0)::integer as total 
     FROM usage 
     WHERE project_id = $1 AND period = $2`,
    [projectId, period]
  );

  const currentUsage = usageRows[0].total;

  return {
    exceeded: currentUsage >= monthlyLimit,
    current: currentUsage,
    limit: monthlyLimit,
  };
}

/**
 * Check and increment rate limit counter
 * Returns true if rate limit exceeded, false if OK
 * 
 * Uses Postgres UPSERT for atomic increment
 * Sliding window: per project per minute
 */
export async function checkRateLimit(projectId: string): Promise<{ exceeded: boolean; current: number; limit: number | null }> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get project rate limit
    const projectRows = await client.query<Project>(
      'SELECT rate_limit_per_minute FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectRows.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Project not found');
    }

    const rateLimit = projectRows.rows[0].rate_limit_per_minute;

    // NULL = unlimited
    if (rateLimit === null) {
      await client.query('COMMIT');
      return { exceeded: false, current: 0, limit: null };
    }

    // Get current minute window (truncate to minute)
    // Example: '2026-01-01 18:52:34' -> '2026-01-01 18:52:00'
    const minuteWindow = new Date();
    minuteWindow.setSeconds(0, 0);

    // Increment counter for this minute window
    // UPSERT: insert if not exists, increment if exists
    const result = await client.query<{ count: number }>(
      `INSERT INTO rate_limit_tracking (project_id, minute_window, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (project_id, minute_window)
       DO UPDATE SET count = rate_limit_tracking.count + 1, updated_at = NOW()
       RETURNING count`,
      [projectId, minuteWindow]
    );

    const currentCount = result.rows[0].count;

    await client.query('COMMIT');

    return {
      exceeded: currentCount > rateLimit,
      current: currentCount,
      limit: rateLimit,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
