import { Bot, MessageSquarePlus, Send, Sparkles, Trash2, Wrench } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router';
import type { CopilotMessageDto } from '@hireflow/shared';
import { AIDisclaimer, PageHeader } from '@/components/common';
import { ScoreBadge } from '@/components/domain';
import { Markdown } from '@/components/markdown';
import { Button, Card, Select, Skeleton, Textarea } from '@/components/ui';
import { useJobs } from '@/features/api/jobs';
import { useConversationMessages, useConversations, useCopilotChat, useDeleteConversation } from '@/features/api/misc';
import { RequirePermission } from '@/features/auth/guards';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { cn, timeAgo } from '@/lib/utils';

const SUGGESTIONS = [
  'Which candidates have strong React and Node.js experience?',
  'Which candidates are missing AWS?',
  'Find candidates with experience building real-time applications',
  'Summarize all shortlisted candidates',
  "Compare Liam O'Connor and Grace Mensah",
  'Generate interview questions for Arjun Mehta',
];

const TOOL_LABELS: Record<string, string> = {
  search_candidates: 'semantic search',
  find_candidates_by_skills: 'skill lookup',
  find_candidates_missing_skill: 'missing-skill lookup',
  get_candidate_profile: 'candidate profile',
  compare_candidates: 'comparison',
  list_applications: 'applications',
  list_jobs: 'jobs',
  get_pipeline_summary: 'pipeline',
  get_interview_questions: 'interview questions',
};

function Message({ message }: { message: CopilotMessageDto }) {
  const user = message.role === 'USER';
  return (
    <div className={cn('flex gap-3', user && 'flex-row-reverse')}>
      <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', user ? 'bg-muted' : 'bg-primary text-primary-foreground')}>
        {user ? <span className="text-xs font-semibold">You</span> : <Bot className="size-4" />}
      </div>
      <div className={cn('max-w-[85%] space-y-2 rounded-2xl px-4 py-3', user ? 'bg-primary text-primary-foreground' : 'border bg-card')}>
        {user ? <p className="whitespace-pre-wrap text-sm">{message.content}</p> : <Markdown content={message.content} />}
        {!user && message.references.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t pt-2">
            {message.references.map((ref) => (
              <Link
                key={ref.candidateId}
                to={ref.applicationId ? `/app/applications/${ref.applicationId}` : `/app/candidates/${ref.candidateId}`}
                className="flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs hover:border-primary"
              >
                {ref.name} <ScoreBadge score={ref.score} className="px-1.5 py-0" />
              </Link>
            ))}
          </div>
        )}
        {!user && message.toolsUsed.length > 0 && (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Wrench className="size-3" /> Grounded in: {message.toolsUsed.map((t) => TOOL_LABELS[t] ?? t).join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}

function CopilotChat() {
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');
  const [jobId, setJobId] = React.useState('all');
  const [pending, setPending] = React.useState<string | null>(null);
  const conversations = useConversations();
  const messages = useConversationMessages(conversationId);
  const chat = useCopilotChat();
  const remove = useDeleteConversation();
  const jobs = useJobs({ page: 1, pageSize: 100, status: ['PUBLISHED', 'PAUSED'] });
  const bottomRef = React.useRef<HTMLDivElement>(null);

  const list = messages.data ?? [];
  // Scroll the message pane (not the page) to the newest message.
  React.useEffect(() => {
    const pane = bottomRef.current?.parentElement;
    if (pane) pane.scrollTo({ top: pane.scrollHeight, behavior: 'smooth' });
  }, [list.length, pending]);

  const send = (text: string) => {
    const message = text.trim();
    if (!message || chat.isPending) return;
    setDraft('');
    setPending(message);
    chat.mutate(
      { message, ...(conversationId ? { conversationId } : {}), ...(jobId !== 'all' ? { jobId } : {}) },
      {
        onSuccess: (answer) => setConversationId(answer.conversationId),
        onError: () => setDraft(message),
        onSettled: () => setPending(null),
      },
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card className="hidden h-[calc(100vh-13rem)] flex-col overflow-hidden lg:flex">
        <div className="border-b p-3">
          <Button variant="outline" className="w-full" onClick={() => setConversationId(null)}>
            <MessageSquarePlus /> New conversation
          </Button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {conversations.isLoading && <Skeleton className="h-20" />}
          {conversations.data?.length === 0 && <p className="p-3 text-xs text-muted-foreground">Your conversations will appear here.</p>}
          {conversations.data?.map((c) => (
            <div key={c.id} className={cn('group flex items-center rounded-lg', c.id === conversationId ? 'bg-accent' : 'hover:bg-muted')}>
              <button className="min-w-0 flex-1 px-3 py-2 text-left" onClick={() => setConversationId(c.id)}>
                <p className="truncate text-sm">{c.title}</p>
                <p className="text-xs text-muted-foreground">{timeAgo(c.updatedAt)}</p>
              </button>
              <button
                className="mr-1 rounded p-1.5 text-muted-foreground opacity-0 hover:bg-background hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                aria-label={`Delete conversation ${c.title}`}
                onClick={() => remove.mutate(c.id, { onSuccess: () => c.id === conversationId && setConversationId(null) })}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex h-[calc(100vh-13rem)] min-h-[480px] flex-col overflow-hidden">
        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6" aria-live="polite">
          {list.length === 0 && !pending ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground"><Sparkles className="size-6" /></span>
              <div>
                <h2 className="text-lg font-semibold">Ask about your candidates</h2>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">The copilot answers only from your organization’s data, using search and database tools. It never invents candidates or facts.</p>
              </div>
              <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-lg border p-3 text-left text-sm hover:border-primary hover:bg-accent/40">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {list.map((m) => <Message key={m.id} message={m} />)}
              {pending && !list.some((m) => m.role === 'USER' && m.content === pending && list.indexOf(m) === list.length - 1) && (
                <>
                  <Message message={{ id: 'pending', role: 'USER', content: pending, references: [], toolsUsed: [], createdAt: '' }} />
                  <div className="flex gap-3">
                    <div className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"><Bot className="size-4" /></div>
                    <div className="flex items-center gap-1.5 rounded-2xl border bg-card px-4 py-3" role="status" aria-label="Copilot is thinking">
                      {[0, 150, 300].map((d) => <span key={d} className="size-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${d}ms` }} />)}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>
        <form
          className="space-y-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <div className="flex items-end gap-2">
            <Textarea
              aria-label="Ask the copilot"
              rows={2}
              className="min-h-11 resize-none"
              placeholder="Ask about candidates, skills, comparisons, pipeline…"
              value={draft}
              maxLength={2000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
            />
            <Button type="submit" size="icon" className="size-11" loading={chat.isPending} disabled={!draft.trim()} aria-label="Send">
              {!chat.isPending && <Send />}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Select
              aria-label="Focus on a job"
              className="h-8 w-56 text-xs"
              value={jobId}
              onValueChange={setJobId}
              options={[{ value: 'all', label: 'All jobs' }, ...(jobs.data?.items ?? []).map((j) => ({ value: j.id, label: j.title }))]}
            />
            <p className="text-[11px] text-muted-foreground">Enter to send · Shift+Enter for a new line</p>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function CopilotPage() {
  useDocumentTitle('AI Copilot');
  return (
    <div>
      <PageHeader title="AI Hiring Copilot" description="Grounded answers about your candidates, powered by your ATS data." />
      <RequirePermission permission="copilot:use">
        <CopilotChat />
      </RequirePermission>
      <AIDisclaimer compact className="mt-4" />
    </div>
  );
}
