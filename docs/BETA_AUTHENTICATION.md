# Beta Authentication System

## Overview

The Aventer dashboard now has a complete authentication system to protect beta access. Users must log in with credentials to view the live event stream, and admins can manage beta user accounts through an admin dashboard.

## Architecture

### Authentication Flow

1. **Login**: Users enter username/password on the dashboard
2. **Token Generation**: API validates credentials and returns a JWT token
3. **Token Storage**: Dashboard stores JWT in localStorage
4. **Protected Access**: All dashboard requests include the JWT token
5. **Auto-Refresh**: Token is valid for 7 days

### Components

```
┌──────────────────────────────────────────────────────────┐
│  Dashboard (beta.aventer.dev)                             │
│  ├─ Login Screen (index.html)                             │
│  ├─ Events Stream (authenticated users only)              │
│  └─ Admin Dashboard (admin.html - admins only)            │
└──────────────────────────────────────────────────────────┘
                         ↓ HTTPS + JWT
┌──────────────────────────────────────────────────────────┐
│  API (api.aventer.dev)                                    │
│  ├─ POST /v1/auth/login - authenticate & get token        │
│  ├─ GET  /v1/auth/me - validate token                     │
│  ├─ POST /v1/admin/users - create user (admin only)       │
│  ├─ GET  /v1/admin/users - list users (admin only)        │
│  ├─ DELETE /v1/admin/users/:id - delete user (admin only) │
│  └─ GET  /v1/events/stream - accepts JWT or API key       │
└──────────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│  Postgres                                                 │
│  └─ beta_users table (id, username, password_hash, ...)   │
└──────────────────────────────────────────────────────────┘
```

## Database Schema

```sql
CREATE TABLE beta_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
```

## Default Admin Account

A default admin account is created automatically on first migration:

```
Username: admin
Password: changeme123
```

**⚠️ SECURITY: Change this password immediately after deployment!**

## API Endpoints

### Authentication Endpoints

#### `POST /v1/auth/login`

Authenticate and receive a JWT token.

**Request:**
```json
{
  "username": "admin",
  "password": "changeme123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": "usr_admin_default",
    "username": "admin",
    "is_admin": true
  }
}
```

**Errors:**
- `401` - Invalid credentials
- `503` - Database unavailable

#### `GET /v1/auth/me`

Validate token and get current user info.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "user": {
    "id": "usr_...",
    "username": "johndoe",
    "is_admin": false
  }
}
```

**Errors:**
- `401` - Invalid or expired token

### Admin Endpoints

All admin endpoints require a valid JWT token from an admin user.

#### `POST /v1/admin/users`

Create a new beta user.

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Request:**
```json
{
  "username": "newuser",
  "password": "secure_password_123",
  "is_admin": false
}
```

**Response (201):**
```json
{
  "id": "usr_abc123def456",
  "username": "newuser",
  "is_admin": false,
  "created_at": "2026-07-09T14:00:00Z"
}
```

**Errors:**
- `401` - Not authenticated
- `403` - Not an admin
- `409` - Username already exists

#### `GET /v1/admin/users`

List all beta users.

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Response (200):**
```json
{
  "users": [
    {
      "id": "usr_admin_default",
      "username": "admin",
      "is_admin": true,
      "created_at": "2026-07-09T12:00:00Z",
      "last_login_at": "2026-07-09T14:00:00Z"
    }
  ]
}
```

#### `DELETE /v1/admin/users/:id`

Delete a beta user.

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Response:**
- `204` - User deleted
- `404` - User not found

#### `PUT /v1/admin/users/:id/password`

Update user password.

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Request:**
```json
{
  "password": "new_secure_password"
}
```

**Response (200):**
```json
{
  "updated": true
}
```

## Using the Dashboard

### For Beta Users

1. Navigate to `https://beta.aventer.dev`
2. Enter your username and password
3. Click "Login"
4. Once authenticated, click "Connect to Stream" to view live events

### For Admins

1. Log in to the dashboard
2. Click the "Admin" link in the top-right
3. Add new beta users with the form at the top
4. View all users and their last login times
5. Delete users as needed

## Deployment Configuration

### Environment Variables

Add to `/etc/aventer/env` (VPS) or Vercel dashboard:

```bash
# Required for authentication
JWT_SECRET=<generate_strong_random_secret_256_bits>

# Database (already configured)
DATABASE_URL=postgresql://...
```

**Generate JWT Secret:**
```bash
openssl rand -base64 32
```

