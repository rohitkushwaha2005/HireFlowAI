import { describe, expect, it } from 'vitest';
import {
  chunkText,
  cosineSimilarity,
  l2Normalize,
  meanPool,
  toVectorLiteral,
} from '../ai/embeddings';
import { safeHttpUrl, sanitizeJobAnalysis, sanitizeResumeAnalysis } from '../ai/ai-service';
import { parseToolInput } from '../ai/copilot/toolbox';
import { verifyReferences } from '../services/copilot.service';
import { durationToSeconds, loadConfig } from '../config/env';
import { sanitizeFileName } from '../middleware/upload';
import { escapeHtml, renderEmail } from './email';
import { isPdf } from './pdf';

describe('config', () => {
  const base = {
    DATABASE_URL: 'postgresql://localhost/db',
    JWT_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
  };

  it('selects the heuristic provider automatically without an API key', () => {
    expect(loadConfig(base).ai.provider).toBe('heuristic');
    expect(loadConfig({ ...base, AI_API_KEY: 'sk-test' }).ai.provider).toBe('anthropic');
  });

  it('fails fast on invalid configuration', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...base, AI_PROVIDER: 'anthropic' })).toThrow(/AI_API_KEY/);
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', JWT_SECRET: `change-me-${'x'.repeat(30)}` }),
    ).toThrow(/placeholder/);
  });

  it('parses durations', () => {
    expect(durationToSeconds('15m')).toBe(900);
    expect(durationToSeconds('2h')).toBe(7200);
    expect(() => durationToSeconds('soon')).toThrow();
  });
});

describe('embeddings helpers', () => {
  it('chunks long text on boundaries without losing content', () => {
    const paragraph = 'Sentence about React. '.repeat(40);
    const chunks = chunkText(`${paragraph}\n\n${paragraph}`, 300);
    expect(chunks.every((c) => c.length <= 300)).toBe(true);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toContain('Sentence about React.');
  });

  it('normalizes and pools vectors', () => {
    expect(l2Normalize([3, 4])).toEqual([0.6, 0.8]);
    const pooled = meanPool([
      [1, 0],
      [0, 1],
    ]);
    expect(cosineSimilarity(pooled, [1, 1])).toBeCloseTo(1);
  });

  it('refuses malformed vectors before they reach SQL', () => {
    expect(() => toVectorLiteral([1, 2, 3])).toThrow();
    expect(() => toVectorLiteral(new Array(384).fill(Number.NaN))).toThrow();
    expect(toVectorLiteral(new Array(384).fill(0.5))).toMatch(/^\[0\.5,/);
  });
});

describe('AI output sanitization', () => {
  it('caps, de-duplicates and bounds resume analysis', () => {
    const result = sanitizeResumeAnalysis({
      name: '  Ada  ',
      email: null,
      phone: null,
      location: null,
      headline: 'x'.repeat(500),
      summary: '',
      currentRole: null,
      totalExperienceYears: 400,
      skills: [
        { name: 'React', proficiency: null, yearsExperience: 3 },
        { name: 'ReactJS', proficiency: null, yearsExperience: -1 },
      ],
      workExperience: [],
      education: [],
      projects: [],
      certifications: ['AWS', 'AWS'],
      links: { portfolio: null, linkedin: null, github: null, other: [] },
    });
    expect(result.name).toBe('Ada');
    expect(result.headline).toHaveLength(160);
    expect(result.summary).toBeNull();
    expect(result.totalExperienceYears).toBeNull();
    expect(result.skills).toEqual([{ name: 'React', proficiency: null, yearsExperience: 3 }]);
    expect(result.certifications).toEqual(['AWS']);
  });

  it('clamps requirement weights and removes duplicates across lists', () => {
    const result = sanitizeJobAnalysis({
      summary: 's',
      requiredSkills: [{ skill: 'React', category: 'FRAMEWORK', weight: 9, minimumYears: null }],
      preferredSkills: [
        { skill: 'React.js', category: 'FRAMEWORK', weight: 0, minimumYears: null },
      ],
      minYearsExperience: null,
      educationLevel: null,
      responsibilities: [],
      keywords: [],
      seniority: null,
      location: null,
      employmentType: null,
      remoteType: null,
    });
    expect(result.requiredSkills[0]!.weight).toBe(5);
    expect(result.preferredSkills).toEqual([]);
  });
});

describe('safeHttpUrl', () => {
  it('keeps http(s) links and upgrades scheme-less ones', () => {
    expect(safeHttpUrl('github.com/ada')).toBe('https://github.com/ada');
    expect(safeHttpUrl('http://example.com/x')).toBe('http://example.com/x');
  });
  it('drops dangerous or malformed links from untrusted resumes', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHttpUrl('vbscript:msgbox')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
    expect(safeHttpUrl('')).toBeNull();
  });
});

describe('copilot grounding', () => {
  it('validates tool input and rejects unknown tools', () => {
    expect(parseToolInput('find_candidates_by_skills', { skills: ['React'] }).ok).toBe(true);
    expect(parseToolInput('find_candidates_by_skills', { skills: [] }).ok).toBe(false);
    expect(parseToolInput('drop_database', {}).ok).toBe(false);
  });

  it('keeps only references that were retrieved and mentioned', () => {
    const retrieved = [
      { candidateId: '1', name: 'Maya Chen', applicationId: 'a', jobTitle: 'FE', score: 80 },
      { candidateId: '2', name: 'Leo Park', applicationId: 'b', jobTitle: 'FE', score: 60 },
    ];
    const refs = verifyReferences(
      '**Maya Chen** is the strongest. Also consider Sam Invented.',
      retrieved,
    );
    expect(refs.map((r) => r.name)).toEqual(['Maya Chen']);
  });
});

describe('uploads and email', () => {
  it('detects PDFs by signature', () => {
    expect(isPdf(Buffer.from('%PDF-1.7\n...'))).toBe(true);
    expect(isPdf(Buffer.from('<html>'))).toBe(false);
  });

  it('sanitizes file names', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Users\\me\\My Résumé<script>.pdf')).toBe('My R_sum__script_.pdf');
  });

  it('escapes interpolated values in email templates', () => {
    expect(escapeHtml('<b>"x"</b>')).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
    const email = renderEmail('applicationReceived', {
      firstName: '<script>alert(1)</script>',
      jobTitle: 'Engineer',
      organizationName: 'Acme',
      url: 'https://example.com/a',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.text).toContain('https://example.com/a');
  });
});
