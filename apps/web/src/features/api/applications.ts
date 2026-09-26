import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  APPLICATION_STATUS_LABELS,
  type ApplicationDetailDto,
  type ApplicationListItemDto,
  type ApplicationNoteDto,
  type ApplicationStatus,
  type CandidateApplicationDto,
  type GenerateQuestionsInput,
  type InterviewQuestionDto,
  type MatchDto,
  type PipelineDto,
  type PipelineStage,
} from '@hireflow/shared';
import { get, getPage, patch, post, toQuery } from '@/lib/api';
import { keys } from './keys';

export interface ApplicationListParams {
  page: number;
  jobId?: string;
  status?: string[];
  search?: string;
  minScore?: string;
  sort?: string;
  order?: string;
}

export function useApplications(params: ApplicationListParams) {
  return useQuery({
    queryKey: keys.applications.list(params),
    queryFn: () =>
      getPage<ApplicationListItemDto>('/applications', toQuery({ ...params, pageSize: 20 })),
    placeholderData: keepPreviousData,
  });
}

export function useApplication(id: string | undefined) {
  return useQuery({
    queryKey: keys.applications.detail(id ?? ''),
    queryFn: () => get<ApplicationDetailDto>(`/applications/${id}`),
    enabled: !!id,
    // Poll while the resume is parsed and the match computed in the background.
    refetchInterval: (query) => (query.state.data?.matchStatus === 'PENDING' ? 3000 : false),
  });
}

export function usePipeline(jobId: string | undefined) {
  return useQuery({
    queryKey: keys.applications.pipeline(jobId),
    queryFn: () => get<PipelineDto>('/applications/pipeline', { params: toQuery({ jobId }) }),
  });
}

function useInvalidateApplications() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.applications.all });
    void qc.invalidateQueries({ queryKey: keys.jobs.all });
    void qc.invalidateQueries({ queryKey: keys.candidates.all });
    void qc.invalidateQueries({ queryKey: keys.analytics });
  };
}

interface MoveVariables {
  id: string;
  from: ApplicationStatus;
  to: PipelineStage;
  note?: string;
  jobId?: string;
}

/**
 * Kanban move with optimistic update: the card moves immediately, the server is asked to apply
 * the change (with `fromStatus` for concurrency control), and the board rolls back on failure.
 */
export function useMoveApplication() {
  const qc = useQueryClient();
  const invalidate = useInvalidateApplications();
  return useMutation({
    mutationFn: ({ id, from, to, note }: MoveVariables) =>
      patch<ApplicationDetailDto>(`/applications/${id}/status`, {
        status: to,
        fromStatus: from,
        ...(note ? { note } : {}),
      }),
    meta: { silent: true },
    onMutate: async ({ id, to, jobId }) => {
      const key = keys.applications.pipeline(jobId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<PipelineDto>(key);
      if (previous) {
        const card = previous.columns.flatMap((c) => c.cards).find((c) => c.id === id);
        if (card) {
          qc.setQueryData<PipelineDto>(key, {
            columns: previous.columns.map((column) => {
              const without = column.cards.filter((c) => c.id !== id);
              const removed = without.length !== column.cards.length;
              if (column.status === to) {
                return {
                  ...column,
                  cards: [{ ...card, status: to }, ...without],
                  total: column.total + (removed ? 0 : 1),
                };
              }
              return { ...column, cards: without, total: column.total - (removed ? 1 : 0) };
            }),
          });
        }
      }
      return { previous, key };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) qc.setQueryData(context.key, context.previous);
      toast.error(error instanceof Error ? error.message : 'Could not move the candidate');
    },
    onSuccess: (_data, { to }) => toast.success(`Moved to ${APPLICATION_STATUS_LABELS[to]}`),
    onSettled: invalidate,
  });
}

export function useAddNote(applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      post<ApplicationNoteDto>(`/applications/${applicationId}/notes`, { body }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: keys.applications.detail(applicationId) }),
  });
}

export function useRecalculateMatch(applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post<MatchDto | null>(`/applications/${applicationId}/match`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.applications.detail(applicationId) });
      toast.success('Match recalculated');
    },
  });
}

export function useGenerateQuestions(applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateQuestionsInput) =>
      post<InterviewQuestionDto[]>(`/applications/${applicationId}/interview-questions`, input),
    onSuccess: (questions) => {
      qc.setQueryData<ApplicationDetailDto>(keys.applications.detail(applicationId), (prev) =>
        prev ? { ...prev, questions } : prev,
      );
      toast.success(`Generated ${questions.length} interview questions`);
    },
  });
}

// ── Candidate side ──────────────────────────────────────────────────────────

export function useApply(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { resumeId: string; coverLetter?: string }) =>
      post<CandidateApplicationDto>(`/jobs/${jobId}/applications`, input),
    meta: { silent: true },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.me.applications });
      void qc.invalidateQueries({ queryKey: keys.me.dashboard });
      void qc.invalidateQueries({ queryKey: keys.publicJobs.all });
      toast.success('Application submitted!');
    },
  });
}

export function useMyApplications() {
  return useQuery({
    queryKey: keys.me.applications,
    queryFn: () => get<CandidateApplicationDto[]>('/applications/mine'),
  });
}

export function useMyApplication(id: string | undefined) {
  return useQuery({
    queryKey: keys.me.application(id ?? ''),
    queryFn: () => get<CandidateApplicationDto>(`/applications/mine/${id}`),
    enabled: !!id,
  });
}

export function useWithdraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => post<CandidateApplicationDto>(`/applications/mine/${id}/withdraw`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me'] });
      toast.success('Application withdrawn');
    },
  });
}
