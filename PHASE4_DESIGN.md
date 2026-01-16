# Phase 4: Customer API Design Specification

## Scope
Public-facing Developer API for OrbiCloud customers.
**Base URL:** `/v1`
**Authentication:** Bearer Token (Project API Key)

---

## 🔒 Security Model: "The Project Wall"
- **Principle:** A customer must NEVER see data from another project.
- **Enforcement:** All SQL queries MUST include `AND project_id = $1` where `$1` is the authenticated project ID.
- **Isolation:** No reuse of Admin queries. Dedicated customer-scoped queries only.

---

## 1. Identity & Limits

### GET /v1/me
Returns details about the authenticated project and its limits.

**Response (200 OK):**
```json
{
  "id": "uuid",
  "name": "My Project",
  "status": "active", // or 'suspended'
  "limits": {
    "monthly": 10000,
    "rate_per_minute": 100
  },
  "usage": {
    "current_month": 420,
    "quota_remaining": 9580
  },
  "tier": "starter" // inferred from limits or future field
}
```

---

## 2. Messages (Read-Only)

### GET /v1/messages
List messages sent by the project.

**Query Parameters:**
- `limit` (default 50, max 100)
- `offset` (default 0)
- `status` (queued, delivered, failed, dead)
- `to` (filter by recipient email)

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "msg_123",
      "status": "delivered",
      "to": "user@example.com",
      "subject": "Hello",
      "created_at": "2026-01-01T12:00:00Z"
    }
  ],
  "pagination": {
    "total": 120,
    "limit": 50,
    "offset": 0,
    "has_more": true
  }
}
```

### GET /v1/messages/:id
Get full details of a specific message.
**Must ensure `project_id` matches.**

**Response (200 OK):**
```json
{
  "id": "msg_123",
  "status": "delivered",
  "to": "user@example.com",
  "from": "me@myapp.com",
  "subject": "Hello",
  "body": "...",
  "attempts": 1,
  "created_at": "...",
  "events_url": "/v1/messages/msg_123/events"
}
```

### GET /v1/messages/:id/events
Get lifecycle events for a message.

**Response (200 OK):**
```json
{
  "data": [
    {
      "type": "queued",
      "created_at": "..."
    },
    {
      "type": "delivered",
      "created_at": "..."
    }
  ]
}
```

---

## 3. Usage Analytics

### GET /v1/usage
Current month usage breakdown.

**Response (200 OK):**
```json
{
  "period": "2026-01",
  "total": 420,
  "breakdown": {
    "email": 420,
    "sms": 0
  }
}
```

### GET /v1/usage/history
Historical usage (last 12 months).

**Response (200 OK):**
```json
{
  "data": [
    {
      "period": "2025-12",
      "total": 5000
    },
    {
      "period": "2026-01",
      "total": 420
    }
  ]
}
```

---

## Implementation Plan

1. **Scaffold:** Create `src/api/routes.ts` and `src/api/queries.ts`.
2. **Handlers:** One file per resource (`src/api/handlers/messages.ts`, etc).
3. **Mount:** Add `app.use('/v1', attributesRoutes)` to `server.ts`.
4. **Safety:** Review all queries for `project_id` inclusion.

**Note:** `POST /v1/messages` remains in `server.ts` or can be moved to `routes.ts` if refactoring is allowed (constraint says "Do NOT rewrite existing code", so we will leave it or import it).
*Decision: Leave `POST /messages` in `server.ts` to avoid diff noise, mount new routes alongside it.*
