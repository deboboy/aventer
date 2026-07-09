import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getPool, isDatabaseEnabled } from "./db.js";

export interface BetaUser {
  id: string;
  username: string;
  is_admin: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface JWTPayload {
  user_id: string;
  username: string;
  is_admin: boolean;
}

const JWT_SECRET = process.env.JWT_SECRET ?? "dev_secret_change_in_production";
const JWT_EXPIRES_IN = "7d";

export async function validateCredentials(
  username: string,
  password: string
): Promise<BetaUser | null> {
  if (!isDatabaseEnabled()) {
    throw new Error("Database required for authentication");
  }

  const result = await getPool().query(
    "SELECT id, username, password_hash, is_admin, created_at, last_login_at FROM beta_users WHERE username = $1",
    [username]
  );

  if (result.rows.length === 0) return null;

  const user = result.rows[0];
  const isValid = await bcrypt.compare(password, user.password_hash);

  if (!isValid) return null;

  // Update last login
  await getPool().query("UPDATE beta_users SET last_login_at = now() WHERE id = $1", [
    user.id,
  ]);

  return {
    id: user.id,
    username: user.username,
    is_admin: user.is_admin,
    created_at: user.created_at,
    last_login_at: new Date().toISOString(),
  };
}

export function generateToken(user: BetaUser): string {
  const payload: JWTPayload = {
    user_id: user.id,
    username: user.username,
    is_admin: user.is_admin,
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch {
    return null;
  }
}

export async function createBetaUser(
  username: string,
  password: string,
  isAdmin = false
): Promise<BetaUser> {
  if (!isDatabaseEnabled()) {
    throw new Error("Database required for authentication");
  }

  const id = `usr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const passwordHash = await bcrypt.hash(password, 10);

  const result = await getPool().query(
    `INSERT INTO beta_users (id, username, password_hash, is_admin)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, is_admin, created_at, last_login_at`,
    [id, username, passwordHash, isAdmin]
  );

  return result.rows[0];
}

export async function listBetaUsers(): Promise<BetaUser[]> {
  if (!isDatabaseEnabled()) {
    throw new Error("Database required for authentication");
  }

  const result = await getPool().query(
    "SELECT id, username, is_admin, created_at, last_login_at FROM beta_users ORDER BY created_at DESC"
  );

  return result.rows;
}

export async function deleteBetaUser(userId: string): Promise<boolean> {
  if (!isDatabaseEnabled()) {
    throw new Error("Database required for authentication");
  }

  const result = await getPool().query("DELETE FROM beta_users WHERE id = $1", [userId]);

  return result.rowCount !== null && result.rowCount > 0;
}

export async function updatePassword(userId: string, newPassword: string): Promise<boolean> {
  if (!isDatabaseEnabled()) {
    throw new Error("Database required for authentication");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const result = await getPool().query(
    "UPDATE beta_users SET password_hash = $1 WHERE id = $2",
    [passwordHash, userId]
  );

  return result.rowCount !== null && result.rowCount > 0;
}
