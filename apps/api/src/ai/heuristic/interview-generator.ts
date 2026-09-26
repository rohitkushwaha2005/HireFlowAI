import type {
  GeneratedInterviewQuestion,
  QuestionCategory,
  QuestionDifficulty,
} from '@hireflow/shared';
import type { InterviewInput } from '../types';

/**
 * Template-based question generation for the heuristic development provider. Every question is
 * filled from the candidate's and job's actual data; nothing is invented.
 */

type Draft = Omit<GeneratedInterviewQuestion, 'difficulty'> & { difficulty?: QuestionDifficulty };

function technical(input: InterviewInput): Draft[] {
  const skillYears = new Map(input.candidate.skills.map((s) => [s.skill.toLowerCase(), s.yearsExperience]));
  const drafts: Draft[] = [];
  for (const req of input.job.requirements.filter((r) => r.required)) {
    const years = skillYears.get(req.skill.toLowerCase());
    const has = input.match?.matchedSkills.includes(req.skill) ?? skillYears.has(req.skill.toLowerCase());
    if (has) {
      drafts.push({
        category: 'TECHNICAL',
        question: `Walk me through a production problem you solved with ${req.skill}. What trade-offs did you consider, and what would you do differently now?`,
        expectedSignals: [
          `Hands-on depth with ${req.skill} beyond tutorials`,
          'Explains trade-offs and alternatives considered',
          'Reflects on outcomes and lessons learned',
        ],
        rationale: `${req.skill} is a required skill${years ? ` and the candidate lists ${years} years with it` : ''}.`,
        difficulty: years && years >= 4 ? 'HARD' : 'MEDIUM',
      });
    } else {
      drafts.push({
        category: 'TECHNICAL',
        question: `This role relies on ${req.skill}. What adjacent experience do you have, and how would you get productive with it in your first month?`,
        expectedSignals: [
          'Identifies transferable concepts from related tools',
          'Concrete, realistic learning plan',
          'Awareness of common pitfalls',
        ],
        rationale: `${req.skill} is required but was not found in the candidate's profile — probe adjacent experience rather than assume a gap.`,
        difficulty: 'MEDIUM',
      });
    }
  }
  return drafts;
}

function project(input: InterviewInput): Draft[] {
  const fromProjects: Draft[] = input.candidate.projects.map((p) => ({
    category: 'PROJECT',
    question: `Tell me about "${p.name}". What was your specific role, and what was the hardest technical problem you solved${p.technologies.length ? ` using ${p.technologies.slice(0, 3).join(', ')}` : ''}?`,
    expectedSignals: ['Clear ownership of their contribution', 'Depth on one hard problem', 'Measurable outcome or learning'],
    rationale: `Based on the candidate's project "${p.name}".`,
    difficulty: 'MEDIUM',
  }));
  const fromRoles: Draft[] = input.candidate.experiences.slice(0, 2).map((e) => ({
    category: 'PROJECT',
    question: `In your role as ${e.title} at ${e.company}, which project had the most impact? Walk me through its architecture and your decisions.`,
    expectedSignals: ['Explains architecture at the right level', 'Justifies key decisions', 'Quantifies impact'],
    rationale: `Based on the candidate's experience as ${e.title} at ${e.company}.`,
    difficulty: 'MEDIUM',
  }));
  return [...fromProjects, ...fromRoles];
}

function systemDesign(input: InterviewInput): Draft[] {
  const skills = input.job.requirements.slice(0, 3).map((r) => r.skill);
  const stack = skills.length ? ` using ${skills.join(', ')}` : '';
  return [
    {
      category: 'SYSTEM_DESIGN',
      question: `Design the core service behind a feature this ${input.job.title} team might own${stack}. How would you handle scaling, failure and observability?`,
      expectedSignals: ['Clarifies requirements first', 'Sensible data model and APIs', 'Addresses scaling, failure modes and monitoring'],
      rationale: `System design for ${input.job.title} with the job's core stack.`,
      difficulty: 'HARD',
    },
    {
      category: 'SYSTEM_DESIGN',
      question: 'How would you design a background job pipeline that processes thousands of uploaded documents reliably, with retries and progress tracking?',
      expectedSignals: ['Queues and idempotency', 'Retry/backoff and dead-letter handling', 'Progress visibility and back-pressure'],
      rationale: 'Assesses asynchronous processing design common to production systems.',
      difficulty: 'HARD',
    },
  ];
}

function behavioral(input: InterviewInput): Draft[] {
  const latest = input.candidate.experiences[0];
  const at = latest ? ` at ${latest.company}` : '';
  return [
    {
      category: 'BEHAVIORAL',
      question: `Describe a time${at} when you disagreed with a technical decision. How did you handle it and what was the outcome?`,
      expectedSignals: ['Uses a concrete example (STAR)', 'Respectful, evidence-based disagreement', 'Commits once a decision is made'],
      rationale: 'Assesses collaboration and judgment.',
      difficulty: 'EASY',
    },
    {
      category: 'BEHAVIORAL',
      question: 'Tell me about a time you shipped something under a tight deadline. What did you cut, and how did you manage the risk?',
      expectedSignals: ['Prioritization', 'Transparent risk communication', 'Follow-up on deferred work'],
      rationale: 'Assesses prioritization and ownership.',
      difficulty: 'MEDIUM',
    },
    {
      category: 'BEHAVIORAL',
      question: 'Describe a production incident you were involved in. What was your role and what changed afterwards?',
      expectedSignals: ['Calm, structured debugging', 'Blameless learning', 'Concrete preventive changes'],
      rationale: 'Assesses operational maturity.',
      difficulty: 'MEDIUM',
    },
  ];
}

function roleSpecific(input: InterviewInput): Draft[] {
  const concerns = (input.match?.missingSkills ?? []).slice(0, 2).map<Draft>((skill) => ({
    category: 'ROLE_SPECIFIC',
    question: `The team uses ${skill} daily. Have you worked with anything similar, and how would you approach learning it on the job?`,
    expectedSignals: ['Honest self-assessment', 'Transferable experience', 'Learning strategy'],
    rationale: `${skill} is listed by the job but missing from the candidate's profile.`,
    difficulty: 'EASY',
  }));
  const drafts: Draft[] = [
    {
      category: 'ROLE_SPECIFIC',
      question: `What interests you about this ${input.job.title} role, and which part of it do you expect to be most challenging?`,
      expectedSignals: ['Understands the role', 'Self-aware about growth areas', 'Motivation tied to the work'],
      rationale: 'Checks role understanding and motivation.',
      difficulty: 'EASY',
    },
  ];
  return [...concerns, ...drafts];
}

const GENERATORS: Record<QuestionCategory, (input: InterviewInput) => Draft[]> = {
  TECHNICAL: technical,
  PROJECT: project,
  SYSTEM_DESIGN: systemDesign,
  BEHAVIORAL: behavioral,
  ROLE_SPECIFIC: roleSpecific,
};

export function generateQuestionsHeuristically(input: InterviewInput): GeneratedInterviewQuestion[] {
  const pools = input.categories.map((category) => GENERATORS[category](input));
  const result: GeneratedInterviewQuestion[] = [];
  // Round-robin across categories so the set stays balanced.
  for (let round = 0; result.length < input.count && pools.some((pool) => pool.length > round); round++) {
    for (const pool of pools) {
      const draft = pool[round];
      if (draft && result.length < input.count) {
        result.push({ ...draft, difficulty: input.difficulty ?? draft.difficulty ?? 'MEDIUM' });
      }
    }
  }
  return result;
}
