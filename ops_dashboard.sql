-- OrbiCloud V2 - Phase 5: Ops Dashboard
-- Run these queries directly in psql to monitor system health

-- 1. Queue Depth (Real-time backlog)
-- Goal: Should be near zero. High numbers = worker stuck or overloaded.
SELECT COUNT(*) as queue_depth 
FROM messages 
WHERE status = 'queued';

-- 2. Oldest Queued Message Age
-- Goal: Should be seconds. If > 1 min, we have lag.
SELECT NOW() - created_at as lag_duration
FROM messages
WHERE status = 'queued'
ORDER BY created_at ASC
LIMIT 1;

-- 3. Top 10 Projects by Volume (Current Month)
-- Goal: Identify heavy users or noisy neighbors.
SELECT 
    p.name, 
    p.id, 
    SUM(u.count) as total_messages
FROM usage u
JOIN projects p ON p.id = u.project_id
WHERE u.period = TO_CHAR(NOW(), 'YYYY-MM')
GROUP BY p.id, p.name
ORDER BY total_messages DESC
LIMIT 10;

-- 4. Success vs Failure Rate (Last 24h)
-- Goal: Quick health check. Failure rate > 5% is alarming.
SELECT 
    (COUNT(*) FILTER (WHERE status = 'delivered'))::float / NULLIF(COUNT(*), 0) * 100 as success_rate_percent,
    (COUNT(*) FILTER (WHERE status = 'failed' OR status = 'dead'))::float / NULLIF(COUNT(*), 0) * 100 as failure_rate_percent,
    COUNT(*) as total_processed
FROM messages
WHERE updated_at > NOW() - INTERVAL '24 hours'
  AND status IN ('delivered', 'failed', 'dead');

-- 5. Dead Letters (Requires Attention)
SELECT count(*) as dead_letter_count
FROM messages
WHERE status = 'dead'
  AND updated_at > NOW() - INTERVAL '24 hours';
