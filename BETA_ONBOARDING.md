# OrbiCloud Developer Beta

## 1. What is this?
OrbiCloud is a headless, API-first messaging backend. There is no dashboard, no drag-and-drop builder, and no magic link. You send JSON payloads; we handle queuing, retries, and delivery.

## 2. Get Access
Access is invite-only.
1. Email `beta@orbicloud.com` with your GitHub username.
2. You will receive a Project API Key (`orb_live_...`).
3. Store this key securely.

## 3. Quickstart
**Base URL:** `https://api.orbicloud.com` (Use `http://localhost:3000` for local dev)
**Auth:** Header `Authorization: Bearer <YOUR_KEY>`

### Check Connection
Verify your identity and remaining quota.

```bash
curl https://api.orbicloud.com/v1/me \
  -H "Authorization: Bearer orb_live_..."
```

### Send a Message
Returns `202 Accepted` immediately. We define success as "safely queued".

```bash
curl -X POST https://api.orbicloud.com/v1/messages \
  -H "Authorization: Bearer orb_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "to": "dev@example.com",
    "from": "app@orbicloud.com",
    "subject": "Hello Beta",
    "body": "Your verification code is 1234"
  }'
```

### Check Delivery Status
Poll the message ID returned from the POST request.

```bash
curl https://api.orbicloud.com/v1/messages/<MESSAGE_ID> \
  -H "Authorization: Bearer orb_live_..."
```

## 4. Limits & Constraints
*   **Quota:** 10,000 messages / month (Free Tier).
*   **Rate Limit:** 100 requests / minute.
*   **Retention:** Logs deleted after 30 days.
*   **Delivery:** Currently simulated (random success/fail) for beta testing.
*   **UI:** None. Build your own views using `GET /v1/messages`.

## 5. Support
Direct engineering support: `beta@orbicloud.com`.
System status: `GET /health`.
