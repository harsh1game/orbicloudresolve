# Production-Grade Delivery Pipeline

## Summary

OrbiCloud V2 now has production-grade message delivery with:
- ✅ **Idempotency** - prevent duplicate messages
- ✅ **Retry logic** - exponential backoff for transient failures
- ✅ **Failure classification** - transient vs permanent errors
- ✅ **Dead letter handling** - messages that fail too many times

## Files Changed

### 1. Migration: `migrations/003_production_delivery.sql`

**What it adds:**
```sql
-- Idempotency
idempotency_key TEXT (nullable)
UNIQUE INDEX (project_id, idempotency_key)

-- Retry support
attempts INTEGER DEFAULT 0
max_attempts INTEGER DEFAULT 3
next_attempt_at TIMESTAMPTZ (nullable)

-- Dead letter status
status = 'dead' (added to CHECK constraint)
event_type = 'dead' (added to CHECK constraint)
```

**Why:** Enables idempotency checks, retry scheduling, and dead letter tracking without breaking existing data.

### 2. Provider Interface: `src/providers/provider.ts`

**Changed:**
```typescript
interface ProviderResult {
  success: boolean;
  retryable: boolean;  // NEW: Can this failure be retried?
  provider_response?: any;
  error_message?: string;
}
```

**Why:** Worker needs to know if a failure is temporary (retry) or permanent (give up).

### 3. Google Provider: `src/providers/google-email.ts`

**Changed:**
- Success: `retryable: false`
- Transient failures (10%): `retryable: true` - simulates rate limits, network errors
- Permanent failures (5%): `retryable: false` - simulates invalid email, bad requests

**Why:** Realistic error simulation for testing retry logic.

### 4. API Server: `src/api/server.ts`

**Changed:**
```typescript
// Accept optional idempotency_key in request body
const { to, from, subject, body, idempotency_key } = req.body;

// Check for duplicate
if (idempotency_key) {
  const existing = await query(
    'SELECT id, status FROM messages WHERE project_id = $1 AND idempotency_key = $2',
    [projectId, idempotency_key]
  );
  
  if (existing.length > 0) {
    return res.status(200).json({ 
      message_id: existing[0].id, 
      duplicate: true 
    });
  }
}

// Insert with idempotency_key
INSERT INTO messages (..., idempotency_key) VALUES (..., $8)
```

**Why:** Prevents duplicate message creation when client retries API call.

### 5. Worker: `src/worker/worker.ts`

**Major changes:**

#### 5a. Exponential Backoff
```typescript
function calculateBackoff(attempts: number): number {
  const delays = [1, 5, 30, 300, 1800]; // seconds
  return delays[Math.min(attempts, delays.length - 1)];
}
```
- Attempt 1: 1 second
- Attempt 2: 5 seconds
- Attempt 3: 30 seconds
- Attempt 4: 5 minutes
- Attempt 5+: 30 minutes

#### 5b. Query for Retries
```sql
SELECT ... FROM messages
WHERE status = 'queued'
  AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
```
- Processes new messages (next_attempt_at IS NULL)
- Processes retry-ready messages (next_attempt_at <= NOW)

#### 5c. Dead Letter Handling
```typescript
if (message.attempts >= message.max_attempts) {
  // Move to dead letter
  UPDATE messages SET status = 'dead' WHERE id = $1
  INSERT INTO events (event_type) VALUES ('dead')
  continue;
}
```

#### 5d. Failure Classification
```typescript
if (result.retryable) {
  // Schedule retry
  UPDATE messages SET next_attempt_at = $1 WHERE id = $2
} else {
  // Permanent failure - mark as failed
  UPDATE messages SET status = 'failed' WHERE id = $1
}
```

**Why:** Production-grade delivery requires retry on transient failures, but must give up on permanent failures.

## Behavior Changes

### Idempotency

**Before:**
```bash
# Two identical requests create two messages
POST /v1/messages {"to":"...","from":"...","body":"..."}
→ message_id: aaa-111

POST /v1/messages {"to":"...","from":"...","body":"..."}
→ message_id: bbb-222  # Duplicate!
```

**After:**
```bash
# With idempotency_key, second request returns existing message
POST /v1/messages {"to":"...","from":"...","body":"...","idempotency_key":"abc123"}
→ message_id: aaa-111, status: queued

POST /v1/messages {"to":"...","from":"...","body":"...","idempotency_key":"abc123"}
→ message_id: aaa-111, duplicate: true  # Same message returned
```

### Retry Logic

**Before:**
- Message fails → stays in `queued` forever or marked `failed` immediately

