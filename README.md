# OrbiCloud V2 - Minimal Backend Skeleton

A minimal, event-driven email API backend built with Node.js, TypeScript, Express, and PostgreSQL.

## Project Structure

```
orbicloud-v2/
├── src/
│   ├── cmd/              # Entry points (binaries)
│   │   ├── api.ts        # API server entry point
│   │   └── worker.ts     # Worker entry point
│   ├── api/              # HTTP API layer
│   │   └── server.ts     # Express routes and handlers
│   ├── worker/           # Background processing
│   │   └── worker.ts     # Message processing worker
│   ├── lib/              # Shared libraries
│   │   ├── db.ts         # Database connection and queries
│   │   └── logger.ts     # Logging utility
│   └── config/           # Configuration
│       └── index.ts      # Environment variables loader
├── migrations/           # Database migrations
│   └── 001_initial_schema.sql
├── package.json
├── tsconfig.json
└── .env.example
```

## Folder Rationale

- **`cmd/`** - Separate entry points for API server and worker. Can be deployed independently.
- **`api/`** - HTTP layer only. No business logic here.
- **`worker/`** - Background message processing using Postgres as the queue.
- **`lib/`** - Shared utilities (database, logging). No business logic.
- **`config/`** - Configuration loading. Single source of truth for env vars.
- **`migrations/`** - Database schema as code. Run manually for V2.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create a `.env` file:**
   ```bash
   cp .env.example .env
   ```

3. **Update `.env` with your Supabase connection string:**
   ```
   DATABASE_URL=postgresql://user:password@db.xxx.supabase.co:5432/postgres
   ```

4. **Run migrations:**
   - Open Supabase SQL Editor
   - Copy and paste the contents of `migrations/001_initial_schema.sql`
   - Execute the SQL

5. **Create a test project (manual for now):**
   ```sql
   INSERT INTO projects (id, name, owner_email)
   VALUES ('00000000-0000-0000-0000-000000000000', 'Test Project', 'test@example.com');
   ```

## Running

### Development (with auto-reload):

**Terminal 1 - API Server:**
```bash
npm run dev:api
```

**Terminal 2 - Worker:**
```bash
npm run dev:worker
```

### Production:

**Build first:**
```bash
npm run build
```

**Start API server:**
```bash
npm run start:api
```

**Start worker:**
```bash
npm run start:worker
```

## Testing

### 1. Health Check:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-01T08:12:54.123Z",
  "service": "orbicloud-api"
}
```

### 2. Queue a Message:
```bash
curl -X POST http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "to": "recipient@example.com",
    "from": "sender@example.com",
    "subject": "Test Email",
    "body": "This is a test message"
  }'
```

Expected response:
```json
{
  "message_id": "a1b2c3d4-...",
  "status": "queued"
}
```

### 3. Check Worker Logs:
Watch the worker terminal. You should see:
```
[2026-01-01T08:13:00.000Z] [INFO] Processing 1 messages
[2026-01-01T08:13:00.001Z] [INFO] Processing message {"messageId":"a1b2c3...","to":"recipient@example.com","from":"sender@example.com"}
[2026-01-01T08:13:00.002Z] [INFO] Message marked as delivered (STUB) {"messageId":"a1b2c3..."}
```

### 4. Verify in Database:
```sql
SELECT * FROM messages;
SELECT * FROM events;
```

## What's Implemented

✅ API server with health check  
✅ POST /v1/messages endpoint  
✅ Message validation  
✅ Database insertion with status=queued  
✅ Event logging (message.requested)  
✅ Worker polling with SELECT FOR UPDATE SKIP LOCKED  
✅ Graceful shutdown  

## What's NOT Implemented (Yet)

❌ Authentication (API keys)  
❌ Google Email API integration  
❌ Actual email sending  
❌ Retry logic  
❌ Rate limiting  
❌ Error handling for provider failures  
❌ Message scheduling  
❌ Webhooks  

## Notes

- **Authentication:** Hardcoded project ID (`00000000-0000-0000-0000-000000000000`) for now. API key validation will be added later.
- **Email Sending:** Worker marks all messages as "delivered" without actually sending. Google Email API integration is next.
- **Queue:** Uses Postgres with `SELECT FOR UPDATE SKIP LOCKED`. No Redis or external queue needed.
- **Polling:** Worker polls every 1 second by default. Can be adjusted via `WORKER_POLL_INTERVAL_MS`.

## Next Steps

1. Add API key authentication middleware
2. Integrate Google Email API
3. Add proper error handling
4. Add email format validation
5. Add request/response logging
