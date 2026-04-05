import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db/index.js';
import type { TokenResponse } from '../types/index.js';

export class AuthService {
  constructor(private app: FastifyInstance) {}

  async login(email: string, password: string, orgId?: string, ip?: string): Promise<TokenResponse> {
    // Find user
    const userQuery = orgId
      ? { text: 'SELECT id, email, org_id, password_hash, status, display_name FROM users WHERE email = $1 AND org_id = $2 LIMIT 1', values: [email, orgId] }
      : { text: 'SELECT id, email, org_id, password_hash, status, display_name FROM users WHERE email = $1 LIMIT 1', values: [email] };

    const { rows: [user] } = await pool.query(userQuery);

    if (!user) {
      throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
    }

    if (user.status !== 'active') {
      throw Object.assign(new Error('Account is disabled'), { statusCode: 403 });
    }

    const valid = await this.verifyPassword(password, user.password_hash);
    if (!valid) {
      throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
    }

    // Fetch permissions via user_roles -> roles
    const { rows: roleRows } = await pool.query(
      `SELECT r.permissions FROM roles r
       INNER JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [user.id]
    );

    const permissions: string[] = roleRows.flatMap((r: any) => {
      try { return Array.isArray(r.permissions) ? r.permissions : JSON.parse(r.permissions); }
      catch { return []; }
    });

    // Update last login
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    return this.generateTokens({
      sub: user.id,
      email: user.email,
      orgId: user.org_id,
      permissions,
    }, ip);
  }

  generateTokens(payload: { sub: string; email: string; orgId: string; permissions: string[] }, ip?: string): TokenResponse {
    const accessToken = this.app.jwt.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.app.jwt.sign({ sub: payload.sub, type: 'refresh' }, { expiresIn: '7d' });

    return { accessToken, refreshToken, expiresIn: 900 };
  }

  async refresh(refreshToken: string): Promise<TokenResponse> {
    let decoded: { sub: string; type?: string };
    try {
      decoded = this.app.jwt.verify<{ sub: string; type?: string }>(refreshToken);
    } catch {
      throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401 });
    }

    if (decoded.type !== 'refresh') {
      throw Object.assign(new Error('Invalid token type'), { statusCode: 401 });
    }

    const { rows: [user] } = await pool.query(
      'SELECT id, email, org_id, status FROM users WHERE id = $1 LIMIT 1',
      [decoded.sub]
    );

    if (!user || user.status !== 'active') {
      throw Object.assign(new Error('User not found or disabled'), { statusCode: 401 });
    }

    const { rows: roleRows } = await pool.query(
      `SELECT r.permissions FROM roles r INNER JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1`,
      [user.id]
    );

    const permissions: string[] = roleRows.flatMap((r: any) => {
      try { return Array.isArray(r.permissions) ? r.permissions : JSON.parse(r.permissions); }
      catch { return []; }
    });

    return this.generateTokens({
      sub: user.id,
      email: user.email,
      orgId: user.org_id,
      permissions,
    });
  }

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    if (!hash) return false;

    // Support simple sha256 hash (for dev seed data)
    if (hash.startsWith('sha256$')) {
      const [, salt, storedHash] = hash.split('$');
      const computed = crypto.createHash('sha256').update(salt + password).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(storedHash, 'hex'));
    }

    // Support pbkdf2
    if (hash.includes('$') && !hash.startsWith('$argon2')) {
      const parts = hash.split('$');
      if (parts.length === 3) {
        const [algo, salt, storedHash] = parts;
        const computed = crypto.pbkdf2Sync(password, salt, 100000, 64, algo).toString('hex');
        try {
          return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
        } catch { return false; }
      }
    }

    return false;
  }
}
