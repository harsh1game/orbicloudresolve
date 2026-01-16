# Admin Authentication Middleware

## Overview

Scoped authentication system for admin API with read/write separation.

## Implementation

**File:** `src/admin/auth.ts`

### Features

1. **Two-tier access control**
   - READ scope: View-only access to all data
   - WRITE scope: Full access (read + modify)

2. **Static API keys**
   - `ADMIN_API_KEY_READ` - Read-only operations
   - `ADMIN_API_KEY_WRITE` - Read + write operations

3. **Request augmentation**
   - Attaches `req.admin.scope` to request
   - Middleware can check scope before executing

4. **Clear error responses**
   - 401 Unauthorized - Invalid/missing key
   - 403 Forbidden - Insufficient scope

## Environment Variables

Add to `.env`:

```bash
# Generate secure keys
ADMIN_API_KEY_READ=$(openssl rand -hex 32)
ADMIN_API_KEY_WRITE=$(openssl rand -hex 32)
```

Example:
```bash
ADMIN_API_KEY_READ=a1b2c3d4e5f6...
ADMIN_API_KEY_WRITE=x9y8z7w6v5u4...
```

## Usage Examples

### Basic Route Protection

```typescript
import express from 'express';
import { adminAuth } from '../admin/auth';

const router = express.Router();

// All routes require admin auth
router.use(adminAuth);

// Read operation - both READ and WRITE keys work
router.get('/projects', (req, res) => {
  // Implementation...
});
```

### Write-Only Routes

```typescript
import { adminAuth, requireWriteScope } from '../admin/auth';

// Write operation - requires WRITE key
router.patch('/projects/:id/status', adminAuth, requireWriteScope, (req, res) => {
  // Only ADMIN_API_KEY_WRITE can access this
});
```

### Intent-Specific Endpoints (Recommended Pattern)

```typescript
// Split writes by intent
router.patch('/projects/:id/status', adminAuth, requireWriteScope, updateStatus);
router.patch('/projects/:id/limits', adminAuth, requireWriteScope, updateLimits);
router.patch('/projects/:id/tier', adminAuth, requireWriteScope, updateTier);

// Read endpoints - no scope check needed
router.get('/projects/:id', adminAuth, getProject);
router.get('/messages/:id', adminAuth, getMessage);
```

### Conditional Logic

```typescript
import { getAdminScope, AdminRequest } from '../admin/auth';

router.get('/projects/:id', adminAuth, (req, res) => {
  const scope = getAdminScope(req);
  const adminReq = req as AdminRequest;
  
  // Different behavior based on scope
  if (scope === 'write') {
    // Include sensitive fields
  } else {
    // Read-only view
  }
});
```

## Request Flow

### Successful READ Authentication

```
Request: GET /v1/admin/projects
Header: Authorization: Bearer a1b2c3d4...

↓ adminAuth middleware
  - Extract token
  - Match against ADMIN_API_KEY_READ
  - Attach req.admin = { scope: 'read', authenticated: true }
  - next()

↓ Route handler
  - Access req.admin.scope → 'read'
  - Return data

Response: 200 OK
```

### Successful WRITE Authentication

```
Request: PATCH /v1/admin/projects/123/status
Header: Authorization: Bearer x9y8z7...

↓ adminAuth middleware
  - Extract token
  - Match against ADMIN_API_KEY_WRITE
  - Attach req.admin = { scope: 'write', authenticated: true }
  - next()

↓ requireWriteScope middleware
  - Check req.admin.scope === 'write' ✓
  - next()

↓ Route handler
  - Update project
  - Return success

Response: 200 OK
```

### Failed Authentication (Invalid Key)

```
Request: GET /v1/admin/projects
Header: Authorization: Bearer invalid-key

↓ adminAuth middleware
  - Extract token
  - No match against READ or WRITE keys
  - Return 401

Response: 401 Unauthorized
{
  "error": "unauthorized",
  "message": "Invalid admin API key"
}
```

### Failed Authorization (Insufficient Scope)

```
Request: PATCH /v1/admin/projects/123/status
Header: Authorization: Bearer a1b2c3d4... (READ key)

↓ adminAuth middleware
  - Match against ADMIN_API_KEY_READ
  - Attach req.admin = { scope: 'read', authenticated: true }
  - next()

↓ requireWriteScope middleware
  - Check req.admin.scope === 'write' ✗ (actual: 'read')
  - Return 403

Response: 403 Forbidden
{
  "error": "forbidden",
  "message": "Write scope required. Use ADMIN_API_KEY_WRITE for this operation."
}
```

## Error Responses

### 401 Unauthorized - Missing Header

