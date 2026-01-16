# DNS Fix for OrbiCloud Development

The issue: Your local network resolves `db.yvzofljxfonsxnmwjbcy.supabase.co` to an IPv6 address that your machine cannot reach, causing `ENOTFOUND` errors.

## Solution: Windows Hosts File Override

Add this line to `C:\Windows\System32\drivers\etc\hosts`:

```
3.108.251.216  db.yvzofljxfonsxnmwjbcy.supabase.co
```

## Steps:

1. **Open Notepad as Administrator**
   - Press Win+S, type "notepad"
   - Right-click → "Run as administrator"

2. **Open the hosts file**
   - File → Open
   - Navigate to: `C:\Windows\System32\drivers\etc\`
   - Change file filter to "All Files (*.*)"
   - Select `hosts` and open it

3. **Add the mapping**
   - Scroll to the bottom
   - Add a new line: `3.108.251.216  db.yvzofljxfonsxnmwjbcy.supabase.co`
   - Save and close

4. **Flush DNS again**
   ```bash
   ipconfig /flushdns
   ```

5. **Test the connection**
   ```bash
   npm run dev
   ```

## Why this works:
- Forces your machine to use the IPv4 address (`3.108.251.216`) for this hostname
- Bypasses the problematic IPv6-only DNS resolution
- Works transparently for your application code
- SSL still works because we set `rejectUnauthorized: false` in the database config

## Alternative IP addresses (if the first doesn't work):
```
3.111.105.85  db.yvzofljxfonsxnmwjbcy.supabase.co
```
