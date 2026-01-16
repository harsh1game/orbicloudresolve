# Admin Control Plane API - Phase 1 (READ-ONLY)

## Overview

**Status:** ✅ Implemented  
**Scope:** Read-only endpoints for observability and analytics  
**Authentication:** Bearer token with READ or WRITE admin keys  

## Endpoints Implemented

### Project Management

#### 1. GET /v1/admin/projects

**Purpose:** List all projects with current usage snapshot

**Query Parameters:**
- `status` (optional) - Filter by status: `active`, `suspended`
- `limit` (optional) - Page size (default: 50, max: 100)
- `offset` (optional) - Pagination offset (default: 0)

**Example Request:**
```bash
curl http://localhost:3000/v1/admin/projects?status=active&limit=10 \
  -H "Authorization: Bearer your-admin-read-key"
```

**Example Response:**
```json
{
  "projects": [
    {
      "id": "00000000-0000-0000-0000-000000000000",
      "name": "Acme Corp",
      "owner_email": "admin@acme.com",
      "status": "active",
      "created_at": "2026-01-01T10:00:00Z",
      "limits": {
        "monthly_limit": 10000,
        "rate_limit_per_minute": 100
      },
      "usage_current_month": {
        "total": 4532
      },
      "quota_remaining": 5468
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 10,
    "offset": 0,
    "has_more": false
  }
}
```

---

#### 2. GET /v1/admin/projects/:id

**Purpose:** Get detailed project information with breakdowns

**Example Request:**
```bash
curl http://localhost:3000/v1/admin/projects/00000000-0000-0000-0000-000000000000 \
  -H "Authorization: Bearer your-admin-read-key"
```

**Example Response:**
```json
{
  "id": "00000000-0000-0000-0000-000000000000",
  "name": "Acme Corp",
  "owner_email": "admin@acme.com",
  "status": "active",
  "created_at": "2026-01-01T10:00:00Z",
  "limits": {
    "monthly_limit": 10000,
    "rate_limit_per_minute": 100
  },
  "usage_current_month": {
    "period": "2026-01",
    "total": 4532,
    "by_type": {
      "email": 4532,
      "sms": 0,
      "whatsapp": 0,
      "push": 0
    },
    "by_status": {
      "delivered": 4320,
      "failed": 180,
      "queued": 20,
      "dead": 12
    }
  },
  "quota_remaining": 5468,
  "api_keys": [
    {
      "id": "key-uuid",
      "name": "Production Key",
      "created_at": "2026-01-01T10:00:00Z",
      "last_used_at": "2026-01-01T18:52:34Z",
      "revoked_at": null
    }
  ],
  "rate_limit_current_minute": {
    "count": 12,
    "limit": 100,
    "window": "2026-01-01T19:33:00Z"
  }
}
```

---

### Message Observability

#### 3. GET /v1/admin/projects/:id/messages

**Purpose:** List messages for a project with filtering

**Query Parameters:**
- `status` (optional) - Filter: `queued`, `delivered`, `failed`, `dead`
- `type` (optional) - Filter: `email`, `sms`, `whatsapp`, `push`
- `to` (optional) - Filter by recipient (partial match)
- `from` (optional) - Filter by sender (partial match)
- `limit` (optional) - Page size (default: 50, max: 100)
- `offset` (optional) - Pagination offset (default: 0)

**Example Request:**
```bash
curl "http://localhost:3000/v1/admin/projects/00000000-0000-0000-0000-000000000000/messages?status=delivered&limit=5" \
  -H "Authorization: Bearer your-admin-read-key"
```

**Example Response:**
```json
{
  "messages": [
    {
      "id": "msg-uuid-1",
      "type": "email",
      "status": "delivered",
      "from_address": "noreply@acme.com",
      "to_address": "user@example.com",
      "subject": "Welcome to Acme",
      "attempts": 1,
      "created_at": "2026-01-01T18:52:34Z",
      "updated_at": "2026-01-01T18:52:35Z",
      "idempotency_key": "signup-12345"
    }
  ],
  "pagination": {
    "total": 4320,
    "limit": 5,
    "offset": 0,
    "has_more": true
  },
  "filters_applied": {
    "status": "delivered",
    "type": null,
    "to": null,
    "from": null
  }
}
```

---

#### 4. GET /v1/admin/messages/:id

**Purpose:** Get full message details including body

