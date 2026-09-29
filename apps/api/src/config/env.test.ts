import { describe, expect, it } from 'vitest';
import { loadConfig } from './env';

const base = {
  DATABASE_URL: 'postgresql://localhost/test',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('TRUST_PROXY', () => {
  it.each([
    [undefined, 0],
    ['', 0],
    ['false', 0],
    ['true', 1],
    ['1', 1],
    ['2', 2],
  ])('%s → %i hops', (value, hops) => {
    expect(loadConfig({ ...base, TRUST_PROXY: value }).trustProxy).toBe(hops);
  });

  it('rejects anything else', () => {
    expect(() => loadConfig({ ...base, TRUST_PROXY: 'yes' })).toThrow();
  });
});
