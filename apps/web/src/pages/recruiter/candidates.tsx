import { Sparkles, UsersRound } from 'lucide-react';
import { Link } from 'react-router';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUSES,
  type CandidateListItemDto,
} from '@hireflow/shared';
import {
  AIDisclaimer,
  EmptyState,
  ErrorState,
  FilterPanel,
  ListSkeleton,
  PageHeader,
  Pagination,
  SearchInput,
} from '@/components/common';
import { ApplicationStatusBadge, ScoreBadge, SkillChips } from '@/components/domain';
import { Avatar, Badge, Card, Input, Label, Select, Tooltip } from '@/components/ui';
import { useCandidateSearch } from '@/features/api/candidates';
import { useJobs } from '@/features/api/jobs';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useSearchParamsState } from '@/hooks/use-search-params-state';
import { cn, formatYears, initialsOf } from '@/lib/utils';

const DEFAULTS = {
  q: '',
  skills: '',
  minExperience: '',
  status: [] as string[],
  jobId: 'all',
  sort: 'relevance',
  page: 1,
};
const STATUS_FILTER = [
  {
    key: 'status',
    label: 'Application stage',
    options: APPLICATION_STATUSES.map((s) => ({ value: s, label: APPLICATION_STATUS_LABELS[s] })),
  },
];
const EXAMPLES = [
  'React developer with strong backend experience and real-time applications',
  'Built RAG systems with LLMs',
  'Kubernetes and infrastructure automation',
];

function CandidateRow({
  candidate,
  semantic,
}: {
  candidate: CandidateListItemDto;
  semantic: boolean;
}) {
  return (
    <Link
      to={`/app/candidates/${candidate.id}`}
      className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-start"
    >
      <Avatar fallback={initialsOf(candidate.firstName, candidate.lastName)} className="size-10" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">
            {candidate.firstName} {candidate.lastName}
          </p>
          {semantic && candidate.similarity !== null && (
            <Tooltip content="Semantic similarity between your query and the candidate’s profile/resume">
              <Badge variant="default" className="cursor-default">
                <Sparkles /> {Math.round(candidate.similarity * 100)}% relevant
              </Badge>
            </Tooltip>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {candidate.headline ?? 'No headline'} · {formatYears(candidate.totalExperience)}{' '}
          experience{candidate.location ? ` · ${candidate.location}` : ''}
        </p>
        {candidate.topSkills.length > 0 && <SkillChips skills={candidate.topSkills} max={6} />}
        {semantic && candidate.matchReasons.length > 0 && (
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {candidate.matchReasons.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        )}
      </div>
      {candidate.latestApplication && (
        <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
          <p className="max-w-48 truncate text-xs text-muted-foreground">
            {candidate.latestApplication.jobTitle}
          </p>
          <div className="flex items-center gap-2">
            <ApplicationStatusBadge status={candidate.latestApplication.status} />
            <ScoreBadge score={candidate.latestApplication.overallScore} />
          </div>
        </div>
      )}
    </Link>
  );
}

export default function CandidatesPage() {
  useDocumentTitle('Candidates');
  const [state, update] = useSearchParamsState(DEFAULTS);
  const jobs = useJobs({ page: 1, pageSize: 100 });
  const { data, isLoading, isError, error, refetch, isFetching } = useCandidateSearch({
    page: state.page,
    ...(state.q ? { q: state.q } : {}),
    skills: state.skills
      ? state.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    ...(state.minExperience ? { minExperience: state.minExperience } : {}),
    status: state.status,
    ...(state.jobId !== 'all' ? { jobId: state.jobId } : {}),
    sort: state.sort,
  });
  const semantic = !!state.q;

  return (
    <div>
      <PageHeader
        title="Candidates"
        description="Describe who you’re looking for — semantic search finds relevant people even when the exact keywords differ."
      />
      <Card className="mb-4 space-y-4 p-4">
        <SearchInput
          value={state.q}
          onChange={(q) => update({ q })}
          delayMs={500}
          label="Semantic candidate search"
          placeholder="e.g. React developer with strong backend experience and real-time applications"
        />
        {!state.q && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Try:
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => update({ q: ex })}
                className="rounded-full border px-2.5 py-1 hover:bg-muted hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-[1fr_140px_220px_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="skills">Must have skills</Label>
            <Input
              id="skills"
              placeholder="React, Node.js"
              defaultValue={state.skills}
              onBlur={(e) => update({ skills: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && update({ skills: e.currentTarget.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="minExperience">Min. years</Label>
            <Input
              id="minExperience"
              type="number"
              min={0}
              max={40}
              defaultValue={state.minExperience}
              onBlur={(e) => update({ minExperience: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="job-filter">Applied to</Label>
            <Select
              id="job-filter"
              value={state.jobId}
              onValueChange={(jobId) => update({ jobId })}
              options={[
                { value: 'all', label: 'Any job' },
                ...(jobs.data?.items ?? []).map((j) => ({ value: j.id, label: j.title })),
              ]}
            />
          </div>
          <div className="flex items-end">
            <FilterPanel
              groups={STATUS_FILTER}
              values={{ status: state.status }}
              onChange={(_k, status) => update({ status })}
            />
          </div>
        </div>
        {!semantic && (
          <div className="flex items-center gap-2">
            <Label htmlFor="sort" className="text-xs text-muted-foreground">
              Sort
            </Label>
            <Select
              id="sort"
              className="w-48"
              value={state.sort}
              onValueChange={(sort) => update({ sort })}
              options={[
                { value: 'relevance', label: 'Most recent' },
                { value: 'experience', label: 'Most experience' },
                { value: 'name', label: 'Name' },
              ]}
            />
          </div>
        )}
      </Card>

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !data?.items.length ? (
        <EmptyState
          icon={UsersRound}
          title="No candidates found"
          description="Candidates appear once they apply to one of your jobs. Try broadening the search or removing filters."
        />
      ) : (
        <Card className={cn('divide-y overflow-hidden', isFetching && 'opacity-70')}>
          {semantic && (
            <p className="bg-accent/40 px-4 py-2 text-xs text-accent-foreground">
              <Sparkles className="mr-1 inline size-3.5" /> Ranked by semantic similarity to “
              {state.q}”
            </p>
          )}
          {data.items.map((candidate) => (
            <CandidateRow key={candidate.id} candidate={candidate} semantic={semantic} />
          ))}
        </Card>
      )}
      <Pagination pagination={data?.pagination} onPageChange={(page) => update({ page })} />
      <AIDisclaimer compact className="mt-6" />
    </div>
  );
}
