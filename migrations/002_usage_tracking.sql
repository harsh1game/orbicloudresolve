-- OrbiCloud V2 - Authentication & Usage Tracking
-- Run this after 001_initial_schema.sql

-- Usage tracking table
-- Tracks message counts per project per period (month)
-- Incremented by worker on successful delivery
CREATE TABLE IF NOT EXISTS usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  period TEXT NOT NULL, -- Format: YYYY-MM
  message_type TEXT NOT NULL DEFAULT 'email',
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, period, message_type)
);

CREATE INDEX IF NOT EXISTS idx_usage_project_period ON usage(project_id, period);
