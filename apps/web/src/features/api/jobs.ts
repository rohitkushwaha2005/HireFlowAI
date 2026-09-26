import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  ApplicationListItemDto,
  AuthConfigDto,
  CreateJobInput,
  JobAnalysis,
  JobDetailDto,
  JobSummaryDto,
  JobTransition,
  PublicJobDetailDto,
  PublicJobDto,
  UpdateJobInput,
} from '@hireflow/shared';
import { del, get, getPage, patch, post, toQuery } from '@/lib/api';
import { keys } from './keys';

export interface JobListParams {
  page: number;
  pageSize?: number;
  search?: string;
  status?: string[];
  sort?: string;
  order?: 'asc' | 'desc';
}

export function useAuthConfig() {
  return useQuery({ queryKey: keys.authConfig, queryFn: () => get<AuthConfigDto>('/auth/config'), staleTime: Infinity });
}

export function useJobs(params: JobListParams) {
  return useQuery({
    queryKey: keys.jobs.list(params),
    queryFn: () => getPage<JobSummaryDto>('/jobs', toQuery({ ...params })),
    placeholderData: keepPreviousData,
  });
}

export function useJob(id: string | undefined) {
  return useQuery({ queryKey: keys.jobs.detail(id ?? ''), queryFn: () => get<JobDetailDto>(`/jobs/${id}`), enabled: !!id });
}

export function useJobApplications(jobId: string, params: { page: number; sort?: string; order?: string; status?: string[]; search?: string }) {
  return useQuery({
    queryKey: keys.jobs.applications(jobId, params),
    queryFn: () => getPage<ApplicationListItemDto>(`/jobs/${jobId}/applications`, toQuery({ ...params })),
    placeholderData: keepPreviousData,
  });
}

function useInvalidateJobs() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.jobs.all });
    void qc.invalidateQueries({ queryKey: keys.publicJobs.all });
    void qc.invalidateQueries({ queryKey: keys.analytics });
  };
}

export function useCreateJob() {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: (input: CreateJobInput) => post<JobDetailDto>('/jobs', input),
    meta: { silent: true },
    onSuccess: () => {
      invalidate();
      toast.success('Job saved as draft');
    },
  });
}

export function useUpdateJob(id: string) {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: (input: UpdateJobInput) => patch<JobDetailDto>(`/jobs/${id}`, input),
    meta: { silent: true },
    onSuccess: () => {
      invalidate();
      toast.success('Job updated');
    },
  });
}

const TRANSITION_MESSAGES: Record<JobTransition, string> = {
  publish: 'Job published — it is now live on the job board',
  pause: 'Job paused',
  close: 'Job closed',
  reopen: 'Job reopened',
};

export function useJobTransition() {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: JobTransition }) => post<JobDetailDto>(`/jobs/${id}/${action}`),
    onSuccess: (_job, { action }) => {
      invalidate();
      toast.success(TRANSITION_MESSAGES[action]);
    },
  });
}

export function useDuplicateJob() {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: (id: string) => post<JobDetailDto>(`/jobs/${id}/duplicate`),
    onSuccess: () => {
      invalidate();
      toast.success('Job duplicated as a draft');
    },
  });
}

export function useDeleteJob() {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: (id: string) => del(`/jobs/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success('Job deleted');
    },
  });
}

export interface JobAnalysisResult {
  analysis: JobAnalysis;
  provider: string;
  isHeuristic: boolean;
}

export function useAnalyzeJob() {
  return useMutation({
    mutationFn: (input: { title: string; description: string }) => post<JobAnalysisResult>('/jobs/analyze', input),
  });
}

// ── Public board ────────────────────────────────────────────────────────────

export interface PublicJobParams {
  page: number;
  search?: string;
  location?: string;
  remoteType?: string[];
  employmentType?: string[];
  experienceLevel?: string[];
}

export function usePublicJobs(params: PublicJobParams) {
  return useQuery({
    queryKey: keys.publicJobs.list(params),
    queryFn: () => getPage<PublicJobDto>('/public/jobs', toQuery({ ...params, pageSize: 12 })),
    placeholderData: keepPreviousData,
  });
}

export function usePublicJob(slug: string | undefined) {
  return useQuery({
    queryKey: keys.publicJobs.detail(slug ?? ''),
    queryFn: () => get<PublicJobDetailDto>(`/public/jobs/${slug}`),
    enabled: !!slug,
  });
}