```json
{
  "error": "unauthorized",
  "message": "Missing Authorization header. Use: Authorization: Bearer <admin_key>"
}
```

### 401 Unauthorized - Invalid Format

```json
{
  "error": "unauthorized",
  "message": "Invalid Authorization format. Use: Authorization: Bearer <admin_key>"
}
```

### 401 Unauthorized - Invalid Key

```json
{
  "error": "unauthorized",
  "message": "Invalid admin API key"
}
```

### 403 Forbidden - Insufficient Scope

```json
{
  "error": "forbidden",
  "message": "Write scope required. Use ADMIN_API_KEY_WRITE for this operation."
}
```

## Security Considerations

### ✅ Good Practices

1. **Separate keys for separate scopes**
   - READ key for analytics/monitoring tools
   - WRITE key for admin operations only
   - Can rotate independently

2. **Long, random keys**
   - Use `openssl rand -hex 32` (64 characters)
   - Never commit to version control
   - Store in `.env` (gitignored)

3. **Logging**
   - Auth attempts logged with scope
   - Failed attempts logged with path/method
   - No sensitive data in logs

4. **No key in responses**
   - Keys never echo back
   - Errors don't leak key information

### ⚠️ Limitations (Acceptable for Internal Admin API)

1. **Static keys**
   - Not user-specific
   - Can't revoke individual sessions
   - **Mitigation:** Rotate keys when needed

2. **No rate limiting**
   - Admin API not rate-limited
   - **Mitigation:** Only internal use, trusted operators

3. **No audit log**
   - No persistent record of who did what
   - **Mitigation:** Application logs capture actions

4. **Bearer token in header**
   - Visible in logs, proxies
   - **Mitigation:** HTTPS only in production

### 🔒 Future Enhancements (Not Now)

- JWT-based tokens with expiration
- User-specific admin accounts
- Audit log table
- IP whitelist
- MFA for write operations

## Testing

### Test READ Access

```bash
# Set READ key
export ADMIN_KEY_READ="test-read-key-123"

# Start server with env
ADMIN_API_KEY_READ=test-read-key-123 \
ADMIN_API_KEY_WRITE=test-write-key-456 \
npm run dev:api

# Test read endpoint (should succeed)
curl http://localhost:3000/v1/admin/projects \
  -H "Authorization: Bearer test-read-key-123"

# Test write endpoint (should fail with 403)
curl -X PATCH http://localhost:3000/v1/admin/projects/123/status \
  -H "Authorization: Bearer test-read-key-123" \
  -H "Content-Type: application/json" \
  -d '{"status":"suspended"}'
```

### Test WRITE Access

```bash
# Test write endpoint with WRITE key (should succeed)
curl -X PATCH http://localhost:3000/v1/admin/projects/123/status \
  -H "Authorization: Bearer test-write-key-456" \
  -H "Content-Type: application/json" \
  -d '{"status":"suspended"}'
```

### Test Invalid Key

```bash
# Should return 401
curl http://localhost:3000/v1/admin/projects \
  -H "Authorization: Bearer wrong-key"
```

## TypeScript Types

```typescript
// Extended request type
interface AdminRequest extends Request {
  admin: {
    scope: 'read' | 'write';
    authenticated: boolean;
  };
}

// Usage in route handler
router.get('/projects', adminAuth, (req, res) => {
  const adminReq = req as AdminRequest;
  console.log(adminReq.admin.scope); // 'read' or 'write'
});
```

## Middleware Chain Examples

### Read-only endpoint

```typescript
router.get('/projects/:id',
  adminAuth,           // Authenticate (READ or WRITE)
  getProject           // Handler
);
```

### Write endpoint

```typescript
router.patch('/projects/:id/status',
  adminAuth,           // Authenticate (READ or WRITE)
  requireWriteScope,   // Require WRITE scope
  updateProjectStatus  // Handler
);
```

### Custom scope check

```typescript
router.get('/debug/:id',
  adminAuth,
  (req, res, next) => {
    const scope = getAdminScope(req);
    if (scope !== 'write') {
      return res.status(403).json({ error: 'Debug requires write scope' });
    }
    next();
  },
  debugHandler
);
```

## Summary

✅ **Implemented:** Scoped admin authentication  
✅ **Two keys:** READ (view-only) and WRITE (full access)  
✅ **Middleware:** `adminAuth` + `requireWriteScope`  
✅ **Clear errors:** 401 (auth failed) and 403 (insufficient scope)  
✅ **Logs:** All auth attempts logged  
✅ **Type-safe:** TypeScript `AdminRequest` interface  

**Ready for:** Building admin routes with proper access control.
