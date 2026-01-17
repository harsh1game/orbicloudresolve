-- Additional database functions for Supabase REST API usage

-- Function: Check and increment rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_project_id UUID,
  p_minute_window TIMESTAMPTZ
)
RETURNS TABLE (
  exceeded BOOLEAN,
  current_count INT,
  rate_limit INT
) AS $$
DECLARE
  v_rate_limit INT;
  v_current_count INT;
BEGIN
  -- Get project rate limit
  SELECT rate_limit_per_minute INTO v_rate_limit
  FROM projects
  WHERE id = p_project_id;

  -- NULL = unlimited
  IF v_rate_limit IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, NULL::INT;
    RETURN;
  END IF;

  -- Increment counter
  INSERT INTO rate_limit_tracking (project_id, minute_window, count)
  VALUES (p_project_id, p_minute_window, 1)
  ON CONFLICT (project_id, minute_window)
  DO UPDATE SET count = rate_limit_tracking.count + 1, updated_at = NOW()
  RETURNING count INTO v_current_count;

  -- Return result
  RETURN QUERY SELECT 
    v_current_count > v_rate_limit AS exceeded,
    v_current_count,
    v_rate_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: Check monthly quota
CREATE OR REPLACE FUNCTION check_monthly_quota(p_project_id UUID)
RETURNS TABLE (
  exceeded BOOLEAN,
  current_usage INT,
  monthly_limit INT
) AS $$
DECLARE
  v_monthly_limit INT;
  v_current_usage INT;
  v_period TEXT;
BEGIN
  -- Get current period
  v_period := TO_CHAR(NOW(), 'YYYY-MM');

  -- Get project limit
  SELECT monthly_limit INTO v_monthly_limit
  FROM projects
  WHERE id = p_project_id;

  -- NULL = unlimited
  IF v_monthly_limit IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, NULL::INT;
    RETURN;
  END IF;

  -- Get current usage
  SELECT COALESCE(SUM(count), 0)::INT INTO v_current_usage
  FROM usage
  WHERE project_id = p_project_id AND period = v_period;

  -- Return result
  RETURN QUERY SELECT 
    v_current_usage >= v_monthly_limit AS exceeded,
    v_current_usage,
    v_monthly_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: Increment usage counter
CREATE OR REPLACE FUNCTION increment_usage(
  p_project_id UUID,
  p_message_type TEXT
)
RETURNS VOID AS $$
DECLARE
  v_period TEXT;
BEGIN
  v_period := TO_CHAR(NOW(), 'YYYY-MM');
  
  INSERT INTO usage (project_id, period, message_type, count)
  VALUES (p_project_id, v_period, p_message_type, 1)
  ON CONFLICT (project_id, period, message_type)
  DO UPDATE SET count = usage.count + 1, updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
