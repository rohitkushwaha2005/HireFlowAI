import nodemailer, { type Transporter } from 'nodemailer';
import type { AppConfig } from '../../config/env';
import type { Logger } from '../logger';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Delivery abstraction; business logic only ever sees this interface. */
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage & { from: string }): Promise<void>;
}

export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private readonly transporter: Transporter;

  constructor(host: string, port: number) {
    this.transporter = nodemailer.createTransport({ host, port, secure: port === 465 });
  }

  async send(message: EmailMessage & { from: string }): Promise<void> {
    await this.transporter.sendMail(message);
  }
}

/** Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';

  constructor(private readonly apiKey: string) {}

  async send(message: EmailMessage & { from: string }): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!response.ok) {
      throw new Error(`Resend responded ${response.status}: ${await response.text()}`);
    }
  }
}

/** Logs a summary instead of sending. Development and tests only. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';
  readonly sent: Array<EmailMessage & { from: string }> = [];

  constructor(private readonly logger: Logger) {}

  async send(message: EmailMessage & { from: string }): Promise<void> {
    this.sent.push(message);
    this.logger.info({ to: message.to, subject: message.subject }, 'Email (console provider)');
  }
}

export function createEmailProvider(config: AppConfig['email'], logger: Logger): EmailProvider {
  switch (config.provider) {
    case 'smtp':
      return new SmtpEmailProvider(config.smtpHost, config.smtpPort);
    case 'resend':
      if (!config.apiKey) throw new Error('EMAIL_API_KEY is required for the resend provider');
      return new ResendEmailProvider(config.apiKey);
    case 'console':
      return new ConsoleEmailProvider(logger);
  }
}
