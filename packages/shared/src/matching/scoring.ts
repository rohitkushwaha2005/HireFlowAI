import { EDUCATION_LEVELS, type EducationLevel } from '../enums';
import { areSkillsRelated, skillDisplayName } from '../skills/normalize';
import { clamp, round } from '../text';

/**
 * Deterministic, explainable candidate ↔ job scoring.
 *
 * Every component is normalized to 0–100. A component that cannot be evaluated (e.g. the job has
 * no requirements, or no embeddings exist yet) is marked `null` and excluded; the remaining weights
 * are re-normalized so the overall score stays on the same scale.
 *
 * Fairness: inputs are limited to job-relevant signals (skills, years of relevant experience,
 * education level, similarity of professional text). Personal attributes are not part of the input
 * types and therefore cannot influence the score.
 */

export interface MatchingWeights {
  skills: number;
  experience: number;
  education: number;
  semantic: number;
}

export const DEFAULT_MATCHING_WEIGHTS: MatchingWeights = {
  skills: 0.4,
  experience: 0.2,
  education: 0.1,
  semantic: 0.3,
};

export interface MatchRequirementInput {
  skill: string;
  /** Canonical skill key (see `normalizeSkill`). */
  normalizedSkill: string;
  required: boolean;
  /** Relative importance, 1 (nice to know) … 5 (critical). */
  weight: number;
  minimumYears: number | null;
}

export interface MatchJobInput {
  requirements: readonly MatchRequirementInput[];
  minYearsExperience: number | null;
  educationLevel: EducationLevel | null;
}

export interface MatchCandidateSkillInput {
  normalizedSkill: string;
  yearsExperience: number | null;
}

export interface MatchCandidateInput {
  skills: readonly MatchCandidateSkillInput[];
  totalExperienceYears: number | null;
  highestEducation: EducationLevel | null;
}

export type RequirementMatchStatus = 'MATCHED' | 'PARTIAL' | 'RELATED' | 'MISSING';

export interface RequirementBreakdown {
  skill: string;
  normalizedSkill: string;
  required: boolean;
  weight: number;
  status: RequirementMatchStatus;
  /** Credit earned for this requirement, 0–1. */
  credit: number;
  candidateYears: number | null;
  minimumYears: number | null;
  /** Candidate skill that earned related credit, if any. */
  viaSkill: string | null;
}

export interface MatchResult {
  overallScore: number;
  skillsScore: number | null;
  experienceScore: number | null;
  educationScore: number | null;
  semanticScore: number | null;
  matchedSkills: string[];
  missingSkills: string[];
  /** Weights actually applied after excluding non-evaluable components (sum to 1). */
  appliedWeights: MatchingWeights;
  requirements: RequirementBreakdown[];
  explanation: string;
  highlights: string[];
  concerns: string[];
}

/** Credit for a related (adjacent) skill instead of the exact one. */
export const RELATED_SKILL_CREDIT = 0.5;
/** Importance multiplier for required vs. preferred requirements. */
export const REQUIRED_MULTIPLIER = 2;
/**
 * Cosine similarity band mapped to 0–100 for the semantic component. Calibrated on the seed data
 * for bge-small-en-v1.5 profile ↔ job-description pairs: unrelated roles sit around 0.60–0.65,
 * adjacent roles 0.70–0.80 and strong matches 0.85–0.92.
 */
export const SEMANTIC_FLOOR = 0.6;
export const SEMANTIC_CEILING = 0.9;

export function normalizeWeights(weights: MatchingWeights): MatchingWeights {
  const entries = Object.entries(weights) as [keyof MatchingWeights, number][];
  const safe = entries.map(([k, v]) => [k, Number.isFinite(v) && v > 0 ? v : 0] as const);
  const total = safe.reduce((sum, [, v]) => sum + v, 0);
  if (total === 0) return { ...DEFAULT_MATCHING_WEIGHTS };
  return Object.fromEntries(safe.map(([k, v]) => [k, v / total])) as unknown as MatchingWeights;
}

function requirementCredit(
  req: MatchRequirementInput,
  candidateSkills: ReadonlyMap<string, MatchCandidateSkillInput>,
): RequirementBreakdown {
  const base = {
    skill: req.skill,
    normalizedSkill: req.normalizedSkill,
    required: req.required,
    weight: req.weight,
    minimumYears: req.minimumYears,
  };

  const exact = candidateSkills.get(req.normalizedSkill);
  if (exact) {
    const years = exact.yearsExperience;
    if (req.minimumYears && req.minimumYears > 0 && years !== null && years < req.minimumYears) {
      // Has the skill but less depth than asked: proportional credit, never below half.
      const credit = clamp(years / req.minimumYears, 0.5, 1);
      return { ...base, status: 'PARTIAL', credit, candidateYears: years, viaSkill: null };
    }
    return { ...base, status: 'MATCHED', credit: 1, candidateYears: years, viaSkill: null };
  }

  for (const skill of candidateSkills.values()) {
    if (areSkillsRelated(req.normalizedSkill, skill.normalizedSkill)) {
      return {
        ...base,
        status: 'RELATED',
        credit: RELATED_SKILL_CREDIT,
        candidateYears: skill.yearsExperience,
        viaSkill: skillDisplayName(skill.normalizedSkill),
      };
    }
  }

  return { ...base, status: 'MISSING', credit: 0, candidateYears: null, viaSkill: null };
}

