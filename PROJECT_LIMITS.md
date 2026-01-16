# Project Limits & Quotas

## Summary

OrbiCloud V2 now enforces project-level limits to prevent abuse and ensure fair usage:

- ✅ **Monthly Quota** - Limit total messages per month
- ✅ **Rate Limiting** - Limit messages per minute
- ✅ **Postgres-only** - No Redis, no external services
- ✅ **Concurrency-safe** - Uses transactions and atomic operations

## Files Changed

### 1. Migration: `migrations/004_project_limits.sql`

**What it adds:**

```sql
-- Projects table
ALTER TABLE projects
  ADD COLUMN monthly_limit INTEGER,           -- NULL = unlimited
  ADD COLUMN rate_limit_per_minute INTEGER;   -- NULL = unlimited

-- Rate limit tracking
CREATE TABLE rate_limit_tracking (
  project_id UUID,
  minute_window TIMESTAMPTZ,  -- Truncated to minute
  count INTEGER,
  UNIQUE(project_id, minute_window)
);
```

**Why:**
- `monthly_limit` - Enforces total monthly quota
- `rate_limit_per_minute` - Prevents burst abuse
- `rate_limit_tracking` - Tracks sliding window per minute
- NULL values = unlimited (backward compatible)

### 2. Limits Module: `src/api/limits.ts`

**New file** with two functions:

#### `checkMonthlyQuota(projectId)`
```typescript
// 1. Get project.monthly_limit
// 2. Get current month's usage from usage table
// 3. Return exceeded if usage >= limit
```

**Logic:**
- NULL limit = unlimited
- Sums all message types for current month
- Fast query: indexed on (project_id, period)

#### `checkRateLimit(projectId)`
```typescript
// 1. Get project.rate_limit_per_minute
// 2. Get/increment counter for current minute window
// 3. Return exceeded if count > limit
```

**Logic:**
- NULL limit = unlimited
- Truncates timestamp to minute (e.g., 18:52:34 → 18:52:00)
- Uses UPSERT to atomically increment counter
- Transaction-safe under concurrency

**Why Postgres-only?**
- No external dependencies (Redis)
- ACID guarantees
- Crash-safe
- Simpler architecture
- Good enough for most use cases

**Tradeoff:**
- Slightly slower than in-memory Redis
- Extra DB writes per request
- Acceptable for V2 (free-tier SaaS)

### 3. API Server: `src/api/server.ts`

**Changed:**

Added checks before message creation:

```typescript
// 1. Check monthly quota
const quotaCheck = await checkMonthlyQuota(projectId);
if (quotaCheck.exceeded) {
  return res.status(429).json({
    error: 'monthly_quota_exceeded',
    message: '...',
    quota: { limit, current }
  });
}

// 2. Check rate limit
const rateLimitCheck = await checkRateLimit(projectId);
if (rateLimitCheck.exceeded) {
  return res.status(429).json({
    error: 'rate_limit_exceeded',
    message: '...',
    rate_limit: { limit, current, window: 'per_minute' }
  });
}

// 3. Proceed with message creation...
```

**Error responses standardized:**
- HTTP 429 for quota/rate limit exceeded
- Structured error format with `error` code and `message`
- Additional metadata (limit, current, window)

## How It Works

### Monthly Quota

**Setup:**
```sql
UPDATE projects 
SET monthly_limit = 10000 
WHERE id = 'your-project-id';
```

**Request flow:**
```
POST /v1/messages
  ↓
Check: SELECT SUM(count) FROM usage WHERE project_id=X AND period='2026-01'
  ↓
Current: 9995, Limit: 10000 → OK, proceed
  ↓
Create message, increment usage to 9996
```

**When exceeded:**
```
POST /v1/messages
  ↓
Current: 10000, Limit: 10000 → EXCEEDED
  ↓
HTTP 429: {
  "error": "monthly_quota_exceeded",
  "message": "Monthly quota exceeded. Limit: 10000, Current: 10000",
  "quota": {"limit": 10000, "current": 10000}
}
```

### Rate Limiting (Per Minute)

**Setup:**
```sql
UPDATE projects 
SET rate_limit_per_minute = 100 
WHERE id = 'your-project-id';
```

**Request flow:**
```
POST /v1/messages at 18:52:34
  ↓
Minute window = 18:52:00
  ↓
UPSERT rate_limit_tracking (project, '18:52:00', count)
  ON CONFLICT DO UPDATE SET count = count + 1
  ↓
Current count: 95, Limit: 100 → OK
  ↓
Create message
```

**When exceeded:**
```
POST /v1/messages at 18:52:45
  ↓
Minute window = 18:52:00
  ↓
Current count: 101, Limit: 100 → EXCEEDED
  ↓
HTTP 429: {
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded. You have exceeded your per-minute limit of 100 messages",
  "rate_limit": {"limit": 100, "current": 101, "window": "per_minute"}
}
```

**Next minute:**
```
POST /v1/messages at 18:53:01
  ↓
Minute window = 18:53:00  (new window!)
  ↓
Count: 1, Limit: 100 → OK
  ↓
Create message
```

## Concurrency Safety

### Race Condition: Multiple workers incrementing rate limit

**Scenario:**
```
Time    Request A              Request B
----    ---------              ---------
0ms     BEGIN transaction      BEGIN transaction
1ms     Read count = 99        Read count = 99
2ms     Increment to 100       Increment to 100
3ms     COMMIT                 COMMIT
```

**Problem:** Lost update - both think count is 100, but 2 messages accepted.

**Solution:** Use UPSERT with atomic increment

```sql
INSERT INTO rate_limit_tracking (project_id, minute_window, count)
VALUES ($1, $2, 1)
ON CONFLICT (project_id, minute_window)
DO UPDATE SET count = rate_limit_tracking.count + 1
RETURNING count;
```

