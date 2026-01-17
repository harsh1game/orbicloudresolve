import { getSupabaseClient, rpc } from '../lib/db';
import { logger } from '../lib/logger';

/**
 * Check if project has exceeded monthly quota
 * Uses Supabase RPC function
 */
export async function checkMonthlyQuota(projectId: string): Promise<{ exceeded: boolean; current: number; limit: number | null }> {
  try {
    const result = await rpc<{ exceeded: boolean; current_usage: number; monthly_limit: number | null }>(
      'check_monthly_quota',
      { p_project_id: projectId }
    );

    if (!result || result.length === 0) {
      throw new Error('check_monthly_quota returned no results');
    }

    return {
      exceeded: result[0].exceeded,
      current: result[0].current_usage,
      limit: result[0].monthly_limit,
    };
  } catch (error: any) {
    logger.error('Monthly quota check failed', { error: error.message, projectId });
    throw error;
  }
}

/**
 * Check and increment rate limit counter
 * Uses Supabase RPC function for atomic increment
 */
export async function checkRateLimit(projectId: string): Promise<{ exceeded: boolean; current: number; limit: number | null }> {
  try {
    // Get current minute window
    const minuteWindow = new Date();
    minuteWindow.setSeconds(0, 0);

    const result = await rpc<{ exceeded: boolean; current_count: number; rate_limit: number | null }>(
      'check_rate_limit',
      { 
        p_project_id: projectId,
        p_minute_window: minuteWindow.toISOString()
      }
    );

    if (!result || result.length === 0) {
      throw new Error('check_rate_limit returned no results');
    }

    return {
      exceeded: result[0].exceeded,
      current: result[0].current_count,
      limit: result[0].rate_limit,
    };
  } catch (error: any) {
    logger.error('Rate limit check failed', { error: error.message, projectId });
    throw error;
  }
}