export function scoreSkills(
  requirements: readonly MatchRequirementInput[],
  candidateSkills: readonly MatchCandidateSkillInput[],
): { score: number | null; breakdown: RequirementBreakdown[] } {
  if (requirements.length === 0) return { score: null, breakdown: [] };

  const skillMap = new Map(candidateSkills.map((s) => [s.normalizedSkill, s]));
  const breakdown = requirements.map((req) => requirementCredit(req, skillMap));

  let earned = 0;
  let possible = 0;
  for (const item of breakdown) {
    const importance = clamp(item.weight, 1, 5) * (item.required ? REQUIRED_MULTIPLIER : 1);
    earned += importance * item.credit;
    possible += importance;
  }
  return { score: possible === 0 ? null : round((earned / possible) * 100), breakdown };
}

/**
 * Experience relative to the job minimum. Meeting or exceeding the minimum scores 100 — being
 * more experienced is never penalized (it would act as a proxy for age). Unknown experience
 * scores a neutral 50 and is reported as a concern rather than treated as zero.
 */
export function scoreExperience(
  candidateYears: number | null,
  minYears: number | null,
): number | null {
  if (minYears === null || minYears <= 0) return candidateYears === null ? null : 100;
  if (candidateYears === null) return 50;
  if (candidateYears >= minYears) return 100;
  return round(clamp(candidateYears / minYears, 0, 1) * 100);
}

export function educationRank(level: EducationLevel): number {
  return EDUCATION_LEVELS.indexOf(level);
}

/** Education level vs. requirement: meets → 100, one level below → 60, further below → 30. */
export function scoreEducation(
  candidateLevel: EducationLevel | null,
  requiredLevel: EducationLevel | null,
): number | null {
  if (requiredLevel === null || requiredLevel === 'NONE') return null;
  if (candidateLevel === null) return 40;
  const gap = educationRank(requiredLevel) - educationRank(candidateLevel);
  if (gap <= 0) return 100;
  if (gap === 1) return 60;
  return 30;
}

/** Maps cosine similarity (−1…1) into 0–100 using the calibrated band. */
export function scoreSemantic(cosineSimilarity: number | null): number | null {
  if (cosineSimilarity === null || !Number.isFinite(cosineSimilarity)) return null;
  const scaled = (cosineSimilarity - SEMANTIC_FLOOR) / (SEMANTIC_CEILING - SEMANTIC_FLOOR);
  return round(clamp(scaled, 0, 1) * 100);
}

export function computeMatch(params: {
  job: MatchJobInput;
  candidate: MatchCandidateInput;
  semanticSimilarity: number | null;
  weights?: MatchingWeights;
}): MatchResult {
  const { job, candidate, semanticSimilarity } = params;
  const weights = normalizeWeights(params.weights ?? DEFAULT_MATCHING_WEIGHTS);

  const skills = scoreSkills(job.requirements, candidate.skills);
  const components = {
    skills: skills.score,
    experience: scoreExperience(candidate.totalExperienceYears, job.minYearsExperience),
    education: scoreEducation(candidate.highestEducation, job.educationLevel),
    semantic: scoreSemantic(semanticSimilarity),
  };

  const applicable = (Object.keys(components) as (keyof MatchingWeights)[]).filter(
    (key) => components[key] !== null && weights[key] > 0,
  );
  const applicableTotal = applicable.reduce((sum, key) => sum + weights[key], 0);
  const appliedWeights: MatchingWeights = { skills: 0, experience: 0, education: 0, semantic: 0 };
  let overall = 0;
  for (const key of applicable) {
    appliedWeights[key] = weights[key] / applicableTotal;
    overall += appliedWeights[key] * (components[key] ?? 0);
  }

  const matchedSkills = skills.breakdown
    .filter((r) => r.status === 'MATCHED' || r.status === 'PARTIAL')
    .map((r) => r.skill);
  const missingSkills = skills.breakdown.filter((r) => r.status === 'MISSING').map((r) => r.skill);

  const partial: Omit<MatchResult, 'explanation' | 'highlights' | 'concerns'> = {
    overallScore: applicable.length === 0 ? 0 : round(overall),
    skillsScore: components.skills,
    experienceScore: components.experience,
    educationScore: components.education,
    semanticScore: components.semantic,
    matchedSkills,
    missingSkills,
    appliedWeights: {
      skills: round(appliedWeights.skills, 3),
      experience: round(appliedWeights.experience, 3),
      education: round(appliedWeights.education, 3),
      semantic: round(appliedWeights.semantic, 3),
    },
    requirements: skills.breakdown,
  };

  const { explanation, highlights, concerns } = explainMatch(partial, job, candidate);
  return { ...partial, explanation, highlights, concerns };
}

