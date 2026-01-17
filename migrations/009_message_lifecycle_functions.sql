-- Additional worker and API functions for complete REST API migration

-- Function: Create message with initial event (atomic)
CREATE OR REPLACE FUNCTION create_message_with_event(
  p_project_id UUID,
  p_type TEXT,
  p_from TEXT,
  p_to TEXT,
  p_subject TEXT,
  p_body TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  message_id UUID,
  status TEXT,
  is_duplicate BOOLEAN
) AS $$
DECLARE
  v_message_id UUID;
  v_existing_id UUID;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM messages
    WHERE project_id = p_project_id AND idempotency_key = p_idempotency_key;
    
    IF v_existing_id IS NOT NULL THEN
      RETURN QUERY SELECT v_existing_id, 'queued'::TEXT, TRUE;
      RETURN;
    END IF;
  END IF;

  -- Insert message
  INSERT INTO messages (project_id, type, status, from_address, to_address, subject, body, idempotency_key)
  VALUES (p_project_id, p_type, 'queued', p_from, p_to, p_subject, p_body, p_idempotency_key)
  RETURNING id INTO v_message_id;

  -- Insert initial event
  INSERT INTO events (message_id, project_id, event_type)
  VALUES (v_message_id, p_project_id, 'requested');

  RETURN QUERY SELECT v_message_id, 'queued'::TEXT, FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function: Process message delivery result
CREATE OR REPLACE FUNCTION process_message_delivery(
  p_message_id UUID,
  p_success BOOLEAN,
  p_retryable BOOLEAN,
  p_provider_response JSONB,
  p_error_message TEXT,
  p_project_id UUID,
  p_message_type TEXT
)
RETURNS VOID AS $$
DECLARE
  v_backoff_seconds INT;
  v_next_attempt TIMESTAMPTZ;
  v_attempts INT;
  v_max_attempts INT;
BEGIN
  -- Get current attempts
  SELECT attempts, max_attempts INTO v_attempts, v_max_attempts
  FROM messages WHERE id = p_message_id;

  IF p_success THEN
    -- Mark as delivered
    UPDATE messages SET status = 'delivered', updated_at = NOW()
    WHERE id = p_message_id;

    INSERT INTO events (message_id, project_id, event_type, provider_response)
    VALUES (p_message_id, p_project_id, 'delivered', p_provider_response);

    -- Increment usage
    PERFORM increment_usage(p_project_id, p_message_type);

  ELSIF p_retryable AND v_attempts < v_max_attempts THEN
    -- Calculate backoff
    v_backoff_seconds := CASE 
      WHEN v_attempts = 0 THEN 1
      WHEN v_attempts = 1 THEN 5
      WHEN v_attempts = 2 THEN 30
      WHEN v_attempts = 3 THEN 300
      ELSE 1800
    END;
    
    v_next_attempt := NOW() + (v_backoff_seconds || ' seconds')::INTERVAL;

    UPDATE messages 
    SET next_attempt_at = v_next_attempt, updated_at = NOW()
    WHERE id = p_message_id;

    INSERT INTO events (message_id, project_id, event_type, provider_response)
    VALUES (p_message_id, p_project_id, 'failed', 
            jsonb_build_object('retryable', TRUE, 'next_attempt_at', v_next_attempt, 
                              'error', p_error_message) || COALESCE(p_provider_response, '{}'::JSONB));

  ELSE
    -- Permanent failure or max attempts reached
    UPDATE messages SET status = 'failed', updated_at = NOW()
    WHERE id = p_message_id;

    INSERT INTO events (message_id, project_id, event_type, provider_response)
    VALUES (p_message_id, p_project_id, 'failed',
            jsonb_build_object('retryable', FALSE, 'error', p_error_message) || COALESCE(p_provider_response, '{}'::JSONB));
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function: Mark message as dead (max attempts exceeded)
CREATE OR REPLACE FUNCTION mark_message_dead(
  p_message_id UUID,
  p_project_id UUID,
  p_attempts INT
)
RETURNS VOID AS $$
BEGIN
  UPDATE messages SET status = 'dead', updated_at = NOW()
  WHERE id = p_message_id;

  INSERT INTO events (message_id, project_id, event_type, provider_response)
  VALUES (p_message_id, p_project_id, 'dead',
          jsonb_build_object('reason', 'Max attempts exceeded', 'attempts', p_attempts));
END;
$$ LANGUAGE plpgsql;

-- Function: Increment attempts counter
CREATE OR REPLACE FUNCTION increment_message_attempts(p_message_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE messages SET attempts = attempts + 1
  WHERE id = p_message_id;
END;
$$ LANGUAGE plpgsql;