**Example Request:**
```bash
curl http://localhost:3000/v1/admin/messages/msg-uuid-1 \
  -H "Authorization: Bearer your-admin-read-key"
```

**Example Response:**
```json
{
  "id": "msg-uuid-1",
  "project_id": "00000000-0000-0000-0000-000000000000",
  "type": "email",
  "status": "delivered",
  "from_address": "noreply@acme.com",
  "to_address": "user@example.com",
  "subject": "Welcome to Acme",
  "body": "Hello! Welcome to our platform...",
  "metadata": {
    "campaign_id": "welcome-series",
    "user_id": "12345"
  },
  "idempotency_key": "signup-12345",
  "attempts": 1,
  "max_attempts": 3,
  "next_attempt_at": null,
  "scheduled_for": null,
  "created_at": "2026-01-01T18:52:34Z",
  "updated_at": "2026-01-01T18:52:35Z"
}
```

---

#### 5. GET /v1/admin/messages/:id/events

**Purpose:** Get event timeline for a message (audit log)

**Example Request:**
```bash
curl http://localhost:3000/v1/admin/messages/msg-uuid-1/events \
  -H "Authorization: Bearer your-admin-read-key"
```

**Example Response:**
```json
{
  "message_id": "msg-uuid-1",
  "events": [
    {
      "id": "event-uuid-1",
      "event_type": "requested",
      "created_at": "2026-01-01T18:52:34.123Z",
      "provider_response": null
    },
    {
      "id": "event-uuid-2",
      "event_type": "delivered",
      "created_at": "2026-01-01T18:52:35.456Z",
      "provider_response": {
        "id": "mock_google_1735740755456",
        "threadId": "thread_msg-uuid-1",
        "labelIds": ["SENT"]
      }
    }
  ],
  "total_events": 2
}
```

---

### Usage Analytics

#### 6. GET /v1/admin/projects/:id/usage

**Purpose:** Current month usage breakdown

**Example Request:**
```bash
curl http://localhost:3000/v1/admin/projects/00000000-0000-0000-0000-000000000000/usage \
  -H "Authorization: Bearer your-admin-read-key"
```

**Example Response:**
```json
{
  "project_id": "00000000-0000-0000-0000-000000000000",
  "period": "2026-01",
  "total": 4532,
  "by_type": {
    "email": 4532,
    "sms": 0,
    "whatsapp": 0,
    "push": 0
  },
  "limits": {
    "monthly_limit": 10000,
    "rate_limit_per_minute": 100
  },
  "quota_remaining": 5468,
  "usage_percent": 45.32
}
```

---

#### 7. GET /v1/admin/projects/:id/usage/history

**Purpose:** Historical usage for last N months

**Query Parameters:**
- `months` (optional) - Number of months (default: 6, max: 12)

**Example Request:**
```bash
curl "http://localhost:3000/v1/admin/projects/00000000-0000-0000-0000-000000000000/usage/history?months=3" \
  -H "Authorization: Bearer your-admin-read-key"
```

**Example Response:**
```json
{
  "project_id": "00000000-0000-0000-0000-000000000000",
  "history": [
    {
      "period": "2025-11",
      "total": 8234,
      "by_type": {
        "email": 8234
      },
      "limit": 10000
    },
    {
      "period": "2025-12",
      "total": 9102,
      "by_type": {
        "email": 9102
      },
      "limit": 10000
    },
    {
      "period": "2026-01",
      "total": 4532,
      "by_type": {
        "email": 4532
      },
      "limit": 10000
    }
  ],
  "months": 3
}
```

---

### Pricing Tiers

#### 8. GET /v1/admin/tiers

**Purpose:** Get all available pricing tiers (config-only)

**Example Request:**
```bash
curl http://localhost:3000/v1/admin/tiers \
  -H "Authorization: Bearer your-admin-read-key"
```

