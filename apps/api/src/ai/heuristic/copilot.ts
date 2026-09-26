import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUSES,
  extractKnownSkills,
  type ApplicationStatus,
} from '@hireflow/shared';
import type { CopilotToolbox } from '../copilot/toolbox';
import type {
  CandidateComparison,
  CandidateProfileSummary,
  CandidateSearchHit,
  ApplicationSummary,
  InterviewQuestionsResult,
  JobSummary,
  PipelineSummary,
  SkillCandidateHit,
} from '../copilot/tool-results';
import type { HiringAnswer, HiringQuestionInput } from '../types';

/**
 * Deterministic copilot for the heuristic provider: regex intent detection → the same server tools
 * the LLM uses → answers templated from the returned rows only. It cannot hallucinate, but it is
 * far less flexible than the LLM copilot.
 */

const NOTE =
  '\n\n_Heuristic mode: answers are assembled from database queries without an LLM. Add an Anthropic API key for conversational answers._';

function bold(name: string): string {
  return `**${name}**`;
}

function score(value: number | null): string {
  return value === null ? 'no match score yet' : `match ${value}/100`;
}

function statusFrom(question: string): ApplicationStatus | null {
  const lower = question.toLowerCase();
  for (const status of APPLICATION_STATUSES) {
    const label = APPLICATION_STATUS_LABELS[status].toLowerCase();
    if (lower.includes(label) || lower.includes(status.toLowerCase())) return status;
  }
  if (/interview(ing|ed)?\b/.test(lower) && !/questions?/.test(lower)) return 'INTERVIEW';
  return null;
}

