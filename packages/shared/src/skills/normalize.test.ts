import { describe, expect, it } from 'vitest';
import {
  areSkillsRelated,
  extractKnownSkills,
  normalizeSkill,
  normalizeSkills,
  skillKey,
} from './normalize';

describe('skillKey', () => {
  it('lowercases and strips separators but keeps meaningful symbols', () => {
    expect(skillKey('  Node.js ')).toBe('nodejs');
    expect(skillKey('C++')).toBe('c++');
    expect(skillKey('C#')).toBe('c#');
    expect(skillKey('CI/CD')).toBe('ci/cd');
    expect(skillKey('React (Hooks)')).toBe('react');
  });
});

describe('normalizeSkill', () => {
  it.each([
    ['ReactJS', 'react', 'React'],
    ['react.js', 'react', 'React'],
    ['Node', 'nodejs', 'Node.js'],
    ['postgres', 'postgresql', 'PostgreSQL'],
    ['Golang', 'go', 'Go'],
    ['k8s', 'kubernetes', 'Kubernetes'],
    ['Vuejs', 'vue', 'Vue.js'],
    ['GitHub Actions', 'cicd', 'CI/CD'],
    ['Amazon Web Services', 'aws', 'AWS'],
  ])('maps %s to %s', (raw, key, name) => {
    expect(normalizeSkill(raw)).toMatchObject({ key, name, known: true });
  });

  it('keeps unknown skills with a stable key', () => {
    expect(normalizeSkill('Quantum Basket Weaving')).toEqual({
      key: 'quantumbasketweaving',
      name: 'Quantum Basket Weaving',
      category: 'OTHER',
      known: false,
    });
  });

  it('rejects empty input', () => {
    expect(normalizeSkill('   ')).toBeNull();
  });
});

describe('normalizeSkills', () => {
  it('de-duplicates aliases of the same skill', () => {
    const result = normalizeSkills(['React', 'ReactJS', 'react.js', 'TypeScript', 'ts']);
    expect(result.map((s) => s.key)).toEqual(['react', 'typescript']);
  });
});

describe('areSkillsRelated', () => {
  it('is symmetric and excludes identity', () => {
    expect(areSkillsRelated('postgresql', 'mysql')).toBe(true);
    expect(areSkillsRelated('mysql', 'postgresql')).toBe(true);
    expect(areSkillsRelated('react', 'react')).toBe(false);
    expect(areSkillsRelated('react', 'django')).toBe(false);
  });
});

describe('extractKnownSkills', () => {
  it('finds skills on word boundaries', () => {
    const keys = extractKnownSkills(
      'Built real-time dashboards with React, Node.js and PostgreSQL on AWS; CI/CD via GitHub Actions. Used C++ and C#.',
    ).map((s) => s.key);
    expect(keys).toEqual(
      expect.arrayContaining(['react', 'nodejs', 'postgresql', 'aws', 'cicd', 'c++', 'c#']),
    );
  });

  it('matches ambiguous English words only when capitalized like the technology', () => {
    expect(extractKnownSkills('APIs with Node and Express').map((s) => s.key)).toEqual(
      expect.arrayContaining(['nodejs', 'express']),
    );
    const plain = extractKnownSkills('Able to express ideas clearly and node trees').map(
      (s) => s.key,
    );
    expect(plain).not.toContain('express');
    expect(plain).not.toContain('nodejs');
  });

  it('does not match substrings or ambiguous short terms', () => {
    const keys = extractKnownSkills('Reactive programming and going to the javanese market').map(
      (s) => s.key,
    );
    expect(keys).not.toContain('react');
    expect(keys).not.toContain('go');
    expect(keys).not.toContain('java');
  });
});
