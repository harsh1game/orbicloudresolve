/**
 * Customer API Queries
 * 
 * WHY: Isolation layer for customer-facing data access.
 * RULE: EVERY function MUST take projectId as the first argument.
 * RULE: EVERY query MUST scope by project_id
 * RULE: No reuse of admin queries.
 */

import { getSupabaseClient } from '../lib/db';

/**
 * Get project details and limits for the authenticated project
 */
export async function getProjectIdentity(projectId: string): Promise<any | null> {
  const supabase = getSupabaseClient();
  const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM

  // Get project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name, status, monthly_limit, rate_limit_per_minute, created_at')
    .eq('id', projectId)
    .single();

  if (projectError || !project) return null;

  // Get usage for current period
  const { data: usageData } = await supabase
    .from('usage')
    .select('count')
    .eq('project_id', projectId)
    .eq('period', currentPeriod);

  const currentUsage = usageData?.reduce((sum, u) => sum + (u.count || 0), 0) || 0;

  return {
    ...project,
    current_usage: currentUsage
  };
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
  const supabase = getSupabaseClient();
  
  let query = supabase
    .from('messages')
    .select('id, status, type, to_address, from_address, subject, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .range(filters.offset, filters.offset + filters.limit - 1);

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.to) {
    query = query.ilike('to_address', `%${filters.to}%`);
  }

  const { data, error } = await query;

  if (error) throw error;

  // Rename fields for API response
  return (data || []).map(m => ({
    id: m.id,
    status: m.status,
    type: m.type,
    to: m.to_address,
    from: m.from_address,
    subject: m.subject,
    created_at: m.created_at
  }));
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
  const supabase = getSupabaseClient();

  let query = supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.to) {
    query = query.ilike('to_address', `%${filters.to}%`);
  }

  const { count, error } = await query;

  if (error) throw error;

  return count || 0;
}

/**
 * Get message details (Project Scoped)
 */
export async function getCustomerMessage(projectId: string, messageId: string): Promise<any | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('messages')
    .select('id, project_id, status, type, from_address, to_address, subject, body, created_at, updated_at, attempts')
    .eq('id', messageId)
    .eq('project_id', projectId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    project_id: data.project_id,
    status: data.status,
    type: data.type,
    from: data.from_address,
    to: data.to_address,
    subject: data.subject,
    body: data.body,
    created_at: data.created_at,
    updated_at: data.updated_at,
    attempts: data.attempts
  };
}

/**
 * Get message events with project scoping via message lookup
 */
export async function getCustomerMessageEvents(projectId: string, messageId: string): Promise<any[]> {
  const supabase = getSupabaseClient();

  // First verify message belongs to project
  const { data: message } = await supabase
    .from('messages')
    .select('id')
    .eq('id', messageId)
    .eq('project_id', projectId)
    .single();

  if (!message) return [];

  // Get events
  const { data: events, error } = await supabase
    .from('events')
    .select('event_type, created_at, provider_response')
    .eq('message_id', messageId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (events || []).map(e => ({
    type: e.event_type,
    created_at: e.created_at,
    provider_response: e.provider_response
  }));
}

/**
 * Get usage analytics (Project Scoped)
 */
export async function getCustomerUsage(projectId: string): Promise<any[]> {
  const supabase = getSupabaseClient();
  const currentPeriod = new Date().toISOString().slice(0, 7);

  const { data, error } = await supabase
    .from('usage')
    .select('message_type, count')
    .eq('project_id', projectId)
    .eq('period', currentPeriod);

  if (error) throw error;

  return data || [];
}

/**
 * Get usage history (Project Scoped)
 */
export async function getCustomerUsageHistory(projectId: string, months: number = 12): Promise<any[]> {
  const supabase = getSupabaseClient();
  
  // Calculate cutoff date
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffPeriod = cutoff.toISOString().slice(0, 7);

  const { data, error } = await supabase
    .from('usage')
    .select('period, message_type, count')
    .eq('project_id', projectId)
    .gte('period', cutoffPeriod)
    .order('period', { ascending: true });

  if (error) throw error;

  return data || [];
}
