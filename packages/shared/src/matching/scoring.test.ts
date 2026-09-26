import { describe, expect, it } from 'vitest';
import {
  computeMatch,
  DEFAULT_MATCHING_WEIGHTS,
  normalizeWeights,
  scoreEducation,
  scoreExperience,
  scoreSemantic,
  scoreSkills,
  type MatchJobInput,
  type MatchRequirementInput,
} from './scoring';

const req = (
  skill: string,
  normalizedSkill: string,
  overrides: Partial<MatchRequirementInput> = {},
): MatchRequirementInput => ({
  skill,
  normalizedSkill,
  required: true,
  weight: 3,
  minimumYears: null,
  ...overrides,
});

const fullStackJob: MatchJobInput = {
  requirements: [
    req('React', 'react', { weight: 5 }),
    req('Node.js', 'nodejs', { weight: 5 }),
    req('PostgreSQL', 'postgresql'),
    req('AWS', 'aws', { required: false, weight: 2 }),
  ],
  minYearsExperience: 3,
  educationLevel: 'BACHELOR',
};

describe('scoreSkills', () => {
  it('returns null when the job has no requirements', () => {
    expect(scoreSkills([], [{ normalizedSkill: 'react', yearsExperience: 2 }]).score).toBeNull();
  });

  it('gives full credit when every requirement is matched', () => {
    const { score, breakdown } = scoreSkills(fullStackJob.requirements, [
      { normalizedSkill: 'react', yearsExperience: 4 },
      { normalizedSkill: 'nodejs', yearsExperience: 4 },
      { normalizedSkill: 'postgresql', yearsExperience: 2 },
      { normalizedSkill: 'aws', yearsExperience: 1 },
    ]);
    expect(score).toBe(100);
    expect(breakdown.every((b) => b.status === 'MATCHED')).toBe(true);
  });

  it('weights required skills double and honours per-requirement weight', () => {
    // Missing the optional AWS (weight 2 × 1 = 2) out of 5·2 + 5·2 + 3·2 + 2 = 28.
    const { score } = scoreSkills(fullStackJob.requirements, [
      { normalizedSkill: 'react', yearsExperience: null },
      { normalizedSkill: 'nodejs', yearsExperience: null },
      { normalizedSkill: 'postgresql', yearsExperience: null },
    ]);
    expect(score).toBe(Math.round((26 / 28) * 100));
  });

  it('awards half credit for a related skill and records which skill earned it', () => {
    const { breakdown } = scoreSkills(
      [req('PostgreSQL', 'postgresql')],
      [{ normalizedSkill: 'mysql', yearsExperience: 3 }],
    );
    expect(breakdown[0]).toMatchObject({ status: 'RELATED', credit: 0.5, viaSkill: 'MySQL' });
  });

  it('gives proportional (min 0.5) credit when years are below the requirement', () => {
    const { breakdown } = scoreSkills(
      [req('React', 'react', { minimumYears: 4 })],
      [{ normalizedSkill: 'react', yearsExperience: 3 }],
    );
    expect(breakdown[0]).toMatchObject({ status: 'PARTIAL', credit: 0.75 });

    const low = scoreSkills(
      [req('React', 'react', { minimumYears: 10 })],
      [{ normalizedSkill: 'react', yearsExperience: 1 }],
    );
    expect(low.breakdown[0]?.credit).toBe(0.5);
  });

  it('marks absent skills as missing', () => {
    const { score, breakdown } = scoreSkills([req('Go', 'go')], []);
    expect(score).toBe(0);
    expect(breakdown[0]?.status).toBe('MISSING');
  });
});

describe('scoreExperience', () => {
  it('scores 100 when minimum is met or exceeded (no over-qualification penalty)', () => {
    expect(scoreExperience(3, 3)).toBe(100);
    expect(scoreExperience(25, 3)).toBe(100);
  });
  it('scales linearly below the minimum', () => {
    expect(scoreExperience(1.5, 3)).toBe(50);
    expect(scoreExperience(0, 3)).toBe(0);
  });
  it('is neutral when candidate experience is unknown', () => {
    expect(scoreExperience(null, 5)).toBe(50);
  });
  it('is not applicable when neither side has data', () => {
    expect(scoreExperience(null, null)).toBeNull();
  });
});

describe('scoreEducation', () => {
  it('is not applicable without a requirement', () => {
    expect(scoreEducation('BACHELOR', null)).toBeNull();
    expect(scoreEducation(null, 'NONE')).toBeNull();
  });
  it('scores by ordinal gap', () => {
    expect(scoreEducation('MASTER', 'BACHELOR')).toBe(100);
    expect(scoreEducation('BACHELOR', 'BACHELOR')).toBe(100);
    expect(scoreEducation('ASSOCIATE', 'BACHELOR')).toBe(60);
    expect(scoreEducation('HIGH_SCHOOL', 'BACHELOR')).toBe(30);
    expect(scoreEducation(null, 'BACHELOR')).toBe(40);
  });
});

