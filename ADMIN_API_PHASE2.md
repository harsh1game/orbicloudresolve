# Admin API - Phase 2 Implementation Summary

## ✅ COMPLETED

### Step 0: Fixed Phase 1 Issue

**File:** `src/admin/queries.ts`

**Issue Fixed:** SQL interpolation vulnerability in `getUsageHistory`

**Before:**
```sql
AND period >= TO_CHAR(NOW() - INTERVAL '${months} months', 'YYYY-MM')
```

**After:**
```sql
AND period >= TO_CHAR(NOW() - INTERVAL '1 month' * $2, 'YYYY-MM')
```

**Impact:** Eliminated SQL injection risk by using parameterized interval multiplication.

---

### Step 1: Implemented Phase 2 WRITE Endpoints

All 3 WRITE endpoints implemented with full safety guardrails.

---

## 📁 Modified/New Files

### Modified Files
1. ✏️ `src/admin/queries.ts` - Fixed SQL interpolation + added 4 write queries
2. ✏️ `src/admin/routes.ts` - Added 3 WRITE endpoints with `requireWriteScope`

### New Files
3. ✨ `src/admin/handlers/write.ts` - All Phase 2 write handlers

---

## 🔒 Implemented Endpoints

### 1. PATCH /v1/admin/projects/:id/status

**Purpose:** Suspend or activate a project

**Authentication:** Requires `ADMIN_API_KEY_WRITE`

**Request Body:**
```json
{
  "status": "active" | "suspended"
}
```

**Validation:**
- ✅ `status` field required
- ✅ Must be exactly `"active"` or `"suspended"`
- ✅ Project must exist

**Response (200 OK):**
```json
{
  "id": "uuid",
  "name": "Acme Corp",
  "owner_email": "admin@acme.com",
  "status": "suspended"
}
```

**Errors:**
- `400 validation_error` - Missing or invalid status
- `404 not_found` - Project doesn't exist
- `403 forbidden` - Used READ key instead of WRITE
- `500 internal_error` - Database failure

**Example curl:**
```bash
curl -X PATCH http://localhost:3000/v1/admin/projects/00000000-0000-0000-0000-000000000000/status \
  -H "Authorization: Bearer $ADMIN_API_KEY_WRITE" \
  -H "Content-Type: application/json" \
  -d '{"status":"suspended"}'
```

**Idempotent:** ✅ Yes - setting same status multiple times is safe

---

### 2. PATCH /v1/admin/projects/:id/limits

**Purpose:** Update monthly quota and/or rate limits

**Authentication:** Requires `ADMIN_API_KEY_WRITE`

**Request Body:**
```json
{
  "monthly_limit"?: number | null,
  "rate_limit_per_minute"?: number | null
}
```

**Validation:**
- ✅ At least ONE field required
- ✅ `monthly_limit`: null (unlimited) OR integer >= 0
- ✅ `rate_limit_per_minute`: null (unlimited) OR integer >= 1
- ✅ Project must exist
- ✅ **Safety:** `monthly_limit` must be >= current month's usage

**Response (200 OK):**
```json
{
  "id": "uuid",
  "name": "Acme Corp",
  "limits": {
    "monthly_limit": 50000,
    "rate_limit_per_minute": 500
  }
}
```

**Errors:**
- `400 validation_error` - No fields provided or invalid values
- `400 limit_below_usage` - Attempted to set limit below current usage
- `404 not_found` - Project doesn't exist
- `403 forbidden` - Used READ key
- `500 internal_error` - Database failure

**Example curl (update both):**
```bash
curl -X PATCH http://localhost:3000/v1/admin/projects/00000000-0000-0000-0000-000000000000/limits \
  -H "Authorization: Bearer $ADMIN_API_KEY_WRITE" \
  -H "Content-Type: application/json" \
  -d '{
    "monthly_limit": 50000,
    "rate_limit_per_minute": 500
  }'
```

**Example curl (update only monthly_limit):**
```bash
curl -X PATCH http://localhost:3000/v1/admin/projects/00000000-0000-0000-0000-000000000000/limits \
  -H "Authorization: Bearer $ADMIN_API_KEY_WRITE" \
  -H "Content-Type: application/json" \
  -d '{"monthly_limit": 100000}'
```

**Example curl (set unlimited):**
```bash
curl -X PATCH http://localhost:3000/v1/admin/projects/00000000-0000-0000-0000-000000000000/limits \
  -H "Authorization: Bearer $ADMIN_API_KEY_WRITE" \
  -H "Content-Type: application/json" \
  -d '{"monthly_limit": null}'
```

