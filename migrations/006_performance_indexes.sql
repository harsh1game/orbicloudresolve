-- OrbiCloud V2 - Phase 5: Performance Indexes
-- Optimization for Customer & Admin APIs

-- Index for "Get my messages sorted by time" (Customer API default view)
-- Also used for "Get usage history"
CREATE INDEX IF NOT EXISTS idx_messages_project_created 
  ON messages(project_id, created_at DESC);

-- Index for "Get my messages by status" (Customer API filtering)
CREATE INDEX IF NOT EXISTS idx_messages_project_status 
  ON messages(project_id, status);

-- Index for Janitor (Retention)
-- Helps find old removable rows quickly
CREATE INDEX IF NOT EXISTS idx_messages_status_created 
  ON messages(status, created_at) 
  WHERE status IN ('delivered', 'failed', 'dead');

CREATE INDEX IF NOT EXISTS idx_events_created 
  ON events(created_at);
