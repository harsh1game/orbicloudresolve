-- OrbiCloud V2 - Production-Grade Delivery Features
-- Adds: Idempotency, Retries, Dead Letter Handling
-- Run this after 002_usage_tracking.sql

-- 1. Add idempotency support to messages table
ALTER TABLE messages 
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Unique constraint: one idempotency_key per project
-- This prevents duplicate messages for the same project + key
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_idempotency 
  ON messages(project_id, idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

-- 2. Add retry support to messages table
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

-- Index for worker to efficiently find messages ready for retry
CREATE INDEX IF NOT EXISTS idx_messages_retry 
  ON messages(next_attempt_at, status) 
  WHERE status = 'queued';

-- 3. Add 'dead' status for messages that exceeded max attempts
-- First, drop the old constraint
ALTER TABLE messages 
  DROP CONSTRAINT IF EXISTS messages_status_check;

-- Add new constraint with 'dead' status
ALTER TABLE messages
  ADD CONSTRAINT messages_status_check 
  CHECK (status IN ('queued', 'delivered', 'failed', 'dead'));

-- 4. Add 'dead' event type to events table
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_event_type_check;

ALTER TABLE events
  ADD CONSTRAINT events_event_type_check
  CHECK (event_type IN ('requested', 'queued', 'sent', 'delivered', 'failed', 'bounced', 'opened', 'clicked', 'dead'));