**After:**
- **Transient failure** → `attempts++`, `next_attempt_at = NOW() + backoff`, stays `queued`
- **Permanent failure** → `status = 'failed'`, no retry
- **Max attempts exceeded** → `status = 'dead'`, emit `dead` event

### Message Lifecycle

```
New Message
  ↓
[queued] attempts=0, next_attempt_at=NULL
  ↓
Worker processes
  ↓
┌─────────────────────────────────┐
│ Success?                        │
├─────────────────────────────────┤
│ YES → [delivered]               │
│       + increment usage         │
│                                 │
│ NO + retryable                  │
│   → attempts++                  │
│   → next_attempt_at = NOW+backoff│
│   → stay [queued]               │
│   → retry later                 │
│                                 │
│ NO + permanent                  │
│   → [failed]                    │
│   → no retry                    │
│                                 │
│ attempts >= max_attempts        │
│   → [dead]                      │
│   → emit dead event             │
└─────────────────────────────────┘
```

## Example Scenarios

### Scenario 1: Transient Failure (Rate Limit)

```
Time    Event
----    -----
00:00   Message created, attempts=0
00:01   Worker tries, provider returns retryable=true
        → attempts=1, next_attempt_at=00:02 (1s backoff)
00:02   Worker tries, fails again
        → attempts=2, next_attempt_at=00:07 (5s backoff)
00:07   Worker tries, succeeds
        → status=delivered, usage incremented
```

### Scenario 2: Permanent Failure (Invalid Email)

```
Time    Event
----    -----
00:00   Message created, attempts=0
00:01   Worker tries, provider returns retryable=false
        → attempts=1, status=failed
        → No retry scheduled
```

### Scenario 3: Dead Letter (Max Attempts)

```
Time    Event
----    -----
00:00   Message created, attempts=0, max_attempts=3
00:01   Worker tries, fails (retryable), attempts=1, next=00:02
00:02   Worker tries, fails (retryable), attempts=2, next=00:07
00:07   Worker tries, fails (retryable), attempts=3, next=00:37
00:37   Worker checks: attempts(3) >= max_attempts(3)
        → status=dead, event_type=dead
        → No more retries
```

## Testing

### Test Idempotency

```bash
# First request
curl -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "from": "sender@example.com",
    "body": "Test",
    "idempotency_key": "test-123"
  }'
# → 202 Accepted, message_id: xxx

# Second request (duplicate)
curl -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "from": "sender@example.com",
    "body": "Test",
    "idempotency_key": "test-123"
  }'
# → 200 OK, message_id: xxx, duplicate: true
```

### Test Retry Behavior

Check worker logs for messages with simulated failures:

```
[INFO] Processing message {"messageId":"xxx","attempt":1}
[WARN] GoogleEmailProvider: Simulated transient failure
[WARN] Message failed (retryable), scheduled for retry {"backoffSeconds":1}

[INFO] Processing message {"messageId":"xxx","attempt":2}
[WARN] GoogleEmailProvider: Simulated transient failure
[WARN] Message failed (retryable), scheduled for retry {"backoffSeconds":5}

[INFO] Processing message {"messageId":"xxx","attempt":3}
[INFO] GoogleEmailProvider: Email sent successfully
[INFO] Message delivered
```

### Verify Dead Letter

After 3 failed attempts:
```sql
SELECT id, status, attempts, max_attempts 
FROM messages 
WHERE status = 'dead';

SELECT event_type, created_at 
FROM events 
WHERE event_type = 'dead';
```

## Safety Guarantees

✅ **Transaction Safety**: All updates in single transaction, rollback on error  
✅ **Crash Safety**: Messages stay `queued` if worker crashes, will retry  
✅ **Idempotency**: Duplicate API calls don't create duplicate messages  
✅ **No Infinite Loops**: Max attempts prevents endless retries  
✅ **Backpressure**: SKIP LOCKED prevents worker overload  
✅ **Observability**: All state changes logged in events table  

## Configuration

Default values (can be overridden per message):
- `max_attempts`: 3
- Backoff schedule: 1s, 5s, 30s, 5m, 30m
- Failure rates (MOCKED): 10% transient, 5% permanent, 85% success

## What's Still Mocked

- ❌ Google Email API (logs only, no real sends)
- ❌ Failure simulation (random, not real provider errors)

## Next Steps

To go live:
1. Run migration `003_production_delivery.sql`
2. Replace GoogleEmailProvider mock with real API
3. Configure real failure classification based on Google error codes
4. Monitor dead letter queue
5. Add alerting for high failure rates

## Build Status

✅ Compiles successfully  
✅ Zero TypeScript errors  
✅ All changes backward compatible
