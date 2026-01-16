-- OrbiCloud V2 - Project Limits & Quotas
-- Adds: Monthly limits, rate limits (per-minute)
-- Run this after 003_production_delivery.sql

-- 1. Add limit fields to projects table
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS monthly_limit INTEGER, -- NULL = unlimited
  ADD COLUMN IF NOT EXISTS rate_limit_per_minute INTEGER; -- NULL = unlimited

-- Add comment for clarity
COMMENT ON COLUMN projects.monthly_limit IS 'Maximum messages per month. NULL = unlimited';
COMMENT ON COLUMN projects.rate_limit_per_minute IS 'Maximum messages per minute. NULL = unlimited';

-- 2. Create rate limit tracking table
-- Tracks message count per project per minute window
-- Used for sliding window rate limiting
CREATE TABLE IF NOT EXISTS rate_limit_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  minute_window TIMESTAMPTZ NOT NULL, -- Truncated to minute (e.g., '2026-01-01 18:52:00')
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, minute_window)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_rate_limit_tracking_project_window 
  ON rate_limit_tracking(project_id, minute_window);

-- Index for cleanup of old records
CREATE INDEX IF NOT EXISTS idx_rate_limit_tracking_minute_window 
  ON rate_limit_tracking(minute_window);

-- 3. (Optional) Add function to clean old rate limit records
-- This keeps the table from growing indefinitely
-- Can be run periodically (e.g., daily cron job)
-- Delete records older than 1 hour
CREATE OR REPLACE FUNCTION cleanup_rate_limit_tracking()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limit_tracking 
  WHERE minute_window < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;
