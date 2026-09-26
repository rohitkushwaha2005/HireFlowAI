import type { RequirementCategory } from '../enums';
import { SKILL_TAXONOMY, type SkillDefinition } from './taxonomy';

export interface NormalizedSkill {
  /** Stable canonical id used for matching and storage (`CandidateSkill.normalizedSkill`). */
  key: string;
  /** Display name: taxonomy name when known, otherwise the cleaned input. */
  name: string;
  category: RequirementCategory;
  /** Whether the skill exists in the curated taxonomy. */
  known: boolean;
}

/**
 * Lookup key for a raw skill string: lowercase, trimmed, with whitespace, dots, hyphens and
 * underscores removed. Symbols that carry meaning (`+`, `#`, `/`) are preserved so that
 * "C++", "C#" and "CI/CD" stay distinct.
 */
export function skillKey(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/\(.*?\)/g, '')
    .replace(/[\s._-]+/g, '');
}

const ALIAS_INDEX: ReadonlyMap<string, string> = buildAliasIndex(SKILL_TAXONOMY);

function buildAliasIndex(taxonomy: Record<string, SkillDefinition>): Map<string, string> {
  const index = new Map<string, string>();
  for (const [id, def] of Object.entries(taxonomy)) {
    index.set(id, id);
    index.set(skillKey(def.name), id);
    for (const alias of def.aliases ?? []) index.set(skillKey(alias), id);
  }
  return index;
}

/** Resolves a key to its canonical taxonomy id, stripping a trailing "js" as a fallback ("vuejs"). */
function resolveCanonicalId(key: string): string | undefined {
  const direct = ALIAS_INDEX.get(key);
  if (direct) return direct;
  if (key.endsWith('js') && key.length > 3) return ALIAS_INDEX.get(key.slice(0, -2));
  return undefined;
}

function cleanDisplay(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function normalizeSkill(raw: string): NormalizedSkill | null {
  const display = cleanDisplay(raw);
  const key = skillKey(display);
  if (!key || key.length > 60) return null;

  const id = resolveCanonicalId(key);
  if (id) {
    const def = SKILL_TAXONOMY[id];
    if (def) return { key: id, name: def.name, category: def.category, known: true };
  }
  return { key, name: display, category: 'OTHER', known: false };
}

/** Normalizes and de-duplicates a list of skills, keeping first-seen order. */
export function normalizeSkills(raw: readonly string[]): NormalizedSkill[] {
  const seen = new Set<string>();
  const result: NormalizedSkill[] = [];
  for (const item of raw) {
    const normalized = normalizeSkill(item);
    if (normalized && !seen.has(normalized.key)) {
      seen.add(normalized.key);
      result.push(normalized);
    }
  }
  return result;
}

/** True when two canonical keys are declared related (in either direction). */
export function areSkillsRelated(a: string, b: string): boolean {
  if (a === b) return false;
  return (
    (SKILL_TAXONOMY[a]?.related?.includes(b) ?? false) ||
    (SKILL_TAXONOMY[b]?.related?.includes(a) ?? false)
  );
}

export function skillDisplayName(key: string): string {
  return SKILL_TAXONOMY[key]?.name ?? key;
}

/**
 * Finds taxonomy skills mentioned in free text. Used by the heuristic AI provider and to enrich
 * search. Matching is on word boundaries against names and aliases (min length 2 to avoid noise).
 */
export function extractKnownSkills(text: string): NormalizedSkill[] {
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9+#/.\s-]/g, ' ')} `;
  const original = ` ${text.replace(/[^A-Za-z0-9+#/.\s-]/g, ' ')} `;
  const found = new Map<string, NormalizedSkill>();

  for (const [id, def] of Object.entries(SKILL_TAXONOMY)) {
    const candidates = [def.name, ...(def.aliases ?? [])];
    for (const candidate of candidates) {
      const needle = candidate.toLowerCase();
      if (needle.length < 2 || NEVER_IN_FREE_TEXT.has(needle)) continue;
      const matched = AMBIGUOUS_TERMS.has(needle)
        ? // Ambiguous English words count only when capitalized like the technology ("Express", "Swift").
          containsTerm(original, needle.charAt(0).toUpperCase() + needle.slice(1))
        : containsTerm(haystack, needle);
      if (matched) {
        found.set(id, { key: id, name: def.name, category: def.category, known: true });
        break;
      }
    }
  }
  return [...found.values()];
}

/** Terms never detected in free text (too short or too generic); fine as explicit skill entries. */
const NEVER_IN_FREE_TEXT = new Set([
  'c',
  'go',
  'r',
  'ts',
  'js',
  'py',
  'tf',
  'cv',
  'ml',
  'dl',
  'ws',
  'rest',
  'next',
  'nest',
  'shell',
  'elastic',
  'torch',
  'kanban',
  'lambda',
  'containers',
  'monitoring',
  'performance',
  'security',
  'testing',
  'communication',
  'leadership',
  'collaboration',
  'teamwork',
  'mentoring',
  'unix',
  'rtk',
]);

/** Common English words that are also technologies; matched only with canonical capitalization. */
const AMBIGUOUS_TERMS = new Set(['node', 'express', 'spring', 'swift', 'rails', 'flask', 'figma', 'redux', 'vite', 'jest']);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(haystack: string, needle: string): boolean {
  const pattern = new RegExp(`(^|[^a-z0-9+#])${escapeRegExp(needle)}(?=$|[^a-z0-9+#])`);
  return pattern.test(haystack);
}
