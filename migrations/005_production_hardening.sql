-- OrbiCloud V2 - Phase 3: Admin Audit Log
-- Lightweight audit logging for admin WRITE actions
-- Run this after 004_project_limits.sql

-- Create admin_events table for audit logging
CREATE TABLE IF NOT EXISTS admin_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_scope TEXT NOT NULL, -- 'read' or 'write'
  action TEXT NOT NULL, -- e.g., 'project.suspended', 'project.limits.updated'
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  metadata JSONB, -- Additional context (old/new values, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying audit logs by project
CREATE INDEX IF NOT EXISTS idx_admin_events_project 
  ON admin_events(project_id, created_at DESC);

-- Index for querying by action type
CREATE INDEX IF NOT EXISTS idx_admin_events_action 
  ON admin_events(action, created_at DESC);

-- Add comment
COMMENT ON TABLE admin_events IS 'Audit log for admin control plane actions';

-- Add message.skipped event type to events table
-- This is used when worker skips messages for suspended projects
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;
ALTER TABLE events ADD CONSTRAINT events_event_type_check 
  CHECK (event_type IN ('requested', 'queued', 'sent', 'delivered', 'failed', 'bounced', 'opened', 'clicked', 'dead', 'skipped'));