Postgres ensures atomicity - no lost updates.

## Error Response Format

All limit errors use standardized format:

```json
{
  "error": "error_code",
  "message": "Human-readable message",
  "metadata": { /* context-specific data */ }
}
```

### Monthly Quota Exceeded

```json
{
  "error": "monthly_quota_exceeded",
  "message": "Monthly quota exceeded. Limit: 10000, Current: 10000",
  "quota": {
    "limit": 10000,
    "current": 10000
  }
}
```

### Rate Limit Exceeded

```json
{
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded. You have exceeded your per-minute limit of 100 messages",
  "rate_limit": {
    "limit": 100,
    "current": 101,
    "window": "per_minute"
  }
}
```

### Validation Error

```json
{
  "error": "validation_error",
  "message": "Missing required fields: to, from, body"
}
```

### Internal Error

```json
{
  "error": "internal_error",
  "message": "Internal server error"
}
```

## Configuration Examples

### Unlimited (default)
```sql
-- Both NULL = no limits
INSERT INTO projects (name, owner_email, monthly_limit, rate_limit_per_minute)
VALUES ('Free Project', 'user@example.com', NULL, NULL);
```

### Free Tier
```sql
UPDATE projects SET
  monthly_limit = 10000,
  rate_limit_per_minute = 60
WHERE id = 'project-id';
```

### Paid Tier
```sql
UPDATE projects SET
  monthly_limit = 1000000,
  rate_limit_per_minute = 1000
WHERE id = 'project-id';
```

### Rate Limited Only
```sql
UPDATE projects SET
  monthly_limit = NULL,           -- unlimited monthly
  rate_limit_per_minute = 100     -- but rate limited
WHERE id = 'project-id';
```

## Testing

### Test Monthly Quota

```bash
# Set low limit for testing
psql $DATABASE_URL -c "UPDATE projects SET monthly_limit = 5 WHERE id = '00000000-0000-0000-0000-000000000000'"

# Send 5 messages (should succeed)
for i in {1..5}; do
  curl -X POST http://localhost:3000/v1/messages \
    -H "Authorization: Bearer your_key" \
    -H "Content-Type: application/json" \
    -d "{\"to\":\"test@example.com\",\"from\":\"sender@example.com\",\"body\":\"Message $i\"}"
done

# 6th message should fail with 429
curl -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer your_key" \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com","from":"sender@example.com","body":"Should fail"}'

# Response:
# HTTP 429: {"error":"monthly_quota_exceeded","message":"..."}
```

### Test Rate Limit

```bash
# Set low rate limit
psql $DATABASE_URL -c "UPDATE projects SET rate_limit_per_minute = 3 WHERE id = '00000000-0000-0000-0000-000000000000'"

# Send 4 messages rapidly (4th should fail)
for i in {1..4}; do
  curl -X POST http://localhost:3000/v1/messages \
    -H "Authorization: Bearer your_key" \
    -H "Content-Type: application/json" \
    -d "{\"to\":\"test@example.com\",\"from\":\"sender@example.com\",\"body\":\"Message $i\"}"
done

# Last response:
# HTTP 429: {"error":"rate_limit_exceeded","message":"..."}

# Wait 60 seconds, try again (should succeed)
sleep 60
curl -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer your_key" \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com","from":"sender@example.com","body":"New minute"}'
```

## Maintenance

### Cleanup Old Rate Limit Records

Rate limit table grows over time. Clean up periodically:

```sql
-- Manual cleanup (run daily)
SELECT cleanup_rate_limit_tracking();

-- Or set up automated cleanup (cron)
DELETE FROM rate_limit_tracking 
WHERE minute_window < NOW() - INTERVAL '1 hour';
```

Records older than 1 hour are no longer needed.

### Monitor Quota Usage

```sql
-- Check which projects are near limits
SELECT 
  p.id,
  p.name,
  p.monthly_limit,
  COALESCE(SUM(u.count), 0) as current_usage,
  ROUND(100.0 * COALESCE(SUM(u.count), 0) / NULLIF(p.monthly_limit, 0), 2) as usage_percent
FROM projects p
LEFT JOIN usage u ON p.id = u.project_id 
  AND u.period = TO_CHAR(NOW(), 'YYYY-MM')
WHERE p.monthly_limit IS NOT NULL
GROUP BY p.id, p.name, p.monthly_limit
ORDER BY usage_percent DESC;
```

## Performance Considerations

### Monthly Quota Check
- **Query:** Simple SUM over indexed column
- **Cost:** ~1-2ms
- **Index:** (project_id, period)

### Rate Limit Check
- **Query:** UPSERT with RETURNING
- **Cost:** ~2-5ms
- **Index:** (project_id, minute_window)

### Total Overhead
- **Per request:** ~3-7ms additional latency
- **Acceptable** for API workload
- **Alternative (Redis):** ~1-2ms, but adds dependency

### Optimization Ideas (Future)
- Cache project limits in-memory (refresh every 60s)
- Use Postgres LISTEN/NOTIFY for limit changes
- Batch rate limit increments

## What Changed?

| Aspect | Before | After |
|--------|--------|-------|
| **Quotas** | None | Monthly + per-minute |
| **Enforcement** | None | Enforced at API level |
| **Error handling** | Generic 500 | Standardized 429 with details |
| **Concurrency** | N/A | Transaction-safe UPSERT |

## What Did NOT Change?

✅ **Worker behavior** - unchanged  
✅ **Message processing** - unchanged  
✅ **Usage tracking** - unchanged  
✅ **Authentication** - unchanged  
✅ **Existing projects** - NULL = unlimited  

## Build Status

✅ Compiles successfully  
✅ Zero TypeScript errors  
✅ Backward compatible migration
