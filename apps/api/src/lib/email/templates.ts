import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@hireflow/shared';
import type { EmailMessage } from './providers';

/**
 * Typed email templates. Every template is a pure function of its payload; all interpolated
 * values are HTML-escaped. Templates are addressed by name so jobs can carry serializable payloads.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface LayoutInput {
  preheader: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  footnote?: string;
}

function layout({ preheader, heading, paragraphs, action, footnote }: LayoutInput): { html: string; text: string } {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(p)}</p>`).join('');
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(action.label)}</a></p>`
    : '';
  const foot = footnote ? `<p style="margin:24px 0 0;color:#6b7280;font-size:13px">${escapeHtml(footnote)}</p>` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Inter,Segoe UI,Arial,sans-serif;color:#18181b">
<span style="display:none;opacity:0">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;padding:32px">
<tr><td><p style="margin:0 0 24px;font-weight:700;color:#4f46e5">HireFlow AI</p>
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(heading)}</h1>${body}${button}${foot}</td></tr></table>
</td></tr></table></body></html>`;
  const text = [heading, '', ...paragraphs, ...(action ? ['', `${action.label}: ${action.url}`] : []), ...(footnote ? ['', footnote] : [])].join('\n');
  return { html, text };
}

export interface EmailTemplates {
  emailVerification: { firstName: string; url: string };
  passwordReset: { firstName: string; url: string };
  memberInvitation: { firstName: string; organizationName: string; inviterName: string; url: string };
  applicationReceived: { firstName: string; jobTitle: string; organizationName: string; url: string };
  newApplicationForRecruiter: { recruiterFirstName: string; candidateName: string; jobTitle: string; url: string };
  applicationStatusUpdated: {
    firstName: string;
    jobTitle: string;
    organizationName: string;
    status: ApplicationStatus;
    url: string;
  };
  interviewScheduled: {
    firstName: string;
    jobTitle: string;
    organizationName: string;
    when: string;
    duration: number;
    type: string;
    meetingUrl: string | null;
    location: string | null;
    url: string;
  };
  interviewReminder: {
    firstName: string;
    jobTitle: string;
    when: string;
    meetingUrl: string | null;
    url: string;
  };
  jobInvitation: { firstName: string; jobTitle: string; organizationName: string; url: string };
}

export type EmailTemplateName = keyof EmailTemplates;

type Renderer<K extends EmailTemplateName> = (data: EmailTemplates[K]) => Omit<EmailMessage, 'to'>;

const STATUS_MESSAGES: Partial<Record<ApplicationStatus, string>> = {
  SCREENING: 'Your application is being reviewed by the hiring team.',
  SHORTLISTED: 'Good news — you have been shortlisted for the next stage.',
  INTERVIEW: 'The team would like to interview you. You will receive the details separately.',
  OFFER: 'Congratulations — the team is preparing an offer for you.',
  HIRED: 'Congratulations and welcome aboard!',
  REJECTED:
    'After careful consideration the team has decided not to move forward at this time. Thank you for your interest.',
};

const renderers: { [K in EmailTemplateName]: Renderer<K> } = {
  emailVerification: ({ firstName, url }) => ({
    subject: 'Verify your email address',
    ...layout({
      preheader: 'Confirm your email to finish setting up HireFlow AI',
      heading: `Welcome, ${firstName}`,
      paragraphs: ['Please confirm your email address. The link expires in 24 hours.'],
      action: { label: 'Verify email', url },
      footnote: "If you didn't create an account, you can ignore this email.",
    }),
  }),
  passwordReset: ({ firstName, url }) => ({
    subject: 'Reset your password',
    ...layout({
      preheader: 'Reset your HireFlow AI password',
      heading: `Hi ${firstName}`,
      paragraphs: ['We received a request to reset your password. The link expires in 1 hour.'],
      action: { label: 'Choose a new password', url },
      footnote: "If you didn't request this, you can ignore this email — your password is unchanged.",
    }),
  }),
  memberInvitation: ({ firstName, organizationName, inviterName, url }) => ({
    subject: `${inviterName} invited you to ${organizationName} on HireFlow AI`,
    ...layout({
      preheader: `Join ${organizationName} on HireFlow AI`,
      heading: `Hi ${firstName}`,
      paragraphs: [`${inviterName} invited you to join ${organizationName}'s hiring team.`, 'Set a password to activate your account.'],
      action: { label: 'Accept invitation', url },
    }),
  }),
  applicationReceived: ({ firstName, jobTitle, organizationName, url }) => ({
    subject: `Application received: ${jobTitle}`,
    ...layout({
      preheader: `${organizationName} received your application`,
      heading: `Thanks for applying, ${firstName}`,
      paragraphs: [`${organizationName} has received your application for ${jobTitle}.`, 'You can track its status at any time.'],
      action: { label: 'View application', url },
    }),
  }),
  newApplicationForRecruiter: ({ recruiterFirstName, candidateName, jobTitle, url }) => ({
    subject: `New application: ${candidateName} for ${jobTitle}`,
    ...layout({
      preheader: `${candidateName} applied to ${jobTitle}`,
      heading: `Hi ${recruiterFirstName}`,
      paragraphs: [`${candidateName} applied to ${jobTitle}. The resume is being processed and a match score will be ready shortly.`],
      action: { label: 'Review application', url },
    }),
  }),
  applicationStatusUpdated: ({ firstName, jobTitle, organizationName, status, url }) => ({
    subject: `Update on your application for ${jobTitle}`,
    ...layout({
      preheader: `Status: ${APPLICATION_STATUS_LABELS[status]}`,
      heading: `Hi ${firstName}`,
      paragraphs: [
        `Your application for ${jobTitle} at ${organizationName} is now: ${APPLICATION_STATUS_LABELS[status]}.`,
        ...(STATUS_MESSAGES[status] ? [STATUS_MESSAGES[status]] : []),
      ],
      action: { label: 'View application', url },
    }),
  }),
  interviewScheduled: ({ firstName, jobTitle, organizationName, when, duration, type, meetingUrl, location, url }) => ({
    subject: `Interview scheduled: ${jobTitle}`,
    ...layout({
      preheader: `${when} · ${duration} minutes`,
      heading: `Hi ${firstName}`,
      paragraphs: [
        `${organizationName} scheduled a ${type.toLowerCase()} interview for ${jobTitle}.`,
        `When: ${when} (${duration} minutes)`,
        ...(meetingUrl ? [`Meeting link: ${meetingUrl}`] : []),
        ...(location ? [`Location: ${location}`] : []),
      ],
      action: { label: 'View interview details', url },
    }),
  }),
  interviewReminder: ({ firstName, jobTitle, when, meetingUrl, url }) => ({
    subject: `Reminder: interview for ${jobTitle}`,
    ...layout({
      preheader: `Your interview is at ${when}`,
      heading: `Hi ${firstName}`,
      paragraphs: [`This is a reminder of your interview for ${jobTitle} at ${when}.`, ...(meetingUrl ? [`Meeting link: ${meetingUrl}`] : [])],
      action: { label: 'View interview details', url },
    }),
  }),
  jobInvitation: ({ firstName, jobTitle, organizationName, url }) => ({
    subject: `${organizationName} invites you to apply: ${jobTitle}`,
    ...layout({
      preheader: `${organizationName} thinks you'd be a great fit`,
      heading: `Hi ${firstName}`,
      paragraphs: [`${organizationName} invited you to apply for ${jobTitle}.`],
      action: { label: 'View job', url },
    }),
  }),
};

export function renderEmail<K extends EmailTemplateName>(
  template: K,
  data: EmailTemplates[K],
): Omit<EmailMessage, 'to'> {
  return (renderers[template] as Renderer<K>)(data);
}
