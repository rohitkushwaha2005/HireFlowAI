import { clsx, type ClassValue } from 'clsx';
import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const toDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  const date = typeof value === 'string' ? parseISO(value) : value;
  return isValid(date) ? date : null;
};

export function formatDate(
  value: string | Date | null | undefined,
  pattern = 'MMM d, yyyy',
): string {
  const date = toDate(value);
  return date ? format(date, pattern) : '—';
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, 'EEE, MMM d · h:mm a');
}

export function formatMonthYear(value: string | null | undefined): string {
  return formatDate(value, 'MMM yyyy');
}

export function timeAgo(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? `${formatDistanceToNowStrict(date)} ago` : '—';
}

export function formatSalary(
  min: number | null,
  max: number | null,
  currency: string,
): string | null {
  if (min === null && max === null) return null;
  const fmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    notation: 'compact',
  });
  if (min !== null && max !== null) return `${fmt.format(min)} – ${fmt.format(max)}`;
  return min !== null ? `From ${fmt.format(min)}` : `Up to ${fmt.format(max!)}`;
}

export function formatYears(years: number | null | undefined): string {
  if (years === null || years === undefined) return '—';
  const rounded = Math.round(years * 10) / 10;
  return `${rounded} yr${rounded === 1 ? '' : 's'}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function initialsOf(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/** Returns the URL only if it is http(s); guards every user/AI-provided href (defense in depth). */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
