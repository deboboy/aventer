# Quick Guide: Managing Beta Testers

## For Admins: Adding New Beta Testers

### Option 1: Using the Admin Dashboard (Recommended)

1. **Access the admin dashboard:**
   - Production: https://beta.aventer.dev/admin.html
   - Local: http://localhost:5173/admin.html

2. **Log in as admin**
   - Default credentials: `admin` / `changeme123`
   - (Change default password immediately in production!)

3. **Add a new user:**
   - Enter username (e.g., `john_doe`)
   - Enter a secure password (min 8 characters)
   - Check "Admin privileges" if they should be able to add other users
   - Click "Add User"

4. **Share credentials with the beta tester:**
   - Send username and password securely (Signal, 1Password, etc.)
   - Give them the dashboard URL: https://beta.aventer.dev

### Option 2: Using the API

```bash
# Get your admin token first
TOKEN=$(curl -s -X POST https://api.aventer.dev/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme123"}' \
  | jq -r '.token')

# Add a new user
curl -X POST https://api.aventer.dev/v1/admin/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "jane_smith",
    "password": "SecurePassword123",
    "is_admin": false
  }'
```

### Option 3: Directly in Database (Emergency)

```bash
# SSH into VPS
ssh aventer@<your-vps-ip>

# Connect to Postgres
docker exec -it <postgres-container> psql -U aventer -d aventer

# Add user (bcrypt hash for password "TempPass123")
INSERT INTO beta_users (id, username, password_hash, is_admin)
VALUES (
  'usr_' || substr(md5(random()::text), 1, 16),
  'emergency_user',
  '$2b$10$...',  -- Generate with: node -e "require('bcryptjs').hash('password', 10).then(console.log)"
  false
);
```

## For Beta Testers: Getting Started

### First-Time Login

1. **Go to the dashboard:**
   - https://beta.aventer.dev

2. **Enter your credentials:**
   - Username: (provided by admin)
   - Password: (provided by admin)

3. **Click "Connect to Stream":**
   - You'll see live agent events as they arrive

### If Login Fails

- Check for typos in username/password (passwords are case-sensitive)
- Try clearing browser cache and reloading
- Contact your admin

## Common Tasks

### View All Beta Users

**Via Dashboard:**
- Log in as admin → Click "Admin" link → See full user list

**Via API:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://api.aventer.dev/v1/admin/users
```

### Delete a Beta User

**Via Dashboard:**
- Admin dashboard → Find user → Click "Delete"

**Via API:**
```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  https://api.aventer.dev/v1/admin/users/usr_abc123
```

### Change Default Admin Password

1. Log in as default admin
2. Go to admin dashboard
3. Create a new admin user with your real credentials
4. Log out and log in as new admin
5. Delete the default `admin` user

### Reset a User's Password

**Via API:**
```bash
curl -X PUT https://api.aventer.dev/v1/admin/users/usr_abc123/password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password": "NewSecurePass456"}'
```

## Security Best Practices

✅ **DO:**
- Change default admin password immediately in production
- Use strong passwords (12+ characters, mix of letters/numbers/symbols)
- Share credentials securely (encrypted chat, password manager)
- Remove users when they no longer need access
- Create individual accounts (no shared credentials)

❌ **DON'T:**
- Share the admin password with non-admin beta testers
- Use the same password for multiple users
- Send passwords in plain text email
- Keep the default `admin` account in production
- Share API keys publicly (separate from dashboard auth)

## Troubleshooting

### "Connection error" on login
- Check API is running: `curl https://api.aventer.dev/health`
- Verify DATABASE_URL is set on API server

### "Database required" error
- Postgres must be running for authentication
- Check: `sudo systemctl status postgresql`

### User can see login but not events
- Verify user clicked "Connect to Stream"
- Check browser console for errors
- Ensure user has valid credentials

### Admin can't delete a user
- Can't delete yourself (use another admin)
- User might already be deleted (refresh the list)

## Quick Reference

| Task | Admin Required? | Location |
|------|-----------------|----------|
| Add user | ✅ Yes | Admin dashboard or API |
| Delete user | ✅ Yes | Admin dashboard or API |
| Change password | ✅ Yes | API only (for now) |
| View events | ❌ No | Main dashboard |
| View user list | ✅ Yes | Admin dashboard |

---

**Questions?** See [BETA_AUTHENTICATION.md](./BETA_AUTHENTICATION.md) for full documentation.