**Idempotent:** ✅ Yes - uses COALESCE for partial updates

**Safety Check Example:**
```bash
# This will FAIL if project already used 6000 messages this month
curl -X PATCH http://localhost:3000/v1/admin/projects/00000000-0000-0000-0000-000000000000/limits \
  -H "Authorization: Bearer $ADMIN_API_KEY_WRITE" \
  -H "Content-Type: application/json" \
  -d '{"monthly_limit": 5000}'

# Response: 400
{
  "error": "limit_below_usage",
  "message": "Cannot set monthly_limit to 5000. Current usage this month: 6000",
  "current_usage": 6000,
  "requested_limit": 5000
}
```

---

### 3. PATCH /v1/admin/projects/:id/tier

**Purpose:** Apply a pricing tier's limits to a project

**Authentication:** Requires `ADMIN_API_KEY_WRITE`

**Request Body:**
```json
{
  "tier": "free" | "starter" | "pro" | "enterprise"
}
```

**Validation:**
- ✅ `tier` field required
- ✅ Must be valid tier ID from config (`free`, `starter`, `pro`, `enterprise`)
- ✅ Project must exist
- ✅ **Safety:** Tier's `monthly_limit` must be >= current month's usage

**Response (200 OK):**
```json
{
  "id": "uuid",
  "name": "Acme Corp",
  "tier": "pro",
  "limits": {
    "monthly_limit": 1000000,
    "rate_limit_per_minute": 1000
  }
}
```

**Errors:**
- `400 validation_error` - Missing tier or invalid tier ID
- `400 tier_below_usage` - Tier's limit is below current usage
- `404 not_found` - Project doesn't exist
- `403 forbidden` - Used READ key
- `500 internal_error` - Database failure

**Example curl:**
```bash
curl -X PATCH http://localhost:3000/v1/admin/projects/00000000-0000-0000-0000-000000000000/tier \
  -H "Authorization: Bearer $ADMIN_API_KEY_WRITE" \
  -H "Content-Type: application/json" \
  -d '{"tier":"pro"}'
```

**What happens:**
1. Looks up tier config (`pro` = 1M monthly, 1000/min rate)
2. Checks current usage (e.g., 4532 messages this month)
3. Validates tier limit >= usage (1M >= 4532 ✓)
4. Atomically updates both limits

**Idempotent:** ✅ Yes - applying same tier multiple times is safe

**Safety Check Example:**
```bash
# Project has used 5000 messages this month
# Trying to apply "free" tier (limit: 1000)

curl -X PATCH http://localhost:3000/v1/admin/projects/00000000-0000-0000-0000-000000000000/tier \
  -H "Authorization: Bearer $ADMIN_API_KEY_WRITE" \
  -H "Content-Type: application/json" \
  -d '{"tier":"free"}'

# Response: 400
{
  "error": "tier_below_usage",
  "message": "Cannot apply tier \"Free\". Tier limit: 1000, Current usage: 5000",
  "tier_limit": 1000,
  "current_usage": 5000
}
```

---

## 🛡️ Safety Guardrails Implemented

### 1. Prevent Limits Below Current Usage
- ✅ Queries current month's usage from `usage` table
- ✅ Rejects update if `new_limit < current_usage`
- ✅ Returns clear error with both values
- ✅ Applies to both `/limits` and `/tier` endpoints

### 2. Tier Validation
- ✅ Validates tier ID against `PRICING_TIERS` config
- ✅ Returns list of valid tiers in error message
- ✅ Prevents typos and invalid tier assignments

### 3. Partial Updates (COALESCE)
- ✅ `/limits` endpoint allows updating only `monthly_limit` OR only `rate_limit_per_minute`
- ✅ Uses `COALESCE($1, monthly_limit)` pattern
- ✅ Unspecified fields remain unchanged

### 4. Numeric Range Validation
- ✅ `monthly_limit`: null or >= 0
- ✅ `rate_limit_per_minute`: null or >= 1
- ✅ Rejects negative values and zero rate limits

### 5. Write Scope Enforcement
- ✅ All WRITE endpoints use `requireWriteScope` middleware
- ✅ Returns 403 if READ key is used
- ✅ Clear error: "Write scope required. Use ADMIN_API_KEY_WRITE"

