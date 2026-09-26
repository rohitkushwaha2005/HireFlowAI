import {
  extractKnownSkills,
  normalizeSkill,
  totalExperienceYears,
  type EducationLevel,
  type ResumeAnalysis,
} from '@hireflow/shared';

/**
 * Rule-based resume parser used by the heuristic development provider. It recognizes common resume
 * layouts (section headings, "Title — Company | Jan 2020 – Present" lines, bullet lists). It is
 * intentionally conservative: when unsure it returns null rather than guessing.
 */

type Section =
  | 'header'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'other';

const SECTION_PATTERNS: Array<[Section, RegExp]> = [
  ['summary', /^(professional\s+|career\s+)?(summary|profile|about(\s+me)?|objective)$/i],
  [
    'experience',
    /^(work\s+|professional\s+|relevant\s+)?(experience|employment(\s+history)?|work\s+history)$/i,
  ],
  ['education', /^(education|academic\s+background)(\s*(&|and)\s*training)?$/i],
  [
    'skills',
    /^(technical\s+|core\s+|key\s+)?(skills|competencies|technologies|tech\s+stack)(\s*(&|and)\s*tools)?$/i,
  ],
  ['projects', /^(selected\s+|personal\s+|key\s+|side\s+)?projects$/i],
  ['certifications', /^(certifications?|licenses?(\s*(&|and)\s*certifications)?|courses)$/i],
  ['other', /^(awards|honou?rs|publications|interests|languages|volunteer(ing)?|references)$/i],
];

const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const DATE = `(?:${MONTH}\\s+\\d{4}|\\d{1,2}/\\d{4}|\\d{4})`;
const RANGE_RE = new RegExp(
  `(${DATE})\\s*(?:-|–|—|to)\\s*(${DATE}|present|current|now|today)`,
  'i',
);

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const TITLE_WORDS =
  /\b(engineer|developer|manager|designer|analyst|scientist|lead|intern|architect|consultant|specialist|director|head|officer|administrator|programmer|researcher|associate|founder|cto|ceo|devops|sre|qa|tester)\b/i;
const INSTITUTION_WORDS = /\b(university|college|institute|school|academy|polytechnic)\b/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const URL_RE = /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s|,;]*)?)/gi;
const BULLET_RE = /^\s*(?:[-*•·▪◦‣–]|\d+[.)])\s+/;

