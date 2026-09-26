/** Centralized TanStack Query keys so invalidation stays consistent across features. */
export const keys = {
  authConfig: ['auth-config'] as const,
  jobs: {
    all: ['jobs'] as const,
    list: (query: object) => ['jobs', 'list', query] as const,
    detail: (id: string) => ['jobs', 'detail', id] as const,
    applications: (id: string, query: object) =>
      ['jobs', 'detail', id, 'applications', query] as const,
  },
  publicJobs: {
    all: ['public-jobs'] as const,
    list: (query: object) => ['public-jobs', 'list', query] as const,
    detail: (slug: string) => ['public-jobs', 'detail', slug] as const,
  },
  candidates: {
    all: ['candidates'] as const,
    search: (query: object) => ['candidates', 'search', query] as const,
    detail: (id: string) => ['candidates', 'detail', id] as const,
  },
  me: {
    profile: ['me', 'profile'] as const,
    dashboard: ['me', 'dashboard'] as const,
    resumes: ['me', 'resumes'] as const,
    applications: ['me', 'applications'] as const,
    application: (id: string) => ['me', 'applications', id] as const,
    interviews: ['me', 'interviews'] as const,
  },
  applications: {
    all: ['applications'] as const,
    list: (query: object) => ['applications', 'list', query] as const,
    detail: (id: string) => ['applications', 'detail', id] as const,
    pipeline: (jobId: string | undefined) => ['applications', 'pipeline', jobId ?? 'all'] as const,
    questions: (id: string) => ['applications', 'detail', id, 'questions'] as const,
  },
  interviews: {
    all: ['interviews'] as const,
    list: (query: object) => ['interviews', 'list', query] as const,
  },
  org: {
    current: ['org', 'current'] as const,
    members: ['org', 'members'] as const,
    audit: (query: object) => ['org', 'audit', query] as const,
  },
  copilot: {
    conversations: ['copilot', 'conversations'] as const,
    messages: (id: string) => ['copilot', 'messages', id] as const,
  },
  analytics: ['analytics', 'dashboard'] as const,
};
