import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  CandidateDashboardDto,
  CandidateDetailDto,
  CandidateListItemDto,
  CandidateProfileDto,
  ReplaceEducationInput,
  ReplaceExperienceInput,
  ReplaceSkillsInput,
  ResumeDto,
  UpdateCandidateProfileInput,
} from '@hireflow/shared';
import { del, get, getPage, http, patch, post, put, toApiError, toQuery } from '@/lib/api';
import { keys } from './keys';

export interface CandidateSearchParams {
  page: number;
  q?: string;
  skills?: string[];
  minExperience?: string;
  status?: string[];
  jobId?: string;
  sort?: string;
}

export function useCandidateSearch(params: CandidateSearchParams) {
  return useQuery({
    queryKey: keys.candidates.search(params),
    queryFn: () =>
      getPage<CandidateListItemDto>('/candidates', toQuery({ ...params, pageSize: 15 })),
    placeholderData: keepPreviousData,
  });
}

export function useCandidate(id: string | undefined) {
  return useQuery({
    queryKey: keys.candidates.detail(id ?? ''),
    queryFn: () => get<CandidateDetailDto>(`/candidates/${id}`),
    enabled: !!id,
  });
}

// ── Candidate self-service ──────────────────────────────────────────────────

const isProcessing = (resumes: ResumeDto[] | undefined) =>
  resumes?.some((r) => r.parsingStatus === 'PENDING' || r.parsingStatus === 'PROCESSING') ?? false;

export function useMyProfile() {
  return useQuery({
    queryKey: keys.me.profile,
    queryFn: () => get<CandidateProfileDto>('/candidates/me'),
    // While a resume is being parsed the profile is about to change; poll until done.
    refetchInterval: (query) => (isProcessing(query.state.data?.resumes) ? 2500 : false),
  });
}

export function useCandidateDashboard() {
  return useQuery({
    queryKey: keys.me.dashboard,
    queryFn: () => get<CandidateDashboardDto>('/candidates/me/dashboard'),
    refetchInterval: (query) => {
      const status = query.state.data?.primaryResume?.parsingStatus;
      return status === 'PENDING' || status === 'PROCESSING' ? 2500 : false;
    },
  });
}

function useProfileMutation<TInput>(
  fn: (input: TInput) => Promise<CandidateProfileDto>,
  message: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    meta: { silent: true },
    onSuccess: (profile) => {
      qc.setQueryData(keys.me.profile, profile);
      void qc.invalidateQueries({ queryKey: keys.me.dashboard });
      toast.success(message);
    },
  });
}

export const useUpdateProfile = () =>
  useProfileMutation(
    (input: UpdateCandidateProfileInput) => patch<CandidateProfileDto>('/candidates/me', input),
    'Profile saved',
  );
export const useReplaceSkills = () =>
  useProfileMutation(
    (input: ReplaceSkillsInput) => put<CandidateProfileDto>('/candidates/me/skills', input),
    'Skills saved',
  );
export const useReplaceExperience = () =>
  useProfileMutation(
    (input: ReplaceExperienceInput) => put<CandidateProfileDto>('/candidates/me/experience', input),
    'Experience saved',
  );
export const useReplaceEducation = () =>
  useProfileMutation(
    (input: ReplaceEducationInput) => put<CandidateProfileDto>('/candidates/me/education', input),
    'Education saved',
  );

// ── Resumes ─────────────────────────────────────────────────────────────────

export function useMyResumes() {
  return useQuery({
    queryKey: keys.me.resumes,
    queryFn: () => get<ResumeDto[]>('/resumes'),
    refetchInterval: (query) => (isProcessing(query.state.data) ? 2000 : false),
  });
}

function useInvalidateResumes() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.me.resumes });
    void qc.invalidateQueries({ queryKey: keys.me.profile });
    void qc.invalidateQueries({ queryKey: keys.me.dashboard });
  };
}

export function useUploadResume() {
  const invalidate = useInvalidateResumes();
  return useMutation({
    mutationFn: async ({
      file,
      onProgress,
    }: {
      file: File;
      onProgress?: (percent: number) => void;
    }) => {
      const form = new FormData();
      form.append('file', file);
      const res = await http.post<{ data: ResumeDto }>('/resumes/upload', form, {
        onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
      });
      return res.data.data;
    },
    meta: { silent: true },
    onSuccess: () => {
      invalidate();
      toast.success('Resume uploaded — extracting your profile…');
    },
  });
}

export function useRetryResume() {
  const invalidate = useInvalidateResumes();
  return useMutation({
    mutationFn: (id: string) => post<ResumeDto>(`/resumes/${id}/retry`),
    onSuccess: invalidate,
  });
}

export function useSetPrimaryResume() {
  const invalidate = useInvalidateResumes();
  return useMutation({
    mutationFn: (id: string) => post<ResumeDto>(`/resumes/${id}/primary`),
    onSuccess: () => {
      invalidate();
      toast.success('Primary resume updated');
    },
  });
}

export function useDeleteResume() {
  const invalidate = useInvalidateResumes();
  return useMutation({
    mutationFn: (id: string) => del(`/resumes/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success('Resume deleted');
    },
  });
}

/** Fetches the PDF with credentials and opens it in a new tab (links cannot carry the bearer token). */
export async function openResume(id: string): Promise<void> {
  const win = window.open('', '_blank');
  try {
    const res = await http.get<Blob>(`/resumes/${id}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    if (win) win.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    win?.close();
    toast.error(toApiError(error).message);
  }
}