function isHeading(line: string): Section | null {
  const cleaned = line
    .replace(/[:\-_=|]+$/g, '')
    .replace(/^[#\s]+/, '')
    .trim();
  if (!cleaned || cleaned.length > 40) return null;
  for (const [section, pattern] of SECTION_PATTERNS) if (pattern.test(cleaned)) return section;
  return null;
}

function splitSections(text: string): Map<Section, string[]> {
  const sections = new Map<Section, string[]>();
  let current: Section = 'header';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = isHeading(line);
    if (heading) {
      current = heading;
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    const list = sections.get(current) ?? [];
    list.push(line);
    sections.set(current, list);
  }
  return sections;
}

/** Parses "Jan 2020", "01/2020" or "2020" into "YYYY-MM"/"YYYY". */
export function toPartialDate(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (/^(present|current|now|today)$/.test(v)) return null;
  const slash = /^(\d{1,2})\/(\d{4})$/.exec(v);
  if (slash) return `${slash[2]}-${slash[1]!.padStart(2, '0')}`;
  const named = /^([a-z]+)\.?\s+(\d{4})$/.exec(v);
  if (named) {
    const month = MONTHS[named[1]!.slice(0, 3)];
    return month ? `${named[2]}-${String(month).padStart(2, '0')}` : named[2]!;
  }
  const year = /^(\d{4})$/.exec(v);
  return year ? year[1]! : null;
}

export function partialDateToDate(value: string | null): Date | null {
  if (!value) return null;
  const [year, month] = value.split('-');
  if (!year) return null;
  return new Date(Date.UTC(Number(year), month ? Number(month) - 1 : 0, 1));
}

function stripBullet(line: string): string {
  return line.replace(BULLET_RE, '').trim();
}

function splitHeader(text: string): string[] {
  return text
    .split(/\s+(?:—|–|-|\||@|at)\s+|\s*\|\s*|,\s+(?=[A-Z])/)
    .map((part) => part.replace(/[()]/g, '').trim())
    .filter(Boolean);
}

function parseExperience(lines: string[]): ResumeAnalysis['workExperience'] {
  const entries: ResumeAnalysis['workExperience'] = [];
  let current: (ResumeAnalysis['workExperience'][number] & { desc: string[] }) | null = null;
  let pendingHeader: string | null = null;

  const flush = () => {
    if (current) {
      const { desc, ...rest } = current;
      entries.push({ ...rest, description: desc.length ? desc.join('\n') : null });
    }
    current = null;
  };

  for (const line of lines) {
    const range = RANGE_RE.exec(line);
    if (range && !BULLET_RE.test(line)) {
      flush();
      let header = line
        .replace(range[0], '')
        .replace(/[|,–—-]\s*$/, '')
        .replace(/\(\s*\)/, '')
        .trim();
      if (header.length < 3 && pendingHeader) header = pendingHeader;
      else if (pendingHeader && !TITLE_WORDS.test(header) && TITLE_WORDS.test(pendingHeader)) {
        header = `${pendingHeader} | ${header}`;
      }
      pendingHeader = null;

      const parts = splitHeader(header);
      let title = parts[0] ?? header;
      let company = parts[1] ?? '';
      if (parts.length >= 2 && !TITLE_WORDS.test(parts[0]!) && TITLE_WORDS.test(parts[1]!)) {
        title = parts[1]!;
        company = parts[0]!;
      }
      const end = range[2]!;
      const isCurrent = /present|current|now|today/i.test(end);
      current = {
        title: title.slice(0, 120),
        company: (company || 'Unknown').slice(0, 120),
        startDate: toPartialDate(range[1]!),
        endDate: isCurrent ? null : toPartialDate(end),
        current: isCurrent,
        description: null,
        desc: [],
      };
      continue;
    }
    if (current && BULLET_RE.test(line)) {
      current.desc.push(stripBullet(line));
    } else if (current && current.desc.length > 0 && !TITLE_WORDS.test(line)) {
      // Continuation of a wrapped bullet: join it to the previous line.
      current.desc[current.desc.length - 1] = `${current.desc.at(-1)} ${line}`;
    } else {
      // A non-bullet line before a dated line is usually the title or company.
      if (current && current.desc.length === 0 && !pendingHeader) {
        current.desc.push(line);
      } else {
        pendingHeader = line;
      }
    }
  }
  flush();
  return entries;
}

function educationLevel(text: string): EducationLevel | null {
  if (/\b(ph\.?\s?d|doctor(ate)?|d\.?phil)\b/i.test(text)) return 'DOCTORATE';
  if (/\b(master'?s?|m\.?\s?sc?\.?|m\.?eng|mba|m\.?tech|m\.?a\.)(?=\W|$)/i.test(text))
    return 'MASTER';
  if (/\b(bachelor'?s?|b\.?\s?sc?\.?|b\.?eng|b\.?tech|b\.?a\.|b\.?e\.)(?=\W|$)/i.test(text))
    return 'BACHELOR';
  if (/\bassociate'?s?\b/i.test(text)) return 'ASSOCIATE';
  if (/\b(high school|secondary school|ged)\b/i.test(text)) return 'HIGH_SCHOOL';
  return null;
}

function parseEducation(lines: string[]): ResumeAnalysis['education'] {
  const entries: ResumeAnalysis['education'] = [];
  for (const raw of lines) {
    const line = stripBullet(raw);
    const level = educationLevel(line);
    if (!level && !INSTITUTION_WORDS.test(line)) {
      const last = entries.at(-1);
      const grade = /\b(c?gpa)[:\s]*([\d.]+(?:\s*\/\s*[\d.]+)?)/i.exec(line);
      if (last && grade) last.grade = `${grade[1]!.toUpperCase()} ${grade[2]}`;
      continue;
    }
    const range = RANGE_RE.exec(line);
    const years = line.match(/\b(19|20)\d{2}\b/g) ?? [];
    const withoutDates = line
      .replace(range?.[0] ?? '', '')
      .replace(/\(\s*\)/g, '')
      .trim();
    const parts = splitHeader(withoutDates);
    const institution =
      parts.find((p) => INSTITUTION_WORDS.test(p)) ??
      parts.find((p) => !educationLevel(p)) ??
      'Unknown';
    const degreePart = parts.find((p) => educationLevel(p)) ?? null;
    const field = degreePart
      ? (/\b(?:in|of)\s+([A-Za-z &]+)$/i.exec(degreePart)?.[1]?.trim() ?? null)
      : null;
    const grade = /\b(c?gpa)[:\s]*([\d.]+(?:\s*\/\s*[\d.]+)?)/i.exec(line);
    entries.push({
      institution: institution.slice(0, 160),
      degree: degreePart ? degreePart.replace(/\s+(?:in|of)\s+[A-Za-z &]+$/i, '').trim() : null,
      field,
      level,
      startDate: range ? toPartialDate(range[1]!) : years.length > 1 ? years[0]! : null,
      endDate: range ? toPartialDate(range[2]!) : (years.at(-1) ?? null),
      grade: grade ? `${grade[1]!.toUpperCase()} ${grade[2]}` : null,
    });
  }
  return entries;
}

function parseSkillList(lines: string[]): string[] {
  const skills: string[] = [];
  for (const raw of lines) {
    const line = stripBullet(raw);
    const afterLabel = line.includes(':') ? line.slice(line.indexOf(':') + 1) : line;
    for (const item of afterLabel.split(/[,|•;·/]| and /)) {
      const skill = item.replace(/\(.*?\)/g, '').trim();
      if (skill && skill.length <= 40 && !/^\d+$/.test(skill)) skills.push(skill);
    }
  }
  return skills;
}

function parseProjects(lines: string[]): ResumeAnalysis['projects'] {
  const projects: ResumeAnalysis['projects'] = [];
  for (const line of lines) {
    if (BULLET_RE.test(line) && projects.length > 0) {
      const last = projects.at(-1)!;
      const text = stripBullet(line);
      last.description = last.description ? `${last.description}\n${text}` : text;
      continue;
    }
    const url = line.match(URL_RE)?.find((u) => u.includes('/') || u.startsWith('http')) ?? null;
    const [namePart, ...rest] = line.split(/\s+(?:—|–|-|\|)\s+|:\s+/);
    projects.push({
      name: (namePart ?? line).replace(URL_RE, '').trim().slice(0, 120) || 'Project',
      description: rest.length ? rest.join(' — ').trim() : null,
      technologies: [],
      url: url ? (url.startsWith('http') ? url : `https://${url}`) : null,
    });
  }
  for (const project of projects) {
    project.technologies = extractKnownSkills(`${project.name} ${project.description ?? ''}`).map(
      (s) => s.name,
    );
  }
  return projects;
}

function parseHeader(lines: string[], fullText: string) {
  const email = EMAIL_RE.exec(fullText)?.[0] ?? null;
  const phone =
    lines
      .map((l) => PHONE_RE.exec(l.replace(EMAIL_RE, ''))?.[1])
      .find((p) => p && p.replace(/\D/g, '').length >= 8) ?? null;
  const urls = [...fullText.matchAll(URL_RE)]
    .map((m) => m[1]!)
    .filter(
      (u) =>
        !EMAIL_RE.test(u) &&
        /[a-z]\.[a-z]/i.test(u) &&
        (u.includes('/') || u.startsWith('www') || u.startsWith('http')),
    );
  const normalizeUrl = (u: string) => (u.startsWith('http') ? u : `https://${u}`);
  const linkedin = urls.find((u) => /linkedin\.com/i.test(u)) ?? null;
  const github = urls.find((u) => /github\.com/i.test(u)) ?? null;
  const others = urls.filter((u) => u !== linkedin && u !== github);

  const name =
    lines.find(
      (l) =>
        /^[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,3}$/.test(l) && !TITLE_WORDS.test(l),
    ) ?? null;
  const headline =
    lines.find((l) => l !== name && TITLE_WORDS.test(l) && !EMAIL_RE.test(l) && l.length < 100) ??
    null;
  const location =
    lines
      .flatMap((l) => l.split(/\s*[|•·]\s*/))
      .map((p) => p.trim())
      .find((p) => /^[A-Z][a-zA-Z .'-]+,\s*[A-Z][a-zA-Z .'-]+$/.test(p) && !TITLE_WORDS.test(p)) ??
    null;

  return {
    name,
    email,
    phone: phone ? phone.trim() : null,
    headline,
    location,
    links: {
      portfolio: others[0] ? normalizeUrl(others[0]) : null,
      linkedin: linkedin ? normalizeUrl(linkedin) : null,
      github: github ? normalizeUrl(github) : null,
      other: others.slice(1).map(normalizeUrl),
    },
  };
}

/** Years using each skill, from dated roles whose text mentions it (overlaps merged). */
function skillYears(
  skillKey: string,
  experiences: ResumeAnalysis['workExperience'],
): number | null {
  const positions = experiences
    .filter((exp) =>
      extractKnownSkills(`${exp.title} ${exp.description ?? ''}`).some((s) => s.key === skillKey),
    )
    .map((exp) => ({
      startDate: partialDateToDate(exp.startDate),
      endDate: partialDateToDate(exp.endDate),
      current: exp.current,
    }));
  if (positions.length === 0) return null;
  const years = totalExperienceYears(positions);
  return years > 0 ? years : null;
}

export function parseResumeHeuristically(text: string): ResumeAnalysis {
  const sections = splitSections(text);
  const header = sections.get('header') ?? [];
  const contact = parseHeader(header, text);
  const workExperience = parseExperience(sections.get('experience') ?? []);
  const education = parseEducation(sections.get('education') ?? []);
  const projects = parseProjects(sections.get('projects') ?? []);
  const certifications = (sections.get('certifications') ?? [])
    .map(stripBullet)
    .filter((c) => c.length <= 160);
  const summaryLines = sections.get('summary') ?? [];

  const listed = parseSkillList(sections.get('skills') ?? []);
  const mentioned = extractKnownSkills(text).map((s) => s.name);
  const seen = new Set<string>();
  const skills: ResumeAnalysis['skills'] = [];
  for (const raw of [...listed, ...mentioned]) {
    const normalized = normalizeSkill(raw);
    if (!normalized || seen.has(normalized.key)) continue;
    seen.add(normalized.key);
    skills.push({
      name: normalized.name,
      proficiency: null,
      yearsExperience: normalized.known ? skillYears(normalized.key, workExperience) : null,
    });
  }

  const total = totalExperienceYears(
    workExperience.map((e) => ({
      startDate: partialDateToDate(e.startDate),
      endDate: partialDateToDate(e.endDate),
      current: e.current,
    })),
  );
  const latest = workExperience[0];

  return {
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    location: contact.location,
    headline: contact.headline ?? latest?.title ?? null,
    summary: summaryLines.length ? summaryLines.join(' ') : null,
    currentRole: latest?.current ? latest.title : null,
    totalExperienceYears: workExperience.length && total > 0 ? total : null,
    skills,
    workExperience,
    education,
    projects,
    certifications,
    links: contact.links,
  };
}
