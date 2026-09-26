/** Small, dependency-free text helpers shared by server and client. */

export function slugify(input: string, maxLength = 80): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug || 'item';
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

export function initials(person: { firstName: string; lastName: string }): string {
  return `${person.firstName.charAt(0)}${person.lastName.charAt(0)}`.toUpperCase();
}

/** Whole years between two dates (end defaults to now), never negative. */
export function yearsBetween(start: Date, end: Date | null = null): number {
  const to = end ?? new Date();
  const months =
    (to.getUTCFullYear() - start.getUTCFullYear()) * 12 + (to.getUTCMonth() - start.getUTCMonth());
  return Math.max(0, months / 12);
}

/**
 * Total professional experience in years from a list of positions, merging overlapping ranges so
 * concurrent jobs are not double counted.
 */
export function totalExperienceYears(
  positions: ReadonlyArray<{ startDate: Date | null; endDate: Date | null; current: boolean }>,
  now: Date = new Date(),
): number {
  const ranges = positions
    .filter((p): p is { startDate: Date; endDate: Date | null; current: boolean } => !!p.startDate)
    .map((p) => ({
      start: p.startDate.getTime(),
      end: (p.current || !p.endDate ? now : p.endDate).getTime(),
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);

  let totalMs = 0;
  let current: { start: number; end: number } | null = null;
  for (const range of ranges) {
    if (!current) {
      current = { ...range };
    } else if (range.start <= current.end) {
      current.end = Math.max(current.end, range.end);
    } else {
      totalMs += current.end - current.start;
      current = { ...range };
    }
  }
  if (current) totalMs += current.end - current.start;
  return round(totalMs / (365.25 * 24 * 3600 * 1000), 1);
}
