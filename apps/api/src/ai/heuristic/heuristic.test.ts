import { describe, expect, it } from 'vitest';
import { analyzeJobHeuristically } from './job-analyzer';
import { generateQuestionsHeuristically } from './interview-generator';
import { parseResumeHeuristically, partialDateToDate, toPartialDate } from './resume-parser';

const RESUME = `Ada Example
Senior Backend Engineer
ada@example.com | +1 555 123 4567 | Austin, TX
linkedin.com/in/ada-example | github.com/ada-example

SUMMARY
Backend engineer building payment systems.

EXPERIENCE
Senior Backend Engineer — Example Payments | Jan 2021 – Present
• Built Node.js and TypeScript services on PostgreSQL
• Introduced Kafka for event streaming
Backend Developer — Sample Corp | Jun 2018 – Dec 2020
• Maintained Python and Django APIs

EDUCATION
M.S. in Computer Science — Example State University | 2016 – 2018
GPA 3.8/4.0

SKILLS
Languages: TypeScript, Python, SQL
Tools: Docker, AWS

PROJECTS
ledger-kit — Double-entry accounting library in TypeScript

CERTIFICATIONS
• AWS Certified Developer`;

describe('heuristic resume parser', () => {
  const parsed = parseResumeHeuristically(RESUME);

  it('extracts contact details and links', () => {
    expect(parsed).toMatchObject({
      name: 'Ada Example',
      email: 'ada@example.com',
      phone: '+1 555 123 4567',
      location: 'Austin, TX',
      headline: 'Senior Backend Engineer',
    });
    expect(parsed.links.linkedin).toBe('https://linkedin.com/in/ada-example');
    expect(parsed.links.github).toBe('https://github.com/ada-example');
  });

  it('extracts dated work experience with current role', () => {
    expect(parsed.workExperience).toEqual([
      expect.objectContaining({
        title: 'Senior Backend Engineer',
        company: 'Example Payments',
        startDate: '2021-01',
        endDate: null,
        current: true,
      }),
      expect.objectContaining({
        title: 'Backend Developer',
        company: 'Sample Corp',
        startDate: '2018-06',
        endDate: '2020-12',
        current: false,
      }),
    ]);
    expect(parsed.currentRole).toBe('Senior Backend Engineer');
    expect(parsed.totalExperienceYears).toBeGreaterThan(7);
  });

  it('extracts education with level, field and grade', () => {
    expect(parsed.education[0]).toMatchObject({
      institution: 'Example State University',
      level: 'MASTER',
      field: 'Computer Science',
      grade: 'GPA 3.8/4.0',
    });
  });

  it('combines listed and mentioned skills and derives years from dated roles', () => {
    const skills = new Map(parsed.skills.map((s) => [s.name, s.yearsExperience]));
    expect([...skills.keys()]).toEqual(
      expect.arrayContaining([
        'TypeScript',
        'Python',
        'Docker',
        'AWS',
        'Node.js',
        'PostgreSQL',
        'Kafka',
        'Django',
      ]),
    );
    expect(skills.get('Node.js')).toBeGreaterThan(5);
    expect(skills.get('Docker')).toBeNull();
  });

  it('extracts projects and certifications', () => {
    expect(parsed.projects[0]).toMatchObject({ name: 'ledger-kit', technologies: ['TypeScript'] });
    expect(parsed.certifications).toEqual(['AWS Certified Developer']);
  });

  it('never invents data for missing sections', () => {
    const minimal = parseResumeHeuristically('Just a line of text without structure');
    expect(minimal.workExperience).toEqual([]);
    expect(minimal.education).toEqual([]);
    expect(minimal.totalExperienceYears).toBeNull();
  });
});

describe('partial dates', () => {
  it.each([
    ['Jan 2021', '2021-01'],
    ['September 2019', '2019-09'],
    ['03/2020', '2020-03'],
    ['2018', '2018'],
    ['Present', null],
  ])('%s → %s', (input, expected) => {
    expect(toPartialDate(input)).toBe(expected);
  });

  it('converts to UTC dates', () => {
    expect(partialDateToDate('2021-03')?.toISOString()).toBe('2021-03-01T00:00:00.000Z');
    expect(partialDateToDate(null)).toBeNull();
  });
});

describe('heuristic job analyzer', () => {
  const analysis = analyzeJobHeuristically(
    'Senior React Engineer',
    `Join our team.

Responsibilities:
- Build React interfaces for our analytics product
- Review code and mentor engineers

Requirements:
- 5+ years of professional experience
- 3+ years with TypeScript
- React and GraphQL
- Bachelor's degree in Computer Science

Nice to have:
- AWS

This is a fully remote, full-time role.`,
  );

  it('separates required and preferred skills', () => {
    expect(analysis.requiredSkills.map((s) => s.skill)).toEqual(
      expect.arrayContaining(['React', 'TypeScript', 'GraphQL']),
    );
    expect(analysis.preferredSkills.map((s) => s.skill)).toEqual(['AWS']);
  });

  it('weights skills in the title highest and reads per-skill years', () => {
    const react = analysis.requiredSkills.find((s) => s.skill === 'React')!;
    const ts = analysis.requiredSkills.find((s) => s.skill === 'TypeScript')!;
    expect(react.weight).toBe(5);
    expect(ts.minimumYears).toBe(3);
  });

  it('extracts overall requirements and job attributes', () => {
    expect(analysis).toMatchObject({
      minYearsExperience: 5,
      educationLevel: 'BACHELOR',
      seniority: 'SENIOR',
      remoteType: 'REMOTE',
      employmentType: 'FULL_TIME',
    });
    expect(analysis.responsibilities).toEqual([
      'Build React interfaces for our analytics product',
      'Review code and mentor engineers',
    ]);
  });
});

describe('heuristic interview generator', () => {
  it('produces balanced, data-grounded questions', () => {
    const questions = generateQuestionsHeuristically({
      job: {
        title: 'Backend Engineer',
        description: '',
        requirements: [
          { skill: 'Go', required: true, minimumYears: null },
          { skill: 'PostgreSQL', required: true, minimumYears: null },
        ],
      },
      candidate: {
        headline: null,
        summary: null,
        totalExperience: 4,
        highestEducation: null,
        skills: [{ skill: 'PostgreSQL', yearsExperience: 4 }],
        experiences: [{ title: 'Engineer', company: 'Acme', description: null }],
        projects: [{ name: 'queue-lite', description: null, technologies: ['Go'] }],
      },
      match: { matchedSkills: ['PostgreSQL'], missingSkills: ['Go'], concerns: [] },
      count: 5,
      categories: ['TECHNICAL', 'PROJECT', 'SYSTEM_DESIGN', 'BEHAVIORAL', 'ROLE_SPECIFIC'],
      difficulty: null,
    });
    expect(questions).toHaveLength(5);
    expect(new Set(questions.map((q) => q.category)).size).toBe(5);
    expect(questions.some((q) => q.question.includes('queue-lite'))).toBe(true);
    // A missing required skill is probed, not treated as disqualifying.
    expect(questions.find((q) => q.category === 'TECHNICAL')!.question).toMatch(/PostgreSQL|Go/);
  });
});
