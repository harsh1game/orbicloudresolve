/**
 * Customer API Queries
 * 
 * WHY: Isolation layer for customer-facing data access.
 * RULE: EVERY function MUST take projectId as the first argument.
 * RULE: EVERY query MUST look like "WHERE project_id = $1 ..."
 * RULE: No reuse of admin queries.
 */

import { query } from '../admin/lib/db';

/**
 * Get project details and limits for the authenticated project
 */
export async function getProjectIdentity(projectId: string): Promise<any | null> {
  const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM

  const rows = await query(
    `SELECT 
      p.id,
      p.name,
      p.status,
      p.monthly_limit,
      p.rate_limit_per_minute,
      p.created_at,
      COALESCE(SUM(u.count), 0)::integer as current_usage
    FROM projects p
    LEFT JOIN usage u ON p.id = u.project_id AND u.period = $2
    WHERE p.id = $1
    GROUP BY p.id`
    , [projectId, currentPeriod]);

  return rows.length > 0 ? rows[0] : null;
}

/**
 * List messages with strict project scoping
 */
export async function getCustomerMessages(
  projectId: string,
  filters: {
    limit: number;
    offset: number;
    status?: string;
    to?: string;
  }
): Promise<any[]> {
  const rows = await query(
    `SELECT 
      id,
      status,
      type,
      to_address as to,
      from_address as from,
      subject,
      created_at
    FROM messages
    WHERE project_id = $1
      AND ($2::text IS NULL OR status = $2)
      AND ($3::text IS NULL OR to_address ILIKE '%' || $3 || '%')
    ORDER BY created_at DESC
    LIMIT $4 OFFSET $5`,
    [
      projectId,
      filters.status || null,
      filters.to || null,
      filters.limit,
      filters.offset
    ]
  );
  return rows;
}

/**
 * Get total count of messages with same filters (Project Scoped)
 */
export async function getCustomerMessageCount(
  projectId: string,
  filters: {
    status?: string;
    to?: string;
  }
): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*)::integer as count
     FROM messages
     WHERE project_id = $1
       AND ($2::text IS NULL OR status = $2)
       AND ($3::text IS NULL OR to_address ILIKE '%' || $3 || '%')`,
    [
      projectId,
      filters.status || null,
      filters.to || null
    ]
  );

  return parseInt(rows[0].count, 10);
}

/**
 * Get message details (Project Scoped)
 */
export async function getCustomerMessage(projectId: string, messageId: string): Promise<any | null> {
  const rows = await query(
    `SELECT 
      id,
      project_id,
      status,
      type,
      from_address as from,
      to_address as to,
      subject,
      body,
      created_at,
      updated_at,
      attempts
    FROM messages
    WHERE id = $1 AND project_id = $2`,
    [messageId, projectId]
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get message events with JOIN (Strictly Scoped)
 * 
 * MUST join to messages table to enforce project_id
 */
export async function getCustomerMessageEvents(projectId: string, messageId: string): Promise<any[]> {
  const rows = await query(
    `SELECT 
      e.event_type as type,
      e.created_at,
      e.provider_response
    FROM events e
    JOIN messages m ON e.message_id = m.id
    WHERE e.message_id = $1 
      AND m.project_id = $2
    ORDER BY e.created_at ASC`,
    [messageId, projectId]
  );

  return rows;
}

/**
 * Get usage analytics (Project Scoped)
 */
export async function getCustomerUsage(projectId: string): Promise<any[]> {
  const currentPeriod = new Date().toISOString().slice(0, 7);

  const rows = await query(
    `SELECT 
      message_type,
      count
    FROM usage
    WHERE project_id = $1 AND period = $2`,
    [projectId, currentPeriod]
  );

  return rows;
}

/**
 * Get usage history (Project Scoped)
 */
export async function getCustomerUsageHistory(projectId: string, months: number = 12): Promise<any[]> {
  const rows = await query(
    `SELECT 
      period,
      message_type,
      count
    FROM usage
    WHERE project_id = $1 
      AND period >= TO_CHAR(NOW() - INTERVAL '1 month' * $2, 'YYYY-MM')
    ORDER BY period ASC`,
    [projectId, months]
  );

  return rows;
}
