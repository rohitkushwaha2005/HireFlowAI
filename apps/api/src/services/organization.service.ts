import {
  fullName,
  normalizeWeights,
  type CreateOrganizationInput,
  type InviteMemberInput,
  type MemberDto,
  type OrganizationDto,
  type UpdateMemberRoleInput,
  type UpdateOrganizationInput,
} from '@hireflow/shared';
import type { PrismaClient } from '@hireflow/database';
import type { AppConfig } from '../config/env';
import { ConflictError, ForbiddenError, InvalidStateError, NotFoundError } from '../lib/errors';
import { emailJob, type JobDispatcher } from '../jobs/definitions';
import { toOrganizationDto } from '../mappers';
import type { Actor } from '../types/context';
import type { AuditService } from './audit.service';
import { INVITATION_TTL_MS, type AuthService } from './auth.service';

export class OrganizationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly dispatcher: JobDispatcher,
    private readonly config: AppConfig,
  ) {}

  /** A staff user without an organization (e.g. invited then removed) can create a new one. */
  async create(userId: string, input: CreateOrganizationInput): Promise<OrganizationDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role === 'CANDIDATE') throw new ForbiddenError('Candidate accounts cannot create organizations');
    if (input.slug) {
      const taken = await this.prisma.organization.findUnique({ where: { slug: input.slug } });
      if (taken) throw new ConflictError('This URL is already taken');
    }
    const org = await this.prisma.organization.create({
      data: {
        name: input.name,
        slug: input.slug ?? (await this.auth.uniqueOrganizationSlug(input.name)),
        members: { create: { userId, role: 'OWNER' } },
      },
    });
    return toOrganizationDto(org);
  }

  async get(organizationId: string): Promise<OrganizationDto> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundError('Organization');
    return toOrganizationDto(org);
  }

  async update(actor: Actor, input: UpdateOrganizationInput): Promise<OrganizationDto> {
    const org = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({
        where: { id: actor.organizationId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
          ...(input.matchingWeights ? { matchingWeights: { ...normalizeWeights(input.matchingWeights) } } : {}),
        },
      });
      await this.audit.record(
        actor,
        {
          action: 'ORGANIZATION_UPDATED',
          entityType: 'Organization',
          entityId: actor.organizationId,
          metadata: { fields: Object.keys(input) },
        },
        tx,
      );
      return updated;
    });

    if (input.matchingWeights) {
      // New weights change every score: recompute matches for all jobs in the background.
      const jobs = await this.prisma.job.findMany({
        where: { organizationId: actor.organizationId },
        select: { id: true },
      });
      await Promise.all(jobs.map((job) => this.dispatcher.dispatch('matching.job', { jobId: job.id }, { jobId: `match-job-${job.id}` })));
    }
    return toOrganizationDto(org);
  }

  async listMembers(organizationId: string): Promise<MemberDto[]> {
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      emailVerified: m.user.emailVerified,
      joinedAt: m.createdAt.toISOString(),
    }));
  }

  /**
   * Invites a teammate. New users get an account with no password and an invitation link that
   * lets them set one; existing staff users are added directly. Candidate accounts cannot join.
   */
  async invite(actor: Actor, input: InviteMemberInput): Promise<MemberDto> {
    const [org, inviter] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } }),
    ]);
    const globalRole = input.role === 'HIRING_MANAGER' ? 'HIRING_MANAGER' : 'RECRUITER';

    let user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (user?.role === 'CANDIDATE') {
      throw new ConflictError('This email belongs to a candidate account and cannot join a hiring team');
    }
    if (user) {
      const existing = await this.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
      });
      if (existing) throw new ConflictError('This person is already a member');
    }

    const isNewUser = !user;
    user ??= await this.prisma.user.create({
      data: { email: input.email, firstName: input.firstName, lastName: input.lastName, role: globalRole },
    });

    const member = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organizationMember.create({
        data: { organizationId: org.id, userId: user.id, role: input.role },
        include: { user: true },
      });
      await this.audit.record(
        actor,
        { action: 'MEMBER_INVITED', entityType: 'Member', entityId: created.id, metadata: { email: input.email, role: input.role } },
        tx,
      );
      return created;
    });

    const url = isNewUser
      ? `${this.config.webUrl}/reset-password?invite=1&token=${await this.auth.createOneTimeToken(user.id, 'PASSWORD_RESET', INVITATION_TTL_MS)}`
      : `${this.config.webUrl}/login`;
    await this.dispatcher.dispatch(
      'email.send',
      emailJob(user.email, 'memberInvitation', {
        firstName: user.firstName,
        organizationName: org.name,
        inviterName: fullName(inviter),
        url,
      }),
    );

    return {
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      firstName: member.user.firstName,
      lastName: member.user.lastName,
      avatarUrl: member.user.avatarUrl,
      role: member.role,
      emailVerified: member.user.emailVerified,
      joinedAt: member.createdAt.toISOString(),
    };
  }

  private async findMember(organizationId: string, memberId: string) {
    const member = await this.prisma.organizationMember.findFirst({ where: { id: memberId, organizationId } });
    if (!member) throw new NotFoundError('Member');
    return member;
  }

  async updateMemberRole(actor: Actor, memberId: string, input: UpdateMemberRoleInput): Promise<void> {
    const member = await this.findMember(actor.organizationId, memberId);
    if (member.role === 'OWNER') throw new InvalidStateError("The owner's role cannot be changed");
    if (member.userId === actor.userId) throw new InvalidStateError('You cannot change your own role');
    await this.prisma.$transaction(async (tx) => {
      await tx.organizationMember.update({ where: { id: member.id }, data: { role: input.role } });
      await this.audit.record(
        actor,
        { action: 'MEMBER_ROLE_CHANGED', entityType: 'Member', entityId: member.id, metadata: { from: member.role, to: input.role } },
        tx,
      );
    });
  }

  async removeMember(actor: Actor, memberId: string): Promise<void> {
    const member = await this.findMember(actor.organizationId, memberId);
    if (member.role === 'OWNER') throw new InvalidStateError('The owner cannot be removed');
    if (member.userId === actor.userId) throw new InvalidStateError('You cannot remove yourself');
    await this.prisma.$transaction(async (tx) => {
      await tx.organizationMember.delete({ where: { id: member.id } });
      await this.audit.record(actor, { action: 'MEMBER_REMOVED', entityType: 'Member', entityId: member.id }, tx);
    });
  }
}
