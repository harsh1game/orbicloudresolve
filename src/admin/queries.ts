/**
 * Admin SQL Queries
 * 
 * WHY: Centralize all admin-related SQL queries
 * RESPONSIBILITY: Raw SQL queries for admin endpoints
 * 
 * All queries use existing schema - no new tables
 */

import { query } from '../../admin/lib/db';

/**
 * Pagination helper types
 */
export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginationResult {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

/**
 * PROJECT QUERIES
 */

export async function getProjectsWithUsage(
  status: string | null,
  pagination: PaginationParams
): Promise<any[]> {
  const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM

  const rows = await query(
    `SELECT 
      p.id,
      p.name,
      p.owner_email,
      p.status,
      p.monthly_limit,
      p.rate_limit_per_minute,
      p.created_at,
      COALESCE(SUM(u.count), 0)::integer as usage_current_month
    FROM projects p
    LEFT JOIN usage u ON p.id = u.project_id AND u.period = $1
    WHERE ($2::text IS NULL OR p.status = $2)
    GROUP BY p.id, p.name, p.owner_email, p.status, p.monthly_limit, p.rate_limit_per_minute, p.created_at
    ORDER BY p.created_at DESC
    LIMIT $3 OFFSET $4`,
    [currentPeriod, status, pagination.limit, pagination.offset]
  );

  return rows;
}

export async function getTotalProjectsCount(status: string | null): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*)::integer as count
     FROM projects
     WHERE ($1::text IS NULL OR status = $1)`,
    [status]
  );

  return parseInt(rows[0].count, 10);
}

export async function getProjectById(projectId: string): Promise<any | null> {
  const rows = await query(
    `SELECT 
      id,
      name,
      owner_email,
      status,
      monthly_limit,
      rate_limit_per_minute,
      created_at
    FROM projects
    WHERE id = $1`,
    [projectId]
  );

  return rows.length > 0 ? rows[0] : null;
}

export async function getProjectUsageByType(projectId: string, period: string): Promise<any[]> {
  const rows = await query(
    `SELECT 
      message_type,
      count
    FROM usage
    WHERE project_id = $1 AND period = $2`,
    [projectId, period]
  );

  return rows;
}

export async function getProjectUsageByStatus(projectId: string): Promise<any[]> {
  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  currentMonthStart.setHours(0, 0, 0, 0);

  const rows = await query(
    `SELECT 
      status,
      COUNT(*)::integer as count
    FROM messages
    WHERE project_id = $1 AND created_at >= $2
    GROUP BY status`,
    [projectId, currentMonthStart]
  );

  return rows;
}

export async function getProjectApiKeys(projectId: string): Promise<any[]> {
  const rows = await query(
    `SELECT 
      id,
      name,
      created_at,
      last_used_at,
      revoked_at
    FROM api_keys
    WHERE project_id = $1
    ORDER BY created_at DESC`,
    [projectId]
  );

  return rows;
}

export async function getCurrentRateLimit(projectId: string): Promise<any | null> {
  // Get current minute window
  const now = new Date();
  now.setSeconds(0, 0);

  const rows = await query(
    `SELECT 
      count,
      minute_window
    FROM rate_limit_tracking
    WHERE project_id = $1 AND minute_window = $2`,
    [projectId, now]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * MESSAGE QUERIES
 */

export async function getMessagesByProject(
  projectId: string,
  filters: {
    status?: string;
    type?: string;
    to?: string;
    from?: string;
  },
  pagination: PaginationParams
): Promise<any[]> {
  const rows = await query(
    `SELECT 
      id,
      type,
      status,
      from_address,
      to_address,
      subject,
      attempts,
      created_at,
      updated_at,
      idempotency_key
    FROM messages
    WHERE project_id = $1
      AND ($2::text IS NULL OR status = $2)
      AND ($3::text IS NULL OR type = $3)
      AND ($4::text IS NULL OR to_address ILIKE '%' || $4 || '%')
      AND ($5::text IS NULL OR from_address ILIKE '%' || $5 || '%')
    ORDER BY created_at DESC
    LIMIT $6 OFFSET $7`,
    [
      projectId,
      filters.status || null,
      filters.type || null,
      filters.to || null,
      filters.from || null,
      pagination.limit,
      pagination.offset,
    ]
  );

  return rows;
}

export async function getTotalMessagesCount(
  projectId: string,
  filters: {
    status?: string;
    type?: string;
    to?: string;
    from?: string;
  }
): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*)::integer as count
     FROM messages
     WHERE project_id = $1
       AND ($2::text IS NULL OR status = $2)
       AND ($3::text IS NULL OR type = $3)
       AND ($4::text IS NULL OR to_address ILIKE '%' || $4 || '%')
       AND ($5::text IS NULL OR from_address ILIKE '%' || $5 || '%')`,
    [
      projectId,
      filters.status || null,
      filters.type || null,
      filters.to || null,
      filters.from || null,
    ]
  );

  return parseInt(rows[0].count, 10);
}

