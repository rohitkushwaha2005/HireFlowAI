import type { AuditAction, AuditLogDto } from '@hireflow/shared';
import type { Prisma, PrismaClient } from '@hireflow/database';
import type { Logger } from '../lib/logger';
import { toAuditLogDto } from '../mappers';
import { auditInclude } from '../repositories/includes';
import type { Actor } from '../types/context';

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  action: AuditAction;
  entityType:
    'Job' | 'Application' | 'Candidate' | 'Interview' | 'Organization' | 'Member' | 'Resume';
  entityId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only audit trail for recruiter actions. Writes can join the caller's transaction so the
 * audit entry commits (or rolls back) together with the change it describes.
 */
export class AuditService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
  ) {}

  async record(actor: Actor, entry: AuditEntry, db: Db = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        userId: actor.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: actor.ipAddress,
      },
    });
  }

  /** Best-effort variant for read events (e.g. CANDIDATE_VIEWED) that must never fail a request. */
  async recordQuietly(actor: Actor, entry: AuditEntry): Promise<void> {
    try {
      await this.record(actor, entry);
    } catch (error) {
      this.logger.warn({ err: error, action: entry.action }, 'Failed to write audit log');
    }
  }

  async list(
    organizationId: string,
    filters: { entityType?: string; entityId?: string; limit?: number },
  ): Promise<AuditLogDto[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        ...(filters.entityType ? { entityType: filters.entityType } : {}),
        ...(filters.entityId ? { entityId: filters.entityId } : {}),
      },
      include: auditInclude,
      orderBy: { createdAt: 'desc' },
      take: Math.min(filters.limit ?? 50, 200),
    });
    return rows.map(toAuditLogDto);
  }
}