describe('scoreSemantic', () => {
  it('maps the calibrated band to 0–100 and clamps outside it', () => {
    expect(scoreSemantic(0.3)).toBe(0);
    expect(scoreSemantic(0.6)).toBe(0);
    expect(scoreSemantic(0.9)).toBe(100);
    expect(scoreSemantic(0.99)).toBe(100);
    expect(scoreSemantic(0.75)).toBe(50);
  });
  it('is not applicable without similarity', () => {
    expect(scoreSemantic(null)).toBeNull();
    expect(scoreSemantic(Number.NaN)).toBeNull();
  });
});

describe('normalizeWeights', () => {
  it('normalizes to sum 1', () => {
    const w = normalizeWeights({ skills: 2, experience: 1, education: 1, semantic: 0 });
    expect(w.skills).toBeCloseTo(0.5);
    expect(w.semantic).toBe(0);
  });
  it('falls back to defaults when all weights are zero or invalid', () => {
    expect(
      normalizeWeights({ skills: 0, experience: -1, education: Number.NaN, semantic: 0 }),
    ).toEqual(DEFAULT_MATCHING_WEIGHTS);
  });
});

describe('computeMatch', () => {
  it('combines components with the default weights', () => {
    const result = computeMatch({
      job: fullStackJob,
      candidate: {
        skills: [
          { normalizedSkill: 'react', yearsExperience: 5 },
          { normalizedSkill: 'nodejs', yearsExperience: 5 },
          { normalizedSkill: 'postgresql', yearsExperience: 3 },
          { normalizedSkill: 'aws', yearsExperience: 2 },
        ],
        totalExperienceYears: 5,
        highestEducation: 'BACHELOR',
      },
      semanticSimilarity: 0.9,
    });
    expect(result.overallScore).toBe(100);
    expect(result.matchedSkills).toEqual(['React', 'Node.js', 'PostgreSQL', 'AWS']);
    expect(result.missingSkills).toEqual([]);
    expect(result.explanation).toContain('strong match');
  });

  it('re-normalizes weights when a component is not applicable', () => {
    const result = computeMatch({
      job: { ...fullStackJob, educationLevel: null },
      candidate: {
        skills: [
          { normalizedSkill: 'react', yearsExperience: 5 },
          { normalizedSkill: 'nodejs', yearsExperience: 5 },
          { normalizedSkill: 'postgresql', yearsExperience: 3 },
          { normalizedSkill: 'aws', yearsExperience: 2 },
        ],
        totalExperienceYears: 5,
        highestEducation: null,
      },
      semanticSimilarity: null,
    });
    expect(result.educationScore).toBeNull();
    expect(result.semanticScore).toBeNull();
    expect(result.appliedWeights.skills).toBeCloseTo(0.4 / 0.6, 2);
    expect(result.appliedWeights.education).toBe(0);
    expect(result.overallScore).toBe(100);
  });

  it('reports missing required skills and experience gaps in the explanation', () => {
    const result = computeMatch({
      job: fullStackJob,
      candidate: {
        skills: [{ normalizedSkill: 'react', yearsExperience: 1 }],
        totalExperienceYears: 1,
        highestEducation: 'BACHELOR',
      },
      semanticSimilarity: 0.6,
    });
    expect(result.missingSkills).toEqual(['Node.js', 'PostgreSQL', 'AWS']);
    expect(result.concerns.join(' ')).toContain('Missing required skills: Node.js and PostgreSQL');
    expect(result.concerns.join(' ')).toContain('1 years of experience vs. 3+ years requested');
    expect(result.overallScore).toBeLessThan(50);
  });

  it('is deterministic', () => {
    const input = {
      job: fullStackJob,
      candidate: {
        skills: [{ normalizedSkill: 'nodejs', yearsExperience: 2 }],
        totalExperienceYears: 2,
        highestEducation: 'MASTER' as const,
      },
      semanticSimilarity: 0.7,
    };
    expect(computeMatch(input)).toEqual(computeMatch(input));
  });

  it('returns 0 when nothing can be evaluated', () => {
    const result = computeMatch({
      job: { requirements: [], minYearsExperience: null, educationLevel: null },
      candidate: { skills: [], totalExperienceYears: null, highestEducation: null },
      semanticSimilarity: null,
    });
    expect(result.overallScore).toBe(0);
  });
});
