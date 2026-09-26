import {
  extractKnownSkills,
  type EducationLevel,
  type EmploymentType,
  type ExperienceLevel,
  type JobAnalysis,
  type RemoteType,
} from '@hireflow/shared';

/** Rule-based job description analysis used by the heuristic development provider. */

type Block = 'intro' | 'responsibilities' | 'required' | 'preferred' | 'other';

const BLOCK_PATTERNS: Array<[Block, RegExp]> = [
  ['preferred', /(nice[\s-]to[\s-]have|preferred|bonus|pluses|good[\s-]to[\s-]have|extra credit)/i],
  [
    'required',
    /(requirements|qualifications|must[\s-]have|what you('ll)?\s+(need|bring)|you have|about you|skills|who you are)/i,
  ],
  [
    'responsibilities',
    /(responsibilities|what you('ll)?\s+do|the role|your impact|day[\s-]to[\s-]day|you will)/i,
  ],
  ['other', /(benefits|perks|about us|compensation|why join|equal opportunity)/i],
];

const BULLET_RE = /^\s*(?:[-*•·▪◦‣–]|\d+[.)])\s+/;

function blockFor(line: string): Block | null {
  const cleaned = line.replace(/[:#*]/g, '').trim();
  if (cleaned.length > 60 || BULLET_RE.test(line)) return null;
  for (const [block, pattern] of BLOCK_PATTERNS) if (pattern.test(cleaned)) return block;
  return null;
}

function splitBlocks(description: string): Map<Block, string[]> {
  const blocks = new Map<Block, string[]>();
  let current: Block = 'intro';
  for (const raw of description.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = blockFor(line);
    if (heading && line.replace(BULLET_RE, '').length < 60 && !/[.!?]$/.test(line)) {
      current = heading;
      continue;
    }
    blocks.set(current, [...(blocks.get(current) ?? []), line]);
  }
  return blocks;
}

function seniorityFromTitle(title: string): ExperienceLevel | null {
  if (/\bintern(ship)?\b/i.test(title)) return 'INTERN';
  if (/\b(junior|jr\.?|entry|graduate)\b/i.test(title)) return 'JUNIOR';
  if (/\bprincipal|distinguished|staff\b/i.test(title)) return 'PRINCIPAL';
  if (/\b(lead|head|manager)\b/i.test(title)) return 'LEAD';
  if (/\b(senior|sr\.?)\b/i.test(title)) return 'SENIOR';
  if (/\b(mid|intermediate)\b/i.test(title)) return 'MID';
  return null;
}

function educationFrom(text: string): EducationLevel | null {
  if (/\bno degree required\b/i.test(text)) return 'NONE';
  if (/\b(ph\.?d|doctorate)\b/i.test(text) && !/\b(bachelor|master)/i.test(text))
    return 'DOCTORATE';
  if (/\b(master'?s|m\.?s\.?)\s+(degree|in)\b/i.test(text) && !/\bbachelor/i.test(text))
    return 'MASTER';
  if (
    /\b(bachelor'?s?|b\.?s\.?|bs\/ms|degree in|university degree|computer science degree)\b/i.test(
      text,
    )
  )
    return 'BACHELOR';
  return null;
}

function remoteFrom(text: string): RemoteType | null {
  if (/\bhybrid\b/i.test(text)) return 'HYBRID';
  if (/\b(fully remote|remote[- ]first|100% remote|remote)\b/i.test(text)) return 'REMOTE';
  if (/\b(on[- ]?site|in[- ]office|in the office)\b/i.test(text)) return 'ONSITE';
  return null;
}

function employmentFrom(text: string): EmploymentType | null {
  if (/\binternship\b/i.test(text)) return 'INTERNSHIP';
  if (/\bcontract(or)?\b/i.test(text)) return 'CONTRACT';
  if (/\bpart[- ]time\b/i.test(text)) return 'PART_TIME';
  if (/\bfull[- ]time\b/i.test(text)) return 'FULL_TIME';
  return null;
}

function yearsNear(line: string, skillName: string): number | null {
  const escaped = skillName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(\\d+)\\+?\\s*(?:-\\s*\\d+\\s*)?years?[^.\\n]{0,50}?${escaped}`, 'i');
  const match = pattern.exec(line);
  return match ? Number(match[1]) : null;
}

export function analyzeJobHeuristically(title: string, description: string): JobAnalysis {
  const blocks = splitBlocks(description);
  const requiredText = (blocks.get('required') ?? []).join('\n');
  const preferredText = (blocks.get('preferred') ?? []).join('\n');
  const hasStructure = requiredText.length > 0 || preferredText.length > 0;

  const titleSkills = new Set(extractKnownSkills(title).map((s) => s.key));
  const preferredSkills = hasStructure ? extractKnownSkills(preferredText) : [];
  const preferredKeys = new Set(preferredSkills.map((s) => s.key));
  const requiredSource = hasStructure ? `${title}\n${requiredText}` : `${title}\n${description}`;
  const requiredSkills = extractKnownSkills(requiredSource).filter(
    (s) => !preferredKeys.has(s.key),
  );

  const requirementLines = requiredText.split('\n');
  const toRequirement = (skill: (typeof requiredSkills)[number], required: boolean) => {
    const line =
      requirementLines.find((l) => l.toLowerCase().includes(skill.name.toLowerCase())) ?? '';
    return {
      skill: skill.name,
      category: skill.category,
      weight: required ? (titleSkills.has(skill.key) ? 5 : 4) : 2,
      minimumYears: required ? yearsNear(line, skill.name) : null,
    };
  };

  const overallYears =
    /(\d+)\+?\s*(?:-\s*\d+\s*)?years?(?:\s+of)?\s+(?:professional\s+|relevant\s+|industry\s+|hands-on\s+)?(?:experience|software|engineering|development)/i.exec(
      requiredText || description,
    );

  const responsibilityLines = blocks.get('responsibilities') ?? [];
  const responsibilities = (
    responsibilityLines.length
      ? responsibilityLines
      : description
          .split(/\r?\n/)
          .filter((l) => BULLET_RE.test(l))
          .slice(0, 8)
  )
    .map((l) => l.replace(BULLET_RE, '').trim())
    .filter((l) => l.length > 10)
    .slice(0, 12);

  const location = /\blocation:\s*([^\n]+)/i.exec(description)?.[1]?.trim() ?? null;
  // Summary from the introduction only (never from bullet lists); fall back to a generated line.
  const intro = (blocks.get('intro') ?? []).filter((l) => !BULLET_RE.test(l)).join(' ');
  const sentences = intro.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]/g) ?? [];
  const topSkills = requiredSkills.slice(0, 3).map((s) => s.name);
  const summary =
    sentences.slice(0, 2).join(' ').trim() ||
    `${title} role${topSkills.length ? ` focused on ${topSkills.join(', ')}` : ''}.`;

  return {
    summary: summary.slice(0, 400),
    requiredSkills: requiredSkills.map((s) => toRequirement(s, true)),
    preferredSkills: preferredSkills.map((s) => toRequirement(s, false)),
    minYearsExperience: overallYears ? Number(overallYears[1]) : null,
    educationLevel: educationFrom(description),
    responsibilities,
    keywords: [...new Set([...requiredSkills, ...preferredSkills].map((s) => s.name))].slice(0, 15),
    seniority: seniorityFromTitle(title),
    location,
    employmentType: employmentFrom(description),
    remoteType: remoteFrom(description),
  };
}
