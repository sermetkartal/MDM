import { eq, and } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { users, roles } from '../db/schema.js';
import { registerSession } from '../middleware/auth.js';
import type { FastifyInstance } from 'fastify';
import type { TokenResponse } from '../types/index.js';

export class AuthService {
  constructor(private app: FastifyInstance) {}

  async login(email: string, password: string, orgId?: string, ip?: string): Promise<TokenResponse> {
    const query = orgId
      ? and(eq(users.email, email), eq(users.orgId, orgId))
      : eq(users.email, email);

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        orgId: users.orgId,
        roleId: users.roleId,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
      })
      .from(users)
      .where(query)
      .limit(1);

    if (!user) {
      throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
    }

    if (!user.isActive) {
      throw Object.assign(new Error('Account is disabled'), { statusCode: 403 });
    }

    const valid = await this.verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
    }

    // Fetch role permissions
    const [role] = await db
      .select({ permissions: roles.permissions })
      .from(roles)
      .where(eq(roles.id, user.roleId))
      .limit(1);

    const permissions = (role?.permissions as string[]) ?? [];

    // Update last login
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    return this.generateTokens({
      sub: user.id,
      email: user.email,
      orgId: user.orgId,
      roleId: user.roleId,
      permissions,
    }, ip);
  }

  generateTokens(payload: { sub: string; email: string; orgId: string; roleId: string; permissions: string[] }, ip?: string): TokenResponse {
    const sessionId = crypto.randomUUID();
    const accessToken = this.app.jwt.sign({ ...payload, jti: sessionId }, { expiresIn: '15m' });
    const refreshToken = this.app.jwt.sign({ sub: payload.sub, type: 'refresh', jti: sessionId }, { expiresIn: '7d' });

    // Register session in Redis (fire and forget)
    if (ip) {
      registerSession(payload.sub, sessionId, ip).catch(() => {});
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
    };
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

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        orgId: users.orgId,
        roleId: users.roleId,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, decoded.sub))
      .limit(1);

    if (!user || !user.isActive) {
      throw Object.assign(new Error('User not found or disabled'), { statusCode: 401 });
    }

    const [role] = await db
      .select({ permissions: roles.permissions })
      .from(roles)
      .where(eq(roles.id, user.roleId))
      .limit(1);

    return this.generateTokens({
      sub: user.id,
      email: user.email,
      orgId: user.orgId,
      roleId: user.roleId,
      permissions: (role?.permissions as string[]) ?? [],
    });
  }

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    // Hash format: algorithm$salt$hash
    const parts = hash.split('$');
    if (parts.length !== 3) return false;
    const [algo, salt, storedHash] = parts;
    const computed = crypto.pbkdf2Sync(password, salt, 100000, 64, algo).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
  }
}