**Example Response:**
```json
{
  "tiers": [
    {
      "id": "free",
      "name": "Free",
      "limits": {
        "monthly_limit": 1000,
        "rate_limit_per_minute": 10
      },
      "price_monthly_usd": 0,
      "features": [
        "Email only",
        "Basic support",
        "3 retry attempts",
        "API access"
      ]
    },
    {
      "id": "starter",
      "name": "Starter",
      "limits": {
        "monthly_limit": 10000,
        "rate_limit_per_minute": 100
      },
      "price_monthly_usd": 29,
      "features": [
        "Email + SMS",
        "Priority support",
        "Advanced analytics",
        "Idempotency keys",
        "Event webhooks"
      ]
    },
    {
      "id": "pro",
      "name": "Pro",
      "limits": {
        "monthly_limit": 1000000,
        "rate_limit_per_minute": 1000
      },
      "price_monthly_usd": 299,
      "features": [
        "All channels (Email, SMS, WhatsApp, Push)",
        "24/7 support",
        "99.9% SLA",
        "Dedicated success manager",
        "Custom integrations",
        "Volume discounts"
      ]
    },
    {
      "id": "enterprise",
      "name": "Enterprise",
      "limits": {
        "monthly_limit": null,
        "rate_limit_per_minute": null
      },
      "price_monthly_usd": 0,
      "features": [
        "Everything in Pro",
        "Unlimited volume",
        "Custom SLA",
        "On-premise deployment option",
        "Dedicated infrastructure",
        "White-label solution"
      ]
    }
  ]
}
```

---

## Error Responses

All endpoints follow standardized error format:

### 401 Unauthorized
```json
{
  "error": "unauthorized",
  "message": "Invalid admin API key"
}
```

### 404 Not Found
```json
{
  "error": "not_found",
  "message": "Project not found"
}
```

### 500 Internal Error
```json
{
  "error": "internal_error",
  "message": "Failed to list projects"
}
```

---

## File Structure

```
src/admin/
├── auth.ts              # Admin authentication middleware
├── routes.ts            # Route definitions
├── queries.ts           # SQL queries
├── tiers.ts             # Pricing tier config
└── handlers/
    ├── projects.ts      # Project handlers
    ├── messages.ts      # Message handlers
    ├── usage.ts         # Usage handlers
    └── tiers.ts         # Tier handler
```

---

## Testing

### Setup
1. Set admin API keys in `.env`:
```bash
ADMIN_API_KEY_READ=test-read-key-123
ADMIN_API_KEY_WRITE=test-write-key-456
```

2. Start API server:
```bash
npm run dev:api
```

### Test Endpoints

```bash
# Set key for all tests
export ADMIN_KEY="test-read-key-123"

# 1. List projects
curl http://localhost:3000/v1/admin/projects \
  -H "Authorization: Bearer $ADMIN_KEY"

# 2. Get project details
curl http://localhost:3000/v1/admin/projects/00000000-0000-0000-0000-000000000000 \
  -H "Authorization: Bearer $ADMIN_KEY"

# 3. List messages
curl "http://localhost:3000/v1/admin/projects/00000000-0000-0000-0000-000000000000/messages?limit=5" \
  -H "Authorization: Bearer $ADMIN_KEY"

# 4. Get message
curl http://localhost:3000/v1/admin/messages/msg-id \
  -H "Authorization: Bearer $ADMIN_KEY"

# 5. Get message events
curl http://localhost:3000/v1/admin/messages/msg-id/events \
  -H "Authorization: Bearer $ADMIN_KEY"

# 6. Get current usage
curl http://localhost:3000/v1/admin/projects/00000000-0000-0000-0000-000000000000/usage \
  -H "Authorization: Bearer $ADMIN_KEY"

# 7. Get usage history
curl "http://localhost:3000/v1/admin/projects/00000000-0000-0000-0000-000000000000/usage/history?months=6" \
  -H "Authorization: Bearer $ADMIN_KEY"

# 8. Get tiers
curl http://localhost:3000/v1/admin/tiers \
  -H "Authorization: Bearer $ADMIN_KEY"
```

---

## Implementation Summary

✅ **8 READ-ONLY endpoints implemented**  
✅ **Offset-based pagination** (limit, offset)  
✅ **Query parameter validation**  
✅ **Protected by adminAuth middleware**  
✅ **Standardized error responses**  
✅ **Uses existing database schema**  
✅ **No breaking changes**  
✅ **Build verified**  

---

## Next Steps (Phase 2 - NOT IMPLEMENTED YET)

The following WRITE endpoints are designed but NOT yet implemented:

- PATCH /v1/admin/projects/:id/status
- PATCH /v1/admin/projects/:id/limits
- PATCH /v1/admin/projects/:id/tier

These will require `requireWriteScope` middleware and UPDATE queries.

**DO NOT PROCEED** without explicit approval from product owner.
