/**
 * Builders for the text that gets embedded. This is the single choke point that decides what
 * candidate information can influence semantic similarity.
 *
 * Deliberately EXCLUDED: name, email, phone, location/address, links, photo, date of birth,
 * gender, nationality, and any other personal attribute. Institution names are excluded too,
 * because institution prestige correlates with socioeconomic background; only degree and field are
 * used.
 */

export interface CandidateEmbeddingSource {
  headline?: string | null;
  summary?: string | null;
  currentRole?: string | null;
  skills: readonly string[];
  experiences: ReadonlyArray<{ title: string; company?: string | null; description?: string | null }>;
  education: ReadonlyArray<{ degree?: string | null; field?: string | null }>;
  projects: ReadonlyArray<{ name: string; description?: string | null; technologies?: readonly string[] }>;
  certifications: readonly string[];
}

export function buildCandidateEmbeddingText(source: CandidateEmbeddingSource): string {
  const lines: string[] = [];
  if (source.headline) lines.push(source.headline);
  if (source.currentRole) lines.push(`Current role: ${source.currentRole}`);
  if (source.summary) lines.push(source.summary);
  if (source.skills.length) lines.push(`Skills: ${source.skills.join(', ')}`);
  for (const exp of source.experiences) {
    // Company names are kept: they describe the domain of the work, not the person.
    const header = exp.company ? `${exp.title} at ${exp.company}` : exp.title;
    lines.push(exp.description ? `${header}: ${exp.description}` : header);
  }
  for (const project of source.projects) {
    const tech = project.technologies?.length ? ` (${project.technologies.join(', ')})` : '';
    lines.push(`Project ${project.name}${tech}${project.description ? `: ${project.description}` : ''}`);
  }
  for (const edu of source.education) {
    const text = [edu.degree, edu.field].filter(Boolean).join(' in ');
    if (text) lines.push(`Education: ${text}`);
  }
  if (source.certifications.length) lines.push(`Certifications: ${source.certifications.join(', ')}`);
  return lines.join('\n').trim();
}

export interface JobEmbeddingSource {
  title: string;
  description: string;
  responsibilities?: readonly string[];
  requirements: ReadonlyArray<{ skill: string; required: boolean }>;
}

export function buildJobEmbeddingText(source: JobEmbeddingSource): string {
  const lines = [source.title, source.description];
  if (source.responsibilities?.length) {
    lines.push(`Responsibilities: ${source.responsibilities.join('; ')}`);
  }
  if (source.requirements.length) lines.push(buildJobRequirementsText(source.requirements));
  return lines.join('\n').trim();
}

export function buildJobRequirementsText(
  requirements: ReadonlyArray<{ skill: string; required: boolean }>,
): string {
  const required = requirements.filter((r) => r.required).map((r) => r.skill);
  const preferred = requirements.filter((r) => !r.required).map((r) => r.skill);
  const parts: string[] = [];
  if (required.length) parts.push(`Required skills: ${required.join(', ')}`);
  if (preferred.length) parts.push(`Preferred skills: ${preferred.join(', ')}`);
  return parts.join('\n');
}