export async function getMessageById(messageId: string): Promise<any | null> {
  const rows = await query(
    `SELECT 
      id,
      project_id,
      type,
      status,
      from_address,
      to_address,
      subject,
      body,
      metadata,
      idempotency_key,
      attempts,
      max_attempts,
      next_attempt_at,
      scheduled_for,
      created_at,
      updated_at
    FROM messages
    WHERE id = $1`,
    [messageId]
  );

  return rows.length > 0 ? rows[0] : null;
}

export async function getMessageEvents(messageId: string): Promise<any[]> {
  const rows = await query(
    `SELECT 
      id,
      event_type,
      provider_response,
      created_at
    FROM events
    WHERE message_id = $1
    ORDER BY created_at ASC`,
    [messageId]
  );

  return rows;
}

/**
 * USAGE QUERIES
 */

export async function getCurrentUsage(projectId: string): Promise<any[]> {
  const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM

  const rows = await query(
    `SELECT 
      period,
      message_type,
      count
    FROM usage
    WHERE project_id = $1 AND period = $2
    ORDER BY message_type`,
    [projectId, currentPeriod]
  );

  return rows;
}

export async function getUsageHistory(projectId: string, months: number): Promise<any[]> {
  // Use parameterized interval multiplication instead of string interpolation
  const rows = await query(
    `SELECT 
      period,
      message_type,
      count
    FROM usage
    WHERE project_id = $1
      AND period >= TO_CHAR(NOW() - INTERVAL '1 month' * $2, 'YYYY-MM')
    ORDER BY period ASC, message_type`,
    [projectId, months]
  );

  return rows;
}

/**
 * WRITE QUERIES (Phase 2)
 */

/**
 * Get current month's total usage for a project
 * Used to validate limit changes
 */
export async function getCurrentMonthUsage(projectId: string): Promise<number> {
  const currentPeriod = new Date().toISOString().slice(0, 7);

  const rows = await query<{ total: string }>(
    `SELECT COALESCE(SUM(count), 0)::integer as total
     FROM usage
     WHERE project_id = $1 AND period = $2`,
    [projectId, currentPeriod]
  );

  return parseInt(rows[0].total, 10);
}

/**
 * Update project status
 */
export async function updateProjectStatus(
  projectId: string,
  status: string
): Promise<any | null> {
  const rows = await query(
    `UPDATE projects
     SET status = $1
     WHERE id = $2
     RETURNING id, status, name, owner_email`,
    [status, projectId]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Update project limits (partial update)
 */
export async function updateProjectLimits(
  projectId: string,
  monthlyLimit: number | null | undefined,
  rateLimitPerMinute: number | null | undefined
): Promise<any | null> {
  const rows = await query(
    `UPDATE projects
     SET 
       monthly_limit = COALESCE($1, monthly_limit),
       rate_limit_per_minute = COALESCE($2, rate_limit_per_minute)
     WHERE id = $3
     RETURNING id, monthly_limit, rate_limit_per_minute, name`,
    [monthlyLimit, rateLimitPerMinute, projectId]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Apply tier limits to project (updates both limits atomically)
 */
export async function applyTierToProject(
  projectId: string,
  monthlyLimit: number | null,
  rateLimitPerMinute: number | null
): Promise<any | null> {
  const rows = await query(
    `UPDATE projects
     SET 
       monthly_limit = $1,
       rate_limit_per_minute = $2
     WHERE id = $3
     RETURNING id, monthly_limit, rate_limit_per_minute, name`,
    [monthlyLimit, rateLimitPerMinute, projectId]
  );

  return rows.length > 0 ? rows[0] : null;
}
