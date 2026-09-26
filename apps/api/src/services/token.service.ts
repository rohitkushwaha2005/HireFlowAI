import { jwtVerify, SignJWT } from 'jose';
import { USER_ROLES, type UserRole } from '@hireflow/shared';
import type { PrismaClient } from '@hireflow/database';
import { durationToSeconds, type AppConfig } from '../config/env';
import { randomToken, sha256 } from '../lib/crypto';
import { UnauthorizedError } from '../lib/errors';
import type { AuthContext, RequestMeta } from '../types/context';

const ISSUER = 'hireflow-api';
const AUDIENCE = 'hireflow-web';

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

/**
 * Access tokens: short-lived HS256 JWTs carrying only user id, email and role.
 * Refresh tokens: opaque random strings, stored as SHA-256 hashes, rotated on every use. Presenting
 * an already-rotated token revokes its entire family (refresh-token theft detection).
 */
export class TokenService {
  private readonly accessKey: Uint8Array;
  readonly accessTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AppConfig['auth'],
  ) {
    this.accessKey = new TextEncoder().encode(config.accessSecret);
    this.accessTtlSeconds = durationToSeconds(config.accessTokenTtl);
  }

  async signAccessToken(user: { id: string; email: string; role: UserRole }): Promise<string> {
    return new SignJWT({ email: user.email, role: user.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTtlSeconds}s`)
      .sign(this.accessKey);
  }

  async verifyAccessToken(token: string): Promise<AuthContext> {
    const { payload } = await jwtVerify(token, this.accessKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    const role = payload.role;
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof role !== 'string' ||
      !(USER_ROLES as readonly string[]).includes(role)
    ) {
      throw new UnauthorizedError('Invalid token');
    }
    return { userId: payload.sub, email: payload.email, role: role as UserRole };
  }

  async issueRefreshToken(
    userId: string,
    meta: RequestMeta,
    familyId?: string,
  ): Promise<IssuedRefreshToken> {
    const token = randomToken(48);
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlDays * 86_400_000);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(token),
        familyId: familyId ?? randomToken(12),
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });
    return { token, expiresAt };
  }

  /** Validates and rotates a refresh token. Returns the user id and the replacement token. */
  async rotateRefreshToken(
    token: string,
    meta: RequestMeta,
  ): Promise<{ userId: string; refresh: IssuedRefreshToken }> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!existing) throw new UnauthorizedError('Invalid session');

    if (existing.revokedAt) {
      // A rotated token was replayed: assume theft and end every session in this family.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedError('Session revoked. Please sign in again.');
    }
    if (existing.expiresAt < new Date())
      throw new UnauthorizedError('Session expired. Please sign in again.');

    const refresh = await this.issueRefreshToken(existing.userId, meta, existing.familyId);
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedBy: sha256(refresh.token) },
    });
    return { userId: existing.userId, refresh };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!existing) return;
    await this.prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
