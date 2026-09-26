import { ChevronDown, Copy, Sparkles } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import {
  QUESTION_CATEGORIES,
  type InterviewQuestionDto,
  type QuestionCategory,
} from '@hireflow/shared';
import { AIBadge } from '@/components/common';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
} from '@/components/ui';
import { useGenerateQuestions } from '@/features/api/applications';
import { Can } from '@/features/auth/guards';
import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  TECHNICAL: 'Technical',
  PROJECT: 'Project',
  SYSTEM_DESIGN: 'System design',
  BEHAVIORAL: 'Behavioral',
  ROLE_SPECIFIC: 'Role specific',
};
const DIFFICULTY_VARIANT = { EASY: 'success', MEDIUM: 'secondary', HARD: 'warning' } as const;

function QuestionItem({ question, index }: { question: InterviewQuestionDto; index: number }) {
  const [open, setOpen] = React.useState(false);
  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium">{question.question}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{CATEGORY_LABELS[question.category]}</Badge>
            <Badge variant={DIFFICULTY_VARIANT[question.difficulty]}>
              {question.difficulty.toLowerCase()}
            </Badge>
            <button
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              Expected signals{' '}
              <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
            </button>
          </div>
          {open && (
            <div className="space-y-2 rounded-md bg-muted/60 p-3 text-sm">
              <ul className="list-disc space-y-1 pl-4">
                {question.expectedSignals.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              {question.rationale && (
                <p className="text-xs text-muted-foreground">Why: {question.rationale}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function QuestionsPanel({
  applicationId,
  questions,
}: {
  applicationId: string;
  questions: InterviewQuestionDto[];
}) {
  const generate = useGenerateQuestions(applicationId);
  const [category, setCategory] = React.useState<'ALL' | QuestionCategory>('ALL');
  const [count, setCount] = React.useState('8');
  const shown = category === 'ALL' ? questions : questions.filter((q) => q.category === category);

  const copyAll = async () => {
    const text = questions
      .map(
        (q, i) =>
          `${i + 1}. [${CATEGORY_LABELS[q.category]}] ${q.question}\n   Signals: ${q.expectedSignals.join('; ')}`,
      )
      .join('\n');
    await navigator.clipboard.writeText(text);
    toast.success('Questions copied');
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            Interview questions <AIBadge provider={questions[0]?.aiProvider} />
          </CardTitle>
          <CardDescription>
            Tailored to this candidate’s resume, projects and the job’s requirements.
          </CardDescription>
        </div>
        <Can permission="interviews:write">
          <div className="flex items-center gap-2">
            <Select
              aria-label="Number of questions"
              className="w-32"
              value={count}
              onValueChange={setCount}
              options={['5', '8', '12'].map((c) => ({ value: c, label: `${c} questions` }))}
            />
            <Button
              onClick={() => generate.mutate({ count: Number(count), replace: true })}
              loading={generate.isPending}
            >
              <Sparkles /> {questions.length ? 'Regenerate' : 'Generate'}
            </Button>
          </div>
        </Can>
      </CardHeader>
      <CardContent className="space-y-3">
        {questions.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {generate.isPending
              ? 'Generating questions…'
              : 'No questions yet. Generate a structured interview guide for this candidate.'}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {(['ALL', ...QUESTION_CATEGORIES] as const).map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={category === c ? 'default' : 'outline'}
                  onClick={() => setCategory(c)}
                  aria-pressed={category === c}
                >
                  {c === 'ALL' ? 'All' : CATEGORY_LABELS[c]}
                </Button>
              ))}
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void copyAll()}>
                <Copy /> Copy all
              </Button>
            </div>
            <ol className="space-y-2">
              {shown.map((q) => (
                <QuestionItem key={q.id} question={q} index={questions.indexOf(q)} />
              ))}
            </ol>
          </>
        )}
      </CardContent>
    </Card>
  );
}