### Migration

The authentication migration runs automatically on API startup. To run manually:

```bash
npm run db:migrate -w @aventer/api
```

### Security Checklist

- [ ] Change default admin password immediately
- [ ] Set strong JWT_SECRET in production
- [ ] Ensure DATABASE_URL is not exposed in logs
- [ ] CORS is configured for `beta.aventer.dev` only
- [ ] HTTPS enabled on both API and dashboard
- [ ] Rate limit login endpoint (recommended: 5 attempts per IP per minute)

## Local Development

### Setup

```bash
# Start Postgres
docker compose up -d

# Set environment
export DATABASE_URL=postgresql://aventer:aventer@localhost:5432/aventer
export JWT_SECRET=dev_secret_change_in_production

# Build and run API
npm run build -w @aventer/schema
npm run build -w @aventer/delivery
npm run build -w @aventer/api
npm run dev -w @aventer/api

# In another terminal - run dashboard
npm run dev -w @aventer/dashboard
```

### Test Login

1. Open `http://localhost:5173`
2. Login with `admin` / `changeme123`
3. Access admin dashboard at `http://localhost:5173/admin.html`

## Security Considerations

### Password Requirements

- Minimum 8 characters (enforced in admin UI)
- Passwords are hashed with bcrypt (10 rounds)
- No plaintext passwords stored

### Token Security

- JWT tokens expire after 7 days
- Stored in localStorage (XSS risk if site compromised)
- Tokens include: user_id, username, is_admin

### Future Enhancements

Consider for post-beta:

1. **Password Reset Flow**: Email-based password reset
2. **2FA**: TOTP or SMS-based two-factor authentication
3. **Session Management**: Track active sessions, remote logout
4. **OAuth**: GitHub/Google SSO for easier onboarding
5. **Rate Limiting**: Prevent brute force attacks
6. **Audit Log**: Track all admin actions
7. **Password Policies**: Complexity requirements, rotation
8. **HttpOnly Cookies**: Move tokens from localStorage to secure cookies

## Backward Compatibility

The API still supports the original API key authentication for SDK access:

- **API Keys** (SDK): `Authorization: Bearer avn_beta_...` or `?api_key=...`
- **JWT Tokens** (Dashboard): `Authorization: Bearer eyJhbG...`

Both work for `/v1/events/stream` - the API checks both.

## Troubleshooting

### "Database required" error

Authentication requires Postgres. Ensure `DATABASE_URL` is set.

### "Invalid credentials" on valid password

- Check password was not copy-pasted with extra spaces
- Verify user exists: `SELECT * FROM beta_users WHERE username = '...'`
- Verify hash: passwords are case-sensitive

### Token expired

Tokens last 7 days. Log out and log back in to get a new token.

### Admin can't access admin dashboard

- Verify `is_admin = true` in database
- Clear localStorage and log in again
- Check browser console for errors

### Users can't delete themselves

This is intentional - prevents accidental lockout. Use another admin account to delete an admin user.

## Production Deployment

### First-Time Setup

1. Deploy API with new migration:
   ```bash
   git pull origin main
   npm ci
   npm run build -w @aventer/schema
   npm run build -w @aventer/delivery  
   npm run build -w @aventer/api
   sudo systemctl restart aventer-api
   ```

2. Set JWT_SECRET in `/etc/aventer/env`:
   ```bash
   sudo nano /etc/aventer/env
   # Add: JWT_SECRET=<your_secret>
   sudo systemctl restart aventer-api
   ```

3. Change default admin password:
   - Log in as admin
   - Go to admin dashboard
   - Add a new admin user with your real credentials
   - Log out, log in as new admin
   - Delete the default admin account

4. Deploy dashboard to Vercel (already configured)

### Monitoring

Check authentication is working:

```bash
# Health check
curl https://api.aventer.dev/health

# Test login
curl -X POST https://api.aventer.dev/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme123"}'

# Verify admin access (use token from above)
curl -H "Authorization: Bearer <token>" \
  https://api.aventer.dev/v1/admin/users
```

## Support

For issues with authentication:

1. Check API logs: `journalctl -u aventer-api -f`
2. Verify Postgres connection: `curl https://api.aventer.dev/health`
3. Test login endpoint directly (see Monitoring above)
4. Check browser console for dashboard errors

---

**Last Updated**: July 9, 2026  
**Version**: 1.0.0  
**Migration**: 003_beta_auth.sql
