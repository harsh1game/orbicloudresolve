# OrbiCloud V2 - Operator Cheat Sheet

This file contains every command you need to run, test, and manage OrbiCloud V2.

## 1. Running the System
You need 2 terminal windows.

**Terminal 1: API Server**
```bash
# Starts the HTTP API on port 3000
npm run dev
```

**Terminal 2: Worker**
```bash
# Starts the background worker (processes usage, retries, janitor)
npm run worker
```

---

## 2. Managing Users (SQL)
Since there is no Admin UI yet, use these SQL commands to provision Beta users.
Run these in your database tool (e.g., Supabase SQL Editor or `psql`).

### A. Create a New Project (Beta User)
```sql
-- 1. Create the project
INSERT INTO projects (name, owner_email, monthly_limit, rate_limit_per_minute)
VALUES ('Beta Company', 'dev@example.com', 10000, 100)
RETURNING id;
-- COPY THE RETURNED ID (e.g. "a1b2...")
```

### B. Generate an API Key
```sql
-- 2. Create an API Key for that project
-- REPLACE 'PROJECT_ID_HERE' with the ID from above
INSERT INTO api_keys (project_id, name, key_hash)
VALUES (
  'PROJECT_ID_HERE', 
  'Default Key', 
  'orb_live_beta_user_key_123' -- In production, hash this! For beta, plain string is allowed if you trust the DB.
);
```

### C. Suspend a Bad Actor
```sql
UPDATE projects SET status = 'suspended' WHERE owner_email = 'abuser@example.com';
```

---

## 3. Operations & Monitoring

### Check Logic (SQL)
```sql
-- Is the queue stuck?
SELECT COUNT(*) FROM messages WHERE status = 'queued';

-- Who is using it most?
SELECT * FROM usage ORDER BY count DESC LIMIT 5;
```

### Check Logs (Terminal)
The `npm run worker` terminal will show:
> `[INFO] Janitor cleanup complete { deletedEvents: 0, deletedMessages: 0 }`
> `[INFO] Worker heartbeat ...`

---

## 4. Testing (Curl)
Verify everything works using the key you created in step 2B.

**Health Check**
```bash
curl http://localhost:3000/health
```

**Send Message**
```bash
curl -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer orb_live_beta_user_key_123" \
  -H "Content-Type: application/json" \
  -d '{"to": "me@test.com", "from": "app@test.com", "body": "It works!"}'
```