/** Extracts a quoted or capitalized name after a keyword, e.g. "why is Maya Chen a strong match". */
function namesIn(question: string): string[] {
  const quoted = [...question.matchAll(/["“]([^"”]+)["”]/g)].map((m) => m[1]!.trim());
  if (quoted.length) return quoted;
  const stop = new Set(['Show', 'Which', 'Why', 'Compare', 'Find', 'Generate', 'Summarize', 'List', 'Candidate', 'Candidates', 'What', 'Who', 'How', 'And', 'For', 'The', 'React', 'Node', 'AWS']);
  const matches = [...question.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g)]
    .map((m) => m[1]!)
    .map((name) => name.split(/\s+/).filter((w) => !stop.has(w)).join(' '))
    .filter((name) => name.split(' ').length >= 2);
  return [...new Set(matches)];
}

async function resolveProfile(toolbox: CopilotToolbox, name: string): Promise<CandidateProfileSummary | null> {
  const result = (await toolbox.execute('get_candidate_profile', { name })) as CandidateProfileSummary | { error: string };
  return 'error' in result ? null : result;
}

function describeSkillHits(hits: SkillCandidateHit[], skills: string[]): string {
  if (hits.length === 0) return `No candidates in your organization have ${skills.join(' and ')} on their profile.`;
  const lines = hits.map((hit) => {
    const skillText = hit.matchingSkills
      .map((s) => (s.yearsExperience ? `${s.skill} (${s.yearsExperience} yrs)` : s.skill))
      .join(', ');
    const app = hit.bestApplication
      ? ` — applied to ${hit.bestApplication.jobTitle}, ${score(hit.bestApplication.score)}`
      : '';
    return `- ${bold(hit.name)}${hit.headline ? `, ${hit.headline}` : ''}: ${skillText}${app}`;
  });
  return `Found ${hits.length} candidate${hits.length === 1 ? '' : 's'} with ${skills.join(' and ')}, ordered by combined years with those skills:\n\n${lines.join('\n')}`;
}

async function answer(input: HiringQuestionInput): Promise<string> {
  const { toolbox, question, focusJob } = input;
  const q = question.trim();
  const lower = q.toLowerCase();
  const jobId = focusJob?.id;

  // Compare A and B
  if (/\b(compare|versus|vs\.?)\b/.test(lower)) {
    const names = namesIn(q);
    const profiles = (await Promise.all(names.map((n) => resolveProfile(toolbox, n)))).filter(
      (p): p is CandidateProfileSummary => p !== null,
    );
    if (profiles.length < 2) return 'Please name at least two candidates to compare, e.g. "Compare Maya Chen and Leo Park".';
    const comparison = (await toolbox.execute('compare_candidates', {
      candidateIds: profiles.map((p) => p.candidateId),
      ...(jobId ? { jobId } : {}),
    })) as CandidateComparison;
    const rows = comparison.candidates.map((c) => {
      const scoreText = c.match ? `${c.match.overallScore}/100 for ${c.match.jobTitle}` : 'no match score';
      return `- ${bold(c.name)}: ${c.totalExperience ?? '?'} yrs experience · ${c.highestEducation ?? 'education unknown'} · ${scoreText}\n  Skills: ${c.topSkills.join(', ') || 'none listed'}${c.match?.missingSkills.length ? `\n  Missing: ${c.match.missingSkills.join(', ')}` : ''}`;
    });
    const shared = comparison.sharedSkills.length ? `\n\nShared skills: ${comparison.sharedSkills.join(', ')}.` : '';
    return `Comparison:\n\n${rows.join('\n')}${shared}`;
  }

  // Interview questions for X
  if (/interview questions?/.test(lower)) {
    const [name] = namesIn(q);
    const profile = name ? await resolveProfile(toolbox, name) : null;
    const application = profile?.applications[0];
    if (!profile || !application) return 'I could not find that candidate or an application for them. Try their full name.';
    const result = (await toolbox.execute('get_interview_questions', {
      applicationId: application.applicationId,
      generateIfMissing: true,
    })) as InterviewQuestionsResult;
    const list = result.questions.map((item, i) => `${i + 1}. _(${item.category.replace('_', ' ').toLowerCase()}, ${item.difficulty.toLowerCase()})_ ${item.question}`);
    return `Interview questions for ${bold(profile.name)} (${application.jobTitle}):\n\n${list.join('\n')}`;
  }

  // Why is X a strong match / explain match
  if (/\bwhy\b|\bexplain\b|\bmatch(ed)? for\b/.test(lower) && namesIn(q).length) {
    const [name] = namesIn(q);
    const profile = name ? await resolveProfile(toolbox, name) : null;
    if (!profile) return `I couldn't find a candidate named "${name}".`;
    const app = profile.applications.find((a) => a.match) ?? profile.applications[0];
    if (!app?.match) return `${bold(profile.name)} has no match score yet (their resume may still be processing).`;
    const parts = [
      `${bold(profile.name)} scored ${app.match.overallScore}/100 for ${app.jobTitle}.`,
      `- Skills ${app.match.skillsScore ?? '—'}, experience ${app.match.experienceScore ?? '—'}, education ${app.match.educationScore ?? '—'}, semantic fit ${app.match.semanticScore ?? '—'}`,
      ...app.match.highlights.map((h) => `- ✓ ${h}`),
      ...app.match.concerns.map((c) => `- ⚠ ${c}`),
    ];
    return parts.join('\n');
  }

  // Missing a skill
  const missing = /\b(missing|without|lack(ing)?|(don't|do not|doesn't) have|no)\s+([a-z0-9.+#/ -]{2,30}?)(\s+(experience|skills?))?[?.!]*$/i.exec(q);
  if (missing) {
    const skill = missing[4]!.trim();
    const result = (await toolbox.execute('find_candidates_missing_skill', { skill, ...(jobId ? { jobId } : {}) })) as {
      skill: string;
      candidates: Array<{ name: string; jobTitle: string; score: number | null; status: ApplicationStatus }>;
    };
    if (result.candidates.length === 0) return `Every applicant${focusJob ? ` for ${focusJob.title}` : ''} lists ${result.skill}.`;
    return `${result.candidates.length} applicant${result.candidates.length === 1 ? '' : 's'} do not list ${result.skill}:\n\n${result.candidates
      .map((c) => `- ${bold(c.name)} — ${c.jobTitle}, ${APPLICATION_STATUS_LABELS[c.status]}, ${score(c.score)}`)
      .join('\n')}`;
  }

  // Summarize a stage
  const status = statusFrom(q);
  if (status && /\b(summari[sz]e|list|show|who|which|all)\b/.test(lower)) {
    const apps = (await toolbox.execute('list_applications', { status: [status], ...(jobId ? { jobId } : {}), limit: 20 })) as ApplicationSummary[];
    if (apps.length === 0) return `There are no ${APPLICATION_STATUS_LABELS[status].toLowerCase()} candidates right now.`;
    return `${apps.length} ${APPLICATION_STATUS_LABELS[status].toLowerCase()} candidate${apps.length === 1 ? '' : 's'}:\n\n${apps
      .map((a) => `- ${bold(a.name)} — ${a.jobTitle}, ${score(a.score)}${a.matchedSkills.length ? `. Strengths: ${a.matchedSkills.slice(0, 4).join(', ')}` : ''}${a.missingSkills.length ? `. Gaps: ${a.missingSkills.slice(0, 3).join(', ')}` : ''}`)
      .join('\n')}`;
  }

  if (/\bpipeline\b|\bhow many\b|\bfunnel\b/.test(lower)) {
    const summary = (await toolbox.execute('get_pipeline_summary', jobId ? { jobId } : {})) as PipelineSummary;
    return `Pipeline${summary.jobTitle ? ` for ${summary.jobTitle}` : ''} (${summary.total} applications):\n\n${summary.stages
      .map((s) => `- ${APPLICATION_STATUS_LABELS[s.status]}: ${s.count}`)
      .join('\n')}`;
  }

  if (/\b(open(ings)?|jobs|positions|roles)\b/.test(lower) && !/candidates?/.test(lower)) {
    const jobs = (await toolbox.execute('list_jobs', {})) as JobSummary[];
    if (jobs.length === 0) return 'There are no jobs in this organization yet.';
    return jobs.map((j) => `- ${bold(j.title)} — ${j.status.toLowerCase()}, ${j.applicationCount} applications`).join('\n');
  }

  // Named skills → structured lookup
  const skills = extractKnownSkills(q).map((s) => s.name);
  if (skills.length > 0 && !/\b(similar|like|experience (building|with) (?!react|node))/i.test(lower)) {
    const strong = /\b(strong|senior|deep|extensive|expert)\b/.test(lower);
    const hits = (await toolbox.execute('find_candidates_by_skills', {
      skills,
      mode: 'all',
      ...(strong ? { minYears: 2 } : {}),
      ...(jobId ? { jobId } : {}),
      limit: 10,
    })) as SkillCandidateHit[];
    if (hits.length > 0 || !strong) return describeSkillHits(hits, skills);
    const relaxed = (await toolbox.execute('find_candidates_by_skills', { skills, mode: 'all', limit: 10 })) as SkillCandidateHit[];
    return `No candidates have 2+ years with ${skills.join(' and ')}. Candidates who list these skills:\n\n${describeSkillHits(relaxed, skills)}`;
  }

  // Open-ended → semantic search
  const hits = (await toolbox.execute('search_candidates', { query: q, ...(jobId ? { jobId } : {}), limit: 8 })) as CandidateSearchHit[];
  if (hits.length === 0) return 'No candidates matched that description.';
  return `Most relevant candidates (semantic search):\n\n${hits
    .map((h) => `- ${bold(h.name)}${h.headline ? `, ${h.headline}` : ''} — similarity ${(h.similarity * 100).toFixed(0)}%. ${h.reasons.join(' ')}`)
    .join('\n')}`;
}

export async function answerHeuristically(input: HiringQuestionInput): Promise<HiringAnswer> {
  const text = await answer(input);
  return { answer: `${text}${NOTE}`, toolsUsed: input.toolbox.used() };
}