export function scoreBand(score: number): 'STRONG' | 'GOOD' | 'FAIR' | 'WEAK' {
  if (score >= 80) return 'STRONG';
  if (score >= 65) return 'GOOD';
  if (score >= 45) return 'FAIR';
  return 'WEAK';
}

const BAND_PHRASE: Record<ReturnType<typeof scoreBand>, string> = {
  STRONG: 'a strong match',
  GOOD: 'a good match',
  FAIR: 'a partial match',
  WEAK: 'a weak match',
};

function listPhrase(items: readonly string[], max = 5): string {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  const joined =
    shown.length <= 1
      ? (shown[0] ?? '')
      : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
  return rest > 0 ? `${joined} (+${rest} more)` : joined;
}

/**
 * Builds a human-readable explanation strictly from computed data. No free-form generation, so the
 * explanation can never claim something the numbers do not support.
 */
export function explainMatch(
  result: Omit<MatchResult, 'explanation' | 'highlights' | 'concerns'>,
  job: MatchJobInput,
  candidate: MatchCandidateInput,
): { explanation: string; highlights: string[]; concerns: string[] } {
  const highlights: string[] = [];
  const concerns: string[] = [];
  const reqs = result.requirements;

  const requiredReqs = reqs.filter((r) => r.required);
  const requiredMet = requiredReqs.filter((r) => r.status === 'MATCHED' || r.status === 'PARTIAL');
  const requiredMissing = requiredReqs.filter((r) => r.status === 'MISSING');
  const related = reqs.filter((r) => r.status === 'RELATED');
  const partial = reqs.filter((r) => r.status === 'PARTIAL');
  const preferredMet = reqs.filter(
    (r) => !r.required && (r.status === 'MATCHED' || r.status === 'PARTIAL'),
  );

  if (requiredReqs.length > 0) {
    highlights.push(`Meets ${requiredMet.length} of ${requiredReqs.length} required skills.`);
  }
  if (requiredMet.length > 0) {
    highlights.push(`Required skills present: ${listPhrase(requiredMet.map((r) => r.skill))}.`);
  }
  if (preferredMet.length > 0) {
    highlights.push(`Preferred skills present: ${listPhrase(preferredMet.map((r) => r.skill))}.`);
  }
  if (requiredMissing.length > 0) {
    concerns.push(`Missing required skills: ${listPhrase(requiredMissing.map((r) => r.skill))}.`);
  }
  for (const r of related) {
    concerns.push(`No direct ${r.skill} experience; related experience with ${r.viaSkill}.`);
  }
  for (const r of partial) {
    concerns.push(
      `${r.skill}: ${r.candidateYears ?? 0} years listed vs. ${r.minimumYears} years requested.`,
    );
  }

  if (result.experienceScore !== null && job.minYearsExperience && job.minYearsExperience > 0) {
    if (candidate.totalExperienceYears === null) {
      concerns.push('Total experience could not be determined from the resume.');
    } else if (candidate.totalExperienceYears >= job.minYearsExperience) {
      highlights.push(
        `${candidate.totalExperienceYears} years of experience meets the ${job.minYearsExperience}+ year requirement.`,
      );
    } else {
      concerns.push(
        `${candidate.totalExperienceYears} years of experience vs. ${job.minYearsExperience}+ years requested.`,
      );
    }
  }

  if (result.educationScore !== null && job.educationLevel) {
    if (result.educationScore === 100) highlights.push('Meets the education requirement.');
    else if (candidate.highestEducation === null)
      concerns.push('Education level could not be determined from the resume.');
    else concerns.push('Education is below the stated requirement.');
  }

  if (result.semanticScore !== null) {
    if (result.semanticScore >= 70)
      highlights.push('Overall background is closely aligned with the job description.');
    else if (result.semanticScore < 35)
      concerns.push('Overall background is only loosely related to the job description.');
  }

  const band = BAND_PHRASE[scoreBand(result.overallScore)];
  const parts = [`Overall ${result.overallScore}/100 — ${band}.`];
  if (result.skillsScore !== null) parts.push(`Skills ${result.skillsScore}/100.`);
  if (result.experienceScore !== null) parts.push(`Experience ${result.experienceScore}/100.`);
  if (result.educationScore !== null) parts.push(`Education ${result.educationScore}/100.`);
  if (result.semanticScore !== null) parts.push(`Semantic fit ${result.semanticScore}/100.`);
  if (requiredMissing.length > 0) {
    parts.push(
      `Gaps: ${listPhrase(
        requiredMissing.map((r) => r.skill),
        3,
      )}.`,
    );
  }

  return { explanation: parts.join(' '), highlights, concerns };
}
