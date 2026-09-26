import {
  permissionsFor,
  slugify,
  type ChangePasswordInput,
  type LoginInput,
  type MeDto,
  type MembershipDto,
  type RegisterInput,
  type SessionDto,
  type UpdateAccountInput,
  type UserDto,
  type UserRole,
} from '@hireflow/shared';
import type { Prisma, PrismaClient, VerificationTokenType } from '@hireflow/database';
import type { AppConfig } from '../config/env';
import {
  dummyPasswordHash,
  hashPassword,
  randomToken,
  sha256,
  verifyPassword,
} from '../lib/crypto';
import { ConflictError, UnauthorizedError, ValidationError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import { emailJob, type JobDispatcher } from '../jobs/definitions';
import { toUserDto } from '../mappers';
import { userPublicSelect } from '../repositories/includes';
import type { RequestMeta } from '../types/context';
import type { IssuedRefreshToken, TokenService } from './token.service';

const EMAIL_VERIFICATION_TTL_MS = 24 * 3600_000;
const PASSWORD_RESET_TTL_MS = 3600_000;
export const INVITATION_TTL_MS = 7 * 24 * 3600_000;

export interface AuthResult {
  session: SessionDto;
  refresh: IssuedRefreshToken;
}

interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokens: TokenService,
    private readonly dispatcher: JobDispatcher,
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {}

  // ── Session building ──────────────────────────────────────────────────────

  private async memberships(userId: string): Promise<MembershipDto[]> {
    const rows = await this.prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((m) => ({
      organizationId: m.organization.id,
      organizationName: m.organization.name,
      organizationSlug: m.organization.slug,
      role: m.role,
      permissions: permissionsFor(m.role),
    }));
  }

  async me(userId: string): Promise<MeDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...userPublicSelect, candidateProfile: { select: { id: true } } },
    });
    if (!user) throw new UnauthorizedError('Account not found');
    return {
      user: toUserDto(user),
      memberships: await this.memberships(userId),
      candidateProfileId: user.candidateProfile?.id ?? null,
    };
  }

  private async createSession(
    userId: string,
    meta: RequestMeta,
    familyId?: string,
  ): Promise<AuthResult> {
    const me = await this.me(userId);
    const accessToken = await this.tokens.signAccessToken({
      id: me.user.id,
      email: me.user.email,
      role: me.user.role,
    });
    const refresh = familyId
      ? await this.tokens.issueRefreshToken(userId, meta, familyId)
      : await this.tokens.issueRefreshToken(userId, meta);
    return { session: { ...me, accessToken, expiresIn: this.tokens.accessTtlSeconds }, refresh };
  }

  // ── Registration / login ──────────────────────────────────────────────────

  async uniqueOrganizationSlug(
    name: string,
    db: Prisma.TransactionClient | PrismaClient = this.prisma,
  ): Promise<string> {
    const base = slugify(name, 50);
    for (let attempt = 0; attempt < 20; attempt++) {
      const slug =
        attempt === 0
          ? base
          : `${base}-${randomToken(3)
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '')}`;
      const exists = await db.organization.findUnique({ where: { slug }, select: { id: true } });
      if (!exists) return slug;
    }
    return `${base}-${Date.now()}`;
  }

  async register(input: RegisterInput, meta: RequestMeta): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) throw new ConflictError('An account with this email already exists');

    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          role: input.role,
          ...(input.role === 'CANDIDATE' ? { candidateProfile: { create: {} } } : {}),
        },
      });
      if (input.role === 'RECRUITER' && input.organizationName) {
        await tx.organization.create({
          data: {
            name: input.organizationName,
            slug: await this.uniqueOrganizationSlug(input.organizationName, tx),
            members: { create: { userId: created.id, role: 'OWNER' } },
          },
        });
      }
      return created;
    });

    await this.sendVerificationEmail(user.id, user.email, user.firstName);
    this.logger.info({ userId: user.id, role: user.role }, 'User registered');
    return this.createSession(user.id, meta);
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, passwordHash: true },
    });
    // Always run a hash verification so timing does not reveal whether the account exists.
    const valid = await verifyPassword(
      user?.passwordHash ?? (await dummyPasswordHash()),
      input.password,
    );
    if (!user || !user.passwordHash || !valid) {
      throw new UnauthorizedError('Incorrect email or password');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.createSession(user.id, meta);
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<AuthResult> {
    const { userId, refresh } = await this.tokens.rotateRefreshToken(refreshToken, meta);
    const me = await this.me(userId);
    const accessToken = await this.tokens.signAccessToken({
      id: me.user.id,
      email: me.user.email,
      role: me.user.role,
    });
    return { session: { ...me, accessToken, expiresIn: this.tokens.accessTtlSeconds }, refresh };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) await this.tokens.revokeRefreshToken(refreshToken);
  }

  // ── One-time tokens ───────────────────────────────────────────────────────

  async createOneTimeToken(
    userId: string,
    type: VerificationTokenType,
    ttlMs: number,
  ): Promise<string> {
    const token = randomToken(32);
    await this.prisma.$transaction([
      // Only the latest token of each type stays valid.
      this.prisma.verificationToken.updateMany({
        where: { userId, type, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.verificationToken.create({
        data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
      }),
    ]);
    return token;
  }

  private async consumeOneTimeToken(token: string, type: VerificationTokenType): Promise<string> {
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!record || record.type !== type || record.consumedAt || record.expiresAt < new Date()) {
      throw new ValidationError('This link is invalid or has expired');
    }
    const consumed = await this.prisma.verificationToken.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw new ValidationError('This link has already been used');
    return record.userId;
  }

  private async sendVerificationEmail(
    userId: string,
    email: string,
    firstName: string,
  ): Promise<void> {
    const token = await this.createOneTimeToken(
      userId,
      'EMAIL_VERIFICATION',
      EMAIL_VERIFICATION_TTL_MS,
    );
    await this.dispatcher.dispatch(
      'email.send',
      emailJob(email, 'emailVerification', {
        firstName,
        url: `${this.config.webUrl}/verify-email?token=${token}`,
      }),
    );
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerified) return;
    await this.sendVerificationEmail(user.id, user.email, user.firstName);
  }

  async verifyEmail(token: string): Promise<UserDto> {
    const userId = await this.consumeOneTimeToken(token, 'EMAIL_VERIFICATION');
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
      select: userPublicSelect,
    });
    return toUserDto(user);
  }

  /** Always succeeds from the caller's perspective to avoid account enumeration. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;
    const token = await this.createOneTimeToken(user.id, 'PASSWORD_RESET', PASSWORD_RESET_TTL_MS);
    await this.dispatcher.dispatch(
      'email.send',
      emailJob(user.email, 'passwordReset', {
        firstName: user.firstName,
        url: `${this.config.webUrl}/reset-password?token=${token}`,
      }),
    );
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const userId = await this.consumeOneTimeToken(token, 'PASSWORD_RESET');
    await this.prisma.user.update({
      where: { id: userId },
      // Receiving the link proves control of the inbox.
      data: { passwordHash: await hashPassword(password), emailVerified: true },
    });
    await this.tokens.revokeAllForUser(userId);
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new ValidationError('Current password is incorrect', {
        issues: [{ path: 'currentPassword', message: 'Current password is incorrect' }],
      });
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    await this.tokens.revokeAllForUser(userId);
  }

  async updateAccount(userId: string, input: UpdateAccountInput): Promise<UserDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      },
      select: userPublicSelect,
    });
    return toUserDto(user);
  }

  // ── Google OAuth (authorization code flow) ────────────────────────────────

  get googleEnabled(): boolean {
    return this.config.auth.google !== null;
  }

  googleAuthorizationUrl(state: string): string {
    const google = this.config.auth.google;
    if (!google) throw new ValidationError('Google sign-in is not configured');
    const params = new URLSearchParams({
      client_id: google.clientId,
      redirect_uri: `${this.config.apiUrl}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  private async fetchGoogleProfile(code: string): Promise<GoogleProfile> {
    const google = this.config.auth.google;
    if (!google) throw new ValidationError('Google sign-in is not configured');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: google.clientId,
        client_secret: google.clientSecret,
        redirect_uri: `${this.config.apiUrl}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok) throw new UnauthorizedError('Google sign-in failed');
    const tokens = (await tokenResponse.json()) as { access_token?: string };
    if (!tokens.access_token) throw new UnauthorizedError('Google sign-in failed');

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) throw new UnauthorizedError('Google sign-in failed');
    const profile = (await profileResponse.json()) as Partial<GoogleProfile>;
    if (!profile.sub || !profile.email)
      throw new UnauthorizedError('Google did not return an email');
    return profile as GoogleProfile;
  }

  async googleSignIn(
    code: string,
    role: Extract<UserRole, 'CANDIDATE' | 'RECRUITER'>,
    meta: RequestMeta,
  ): Promise<AuthResult> {
    const profile = await this.fetchGoogleProfile(code);
    if (!profile.email_verified) throw new UnauthorizedError('Your Google email is not verified');
    const email = profile.email.toLowerCase();

    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId: profile.sub }, { email }] },
    });
    if (user) {
      if (!user.googleId) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId: profile.sub, emailVerified: true },
        });
      }
    } else {
      const firstName = profile.given_name?.slice(0, 60) || email.split('@')[0]!.slice(0, 60);
      const lastName = profile.family_name?.slice(0, 60) || '';
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            googleId: profile.sub,
            emailVerified: true,
            firstName,
            lastName,
            avatarUrl: profile.picture ?? null,
            role,
            ...(role === 'CANDIDATE' ? { candidateProfile: { create: {} } } : {}),
          },
        });
        if (role === 'RECRUITER') {
          const orgName = `${firstName}'s team`;
          await tx.organization.create({
            data: {
              name: orgName,
              slug: await this.uniqueOrganizationSlug(orgName, tx),
              members: { create: { userId: created.id, role: 'OWNER' } },
            },
          });
        }
        return created;
      });
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.createSession(user.id, meta);
  }
}