### 6. Idempotency
- ✅ All endpoints safe to call multiple times
- ✅ Setting same status/limits/tier repeatedly is harmless
- ✅ Returns current state on success

### 7. Return Updated State
- ✅ All endpoints return updated fields after successful PATCH
- ✅ Client doesn't need separate GET request
- ✅ Confirms operation succeeded

---

## 🧪 Testing Examples

### Setup
```bash
export ADMIN_READ_KEY="test-read-key-123"
export ADMIN_WRITE_KEY="test-write-key-456"
export PROJECT_ID="00000000-0000-0000-0000-000000000000"
```

### Test 1: Suspend Project
```bash
curl -X PATCH http://localhost:3000/v1/admin/projects/$PROJECT_ID/status \
  -H "Authorization: Bearer $ADMIN_WRITE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"suspended"}'

# Expected: 200 OK with updated status
```

### Test 2: Reactivate Project
```bash
curl -X PATCH http://localhost:3000/v1/admin/projects/$PROJECT_ID/status \
  -H "Authorization: Bearer $ADMIN_WRITE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"active"}'
```

### Test 3: Update Limits
```bash
curl -X PATCH http://localhost:3000/v1/admin/projects/$PROJECT_ID/limits \
  -H "Authorization: Bearer $ADMIN_WRITE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "monthly_limit": 100000,
    "rate_limit_per_minute": 1000
  }'
```

### Test 4: Apply Starter Tier
```bash
curl -X PATCH http://localhost:3000/v1/admin/projects/$PROJECT_ID/tier \
  -H "Authorization: Bearer $ADMIN_WRITE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tier":"starter"}'

# Applies: monthly_limit=10000, rate_limit=100
```

### Test 5: Apply Enterprise (Unlimited)
```bash
curl -X PATCH http://localhost:3000/v1/admin/projects/$PROJECT_ID/tier \
  -H "Authorization: Bearer $ADMIN_WRITE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tier":"enterprise"}'

# Applies: monthly_limit=null, rate_limit=null
```

### Test 6: Test READ Key Rejection
```bash
curl -X PATCH http://localhost:3000/v1/admin/projects/$PROJECT_ID/status \
  -H "Authorization: Bearer $ADMIN_READ_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"suspended"}'

# Expected: 403 Forbidden
{
  "error": "forbidden",
  "message": "Write scope required. Use ADMIN_API_KEY_WRITE for this operation."
}
```

### Test 7: Test Limit Below Usage
```bash
# First, check current usage
curl http://localhost:3000/v1/admin/projects/$PROJECT_ID/usage \
  -H "Authorization: Bearer $ADMIN_READ_KEY"

# If usage is 4532, try setting limit to 4000
curl -X PATCH http://localhost:3000/v1/admin/projects/$PROJECT_ID/limits \
  -H "Authorization: Bearer $ADMIN_WRITE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"monthly_limit": 4000}'

# Expected: 400 limit_below_usage
```

### Test 8: Test Invalid Tier
```bash
curl -X PATCH http://localhost:3000/v1/admin/projects/$PROJECT_ID/tier \
  -H "Authorization: Bearer $ADMIN_WRITE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tier":"platinum"}'

# Expected: 400 validation_error
{
  "error": "validation_error",
  "message": "Invalid tier: platinum. Valid tiers: free, starter, pro, enterprise"
}
```

---

## 📊 Summary

### Implementation Status
- ✅ Fixed SQL interpolation in Phase 1
- ✅ 3 WRITE endpoints implemented
- ✅ All safety guardrails in place
- ✅ Full validation and error handling
- ✅ Build passes (TypeScript compiles)
- ✅ No schema changes required
- ✅ No new dependencies

### Files Changed
- Modified: `src/admin/queries.ts` (+83 lines)
- Modified: `src/admin/routes.ts` (+15 lines)
- Created: `src/admin/handlers/write.ts` (267 lines)

### Safety Features
- ✅ Prevents limits below current usage
- ✅ Validates all tier IDs
- ✅ Enforces WRITE scope
- ✅ Idempotent operations
- ✅ Partial update support
- ✅ Clear error messages
- ✅ Returns updated state

### What's NOT Implemented (By Design)
- ❌ No audit logging (future)
- ❌ No `tier` column in database (inferred from limits)
- ❌ No customer self-service (admin-only)
- ❌ No undo/rollback (idempotent design makes it safe)

---

## 🎯 Phase 2 Complete

All WRITE endpoints are production-ready and follow the approved design exactly.
