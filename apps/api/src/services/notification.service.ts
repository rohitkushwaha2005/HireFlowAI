import type { PrismaClient } from '@hireflow/database';
import { renderEmail, type EmailProvider, type EmailTemplateName, type EmailTemplates } from '../lib/email';
import type { Logger } from '../lib/logger';
import type { JobPayloads } from '../jobs/definitions';

/** Renders and delivers templated email. Runs in the worker via the `email.send` job. */
export class NotificationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: EmailProvider,
    private readonly from: string,
    private readonly logger: Logger,
  ) {}

  async send(payload: JobPayloads['email.send']): Promise<void> {
    if (payload.onlyIfStatus) {
      const app = await this.prisma.application.findUnique({
        where: { id: payload.onlyIfStatus.applicationId },
        select: { status: true },
      });
      if (!app || app.status !== payload.onlyIfStatus.status) {
        this.logger.info({ template: payload.template }, 'Status email skipped: application moved on');
        return;
      }
    }
    const rendered = renderEmail(payload.template as EmailTemplateName, payload.data as EmailTemplates[EmailTemplateName]);
    await this.provider.send({ ...rendered, to: payload.to, from: this.from });
    this.logger.info({ template: payload.template, provider: this.provider.name }, 'Email sent');
  }
}
