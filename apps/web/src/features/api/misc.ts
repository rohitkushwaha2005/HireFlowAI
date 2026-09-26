import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  AuditLogDto,
  CandidateInterviewDto,
  CopilotAnswer,
  CopilotChatInput,
  CopilotConversationDto,
  CopilotMessageDto,
  CreateInterviewInput,
  DashboardAnalyticsDto,
  InterviewDto,
  InviteMemberInput,
  MemberDto,
  OrganizationDto,
  UpdateInterviewInput,
  UpdateMemberRoleInput,
  UpdateOrganizationInput,
} from '@hireflow/shared';
import { del, get, getPage, patch, post, toQuery } from '@/lib/api';
import { keys } from './keys';

// ── Interviews ──────────────────────────────────────────────────────────────

export function useInterviews(params: {
  page: number;
  status?: string[];
  upcoming?: boolean;
  mine?: boolean;
}) {
  return useQuery({
    queryKey: keys.interviews.list(params),
    queryFn: () => getPage<InterviewDto>('/interviews', toQuery({ ...params, pageSize: 20 })),
    placeholderData: keepPreviousData,
  });
}

function useInvalidateInterviews() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.interviews.all });
    void qc.invalidateQueries({ queryKey: keys.applications.all });
    void qc.invalidateQueries({ queryKey: keys.analytics });
  };
}

export function useCreateInterview() {
  const invalidate = useInvalidateInterviews();
  return useMutation({
    mutationFn: (input: CreateInterviewInput) => post<InterviewDto>('/interviews', input),
    meta: { silent: true },
    onSuccess: () => {
      invalidate();
      toast.success('Interview scheduled — the candidate has been notified');
    },
  });
}

export function useUpdateInterview() {
  const invalidate = useInvalidateInterviews();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateInterviewInput & { id: string }) =>
      patch<InterviewDto>(`/interviews/${id}`, input),
    onSuccess: () => {
      invalidate();
      toast.success('Interview updated');
    },
  });
}

export function useMyInterviews() {
  return useQuery({
    queryKey: keys.me.interviews,
    queryFn: () => get<CandidateInterviewDto[]>('/interviews/mine'),
  });
}

// ── Organization / team ─────────────────────────────────────────────────────

export function useOrganization() {
  return useQuery({
    queryKey: keys.org.current,
    queryFn: () => get<OrganizationDto>('/organizations/current'),
  });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateOrganizationInput) =>
      patch<OrganizationDto>('/organizations/current', input),
    onSuccess: (org) => {
      qc.setQueryData(keys.org.current, org);
      toast.success('Organization settings saved');
    },
  });
}

export function useMembers() {
  return useQuery({
    queryKey: keys.org.members,
    queryFn: () => get<MemberDto[]>('/organizations/current/members'),
  });
}

export function useInviteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteMemberInput) =>
      post<MemberDto>('/organizations/current/members', input),
    meta: { silent: true },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.org.members });
      toast.success('Invitation sent');
    },
  });
}

export function useUpdateMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateMemberRoleInput & { id: string }) =>
      patch(`/organizations/current/members/${id}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.org.members });
      toast.success('Role updated');
    },
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/organizations/current/members/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.org.members });
      toast.success('Member removed');
    },
  });
}

export function useAuditLogs(
  params: { entityType?: string; entityId?: string; limit?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: keys.org.audit(params),
    queryFn: () =>
      get<AuditLogDto[]>('/organizations/current/audit-logs', { params: toQuery(params) }),
    enabled,
  });
}

// ── Copilot ─────────────────────────────────────────────────────────────────

export function useConversations() {
  return useQuery({
    queryKey: keys.copilot.conversations,
    queryFn: () => get<CopilotConversationDto[]>('/copilot/conversations'),
  });
}

export function useConversationMessages(id: string | null) {
  return useQuery({
    queryKey: keys.copilot.messages(id ?? ''),
    queryFn: () => get<CopilotMessageDto[]>(`/copilot/conversations/${id}/messages`),
    enabled: !!id,
  });
}

export function useCopilotChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CopilotChatInput) => post<CopilotAnswer>('/copilot/chat', input),
    onSuccess: (answer) => {
      void qc.invalidateQueries({ queryKey: keys.copilot.conversations });
      void qc.invalidateQueries({ queryKey: keys.copilot.messages(answer.conversationId) });
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del(`/copilot/conversations/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.copilot.conversations }),
  });
}

// ── Analytics ───────────────────────────────────────────────────────────────

export function useDashboard() {
  return useQuery({
    queryKey: keys.analytics,
    queryFn: () => get<DashboardAnalyticsDto>('/analytics/dashboard'),
  });
}
