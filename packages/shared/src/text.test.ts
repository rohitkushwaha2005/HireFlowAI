import { describe, expect, it } from 'vitest';
import { slugify, totalExperienceYears } from './text';

describe('slugify', () => {
  it('produces url-safe slugs', () => {
    expect(slugify('Senior Full-Stack Engineer (Remote)')).toBe(
      'senior-full-stack-engineer-remote',
    );
    expect(slugify('Café Développeur')).toBe('cafe-developpeur');
    expect(slugify('!!!')).toBe('item');
  });
});

describe('totalExperienceYears', () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const now = d('2026-01-01');

  it('sums non-overlapping positions', () => {
    expect(
      totalExperienceYears(
        [
          { startDate: d('2020-01-01'), endDate: d('2022-01-01'), current: false },
          { startDate: d('2023-01-01'), endDate: null, current: true },
        ],
        now,
      ),
    ).toBe(5);
  });

  it('merges overlapping positions instead of double counting', () => {
    expect(
      totalExperienceYears(
        [
          { startDate: d('2020-01-01'), endDate: d('2023-01-01'), current: false },
          { startDate: d('2022-01-01'), endDate: d('2024-01-01'), current: false },
        ],
        now,
      ),
    ).toBe(4);
  });

  it('ignores positions without a start date', () => {
    expect(totalExperienceYears([{ startDate: null, endDate: null, current: true }], now)).toBe(0);
  });
});
