-- Migration: Worker Queue Function
-- This function handles the FOR UPDATE SKIP LOCKED logic that the worker needs

CREATE OR REPLACE FUNCTION dequeue_messages(batch_size INT)
RETURNS TABLE (
  id UUID,
  project_id UUID,
  type TEXT,
  from_address TEXT,
  to_address TEXT,
  subject TEXT,
  body TEXT,
  attempts INT,
  max_attempts INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.project_id,
    m.type,
    m.from_address,
    m.to_address,
    m.subject,
    m.body,
    m.attempts,
    m.max_attempts
  FROM messages m
  WHERE m.status = 'queued'
    AND (m.next_attempt_at IS NULL OR m.next_attempt_at <= NOW())
  ORDER BY m.created_at ASC
  LIMIT batch_size
  FOR UPDATE SKIP LOCKED;
END;
$$ LANGUAGE plpgsql;
