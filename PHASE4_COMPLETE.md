# Phase 4: Customer-Facing API Complete

## 1. Project Wall (Security)
- **Implemented:** `src/api/queries.ts`
- **Constraint:** All queries require `projectId` as first argument.
- **Enforcement:** `AND project_id = $1` present in every single query.
- **Isolation:** Admin queries are NOT reused.

## 2. Endpoints Implemented

### Identity & Limits
- `GET /v1/me`
  - Returns project status, limits, current usage.
  - Useful for dashboards or programmatic limit checks.

### Messages
- `GET /v1/messages`
  - **Filters:** limit, offset, status, destination.
  - **Count:** Project-scoped total count for accurate pagination.
- `GET /v1/messages/:id`
  - **Redaction:** `?redact_body=true` supported.
  - **Security:** Returns 404 if message exists but belongs to another project.
- `GET /v1/messages/:id/events`
  - **Security:** Uses JOIN to ensure `messages.project_id` matches.

### Usage
- `GET /v1/usage`
  - Current month breakdown.
- `GET /v1/usage/history`
  - Last 12 months history.

## 3. Architecture
- **Handlers:** `src/api/handlers/` (me.ts, messages.ts, usage.ts)
- **Router:** `src/api/routes.ts` (Mounted at `/v1`)
- **Wiring:** `src/api/server.ts` imports and mounts the router.

## 4. Verification
✅ **Build:** `npm run build` passes.
✅ **Isolation:** Queries verified to be project-scoped.
✅ **No Refactor:** `POST /messages` left untouched.

## Next Steps for User
1. Consume the API using the project API key.
2. Build a simple dashboard using `GET /v1/me` and `GET /v1/messages`.
