import { describe, expect, it } from 'vitest';
import { ApiError, toQuery } from './api';
import { formatSalary, formatYears, pluralize } from './utils';

describe('toQuery', () => {
  it('drops empty values and joins arrays for the API csv parser', () => {
    expect(
      toQuery({
        q: 'react',
        status: ['APPLIED', 'SCREENING'],
        empty: '',
        none: undefined,
        list: [],
        page: 2,
        flag: false,
      }),
    ).toEqual({
      q: 'react',
      status: 'APPLIED,SCREENING',
      page: 2,
      flag: false,
    });
  });
});

describe('ApiError', () => {
  it('exposes validation issues as field errors', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Invalid', {
      issues: [
        { path: 'email', message: 'Enter a valid email address' },
        { path: '', message: 'ignored' },
      ],
    });
    expect(error.fieldErrors).toEqual({ email: 'Enter a valid email address' });
  });
});

describe('formatters', () => {
  it('formats salary ranges compactly', () => {
    expect(formatSalary(120000, 150000, 'USD')).toBe('$120K – $150K');
    expect(formatSalary(null, 90000, 'USD')).toBe('Up to $90K');
    expect(formatSalary(null, null, 'USD')).toBeNull();
  });

  it('formats years and plurals', () => {
    expect(formatYears(1)).toBe('1 yr');
    expect(formatYears(5.25)).toBe('5.3 yrs');
    expect(formatYears(null)).toBe('—');
    expect(pluralize(1, 'candidate')).toBe('1 candidate');
    expect(pluralize(3, 'candidate')).toBe('3 candidates');
  });
});
