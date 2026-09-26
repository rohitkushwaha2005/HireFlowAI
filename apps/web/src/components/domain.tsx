import { CircleCheck, CircleDashed, CircleMinus, CircleX, LoaderCircle } from 'lucide-react';
import {
  APPLICATION_STATUS_LABELS,
  scoreBand,
  type ApplicationStatus,
  type InterviewStatus,
  type JobStatus,
  type ParsingStatus,
  type RequirementMatchStatus,
} from '@hireflow/shared';
import { cn } from '@/lib/utils';
import { Badge, Tooltip } from './ui';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive' | 'muted';

const APPLICATION_STATUS_VARIANT: Record<ApplicationStatus, BadgeVariant> = {
  APPLIED: 'secondary',
  SCREENING: 'default',
  SHORTLISTED: 'default',
  INTERVIEW: 'warning',
  OFFER: 'success',
  HIRED: 'success',
  REJECTED: 'destructive',
  WITHDRAWN: 'muted',
};

export function ApplicationStatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  return (
    <Badge variant={APPLICATION_STATUS_VARIANT[status]} className={className}>
      {APPLICATION_STATUS_LABELS[status]}
    </Badge>
  );
}

const JOB_STATUS: Record<JobStatus, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: 'Draft', variant: 'muted' },
  PUBLISHED: { label: 'Published', variant: 'success' },
  PAUSED: { label: 'Paused', variant: 'warning' },
  CLOSED: { label: 'Closed', variant: 'secondary' },
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const s = JOB_STATUS[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

const INTERVIEW_STATUS: Record<InterviewStatus, { label: string; variant: BadgeVariant }> = {
  SCHEDULED: { label: 'Scheduled', variant: 'default' },
  COMPLETED: { label: 'Completed', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'muted' },
  NO_SHOW: { label: 'No-show', variant: 'destructive' },
};

export function InterviewStatusBadge({ status }: { status: InterviewStatus }) {
  const s = INTERVIEW_STATUS[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function ParsingStatusBadge({ status }: { status: ParsingStatus }) {
  switch (status) {
    case 'COMPLETED':
      return <Badge variant="success">Parsed</Badge>;
    case 'FAILED':
      return <Badge variant="destructive">Parsing failed</Badge>;
    default:
      return (
        <Badge variant="secondary">
          <LoaderCircle className="animate-spin" /> {status === 'PENDING' ? 'Queued' : 'Processing'}
        </Badge>
      );
  }
}

const SCORE_COLORS = {
  STRONG: 'text-success',
  GOOD: 'text-primary',
  FAIR: 'text-warning-foreground dark:text-warning',
  WEAK: 'text-muted-foreground',
} as const;

const SCORE_BG = {
  STRONG: 'bg-success/15 text-success',
  GOOD: 'bg-primary/10 text-primary',
  FAIR: 'bg-warning/20 text-warning-foreground dark:text-warning',
  WEAK: 'bg-muted text-muted-foreground',
} as const;

/** Compact pill with the overall match score. */
export function ScoreBadge({ score, pending, className }: { score: number | null; pending?: boolean; className?: string }) {
  if (score === null) {
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground', className)}>
        {pending ? <LoaderCircle className="size-3 animate-spin" /> : null}
        {pending ? 'Scoring' : 'No score'}
      </span>
    );
  }
  const band = scoreBand(score);
  return (
    <Tooltip content={`AI match score: ${score}/100 (${band.toLowerCase()}). Decision support only.`}>
      <span className={cn('inline-flex min-w-11 cursor-default items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', SCORE_BG[band], className)}>
        {score}
      </span>
    </Tooltip>
  );
}

/** Circular gauge for the headline match score. */
export function ScoreRing({ score, size = 96, label = 'Match' }: { score: number; size?: number; label?: string }) {
  const band = scoreBand(score);
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${label} score ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className="fill-none stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          className={cn('fill-none stroke-current transition-all', SCORE_COLORS[band])}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-2xl font-bold tabular-nums leading-none">{score}</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/** Horizontal bar for one score component. */
export function ScoreBar({ label, value, weight }: { label: string; value: number | null; weight?: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value === null ? 'n/a' : `${value}/100`}
          {weight !== undefined && value !== null && <span className="ml-2 text-xs">× {Math.round(weight * 100)}%</span>}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        {value !== null && <div className={cn('h-full rounded-full', value >= 65 ? 'bg-success' : value >= 45 ? 'bg-primary' : 'bg-warning')} style={{ width: `${value}%` }} />}
      </div>
    </div>
  );
}

export function RequirementStatusIcon({ status }: { status: RequirementMatchStatus }) {
  switch (status) {
    case 'MATCHED':
      return <CircleCheck className="size-4 text-success" aria-label="Matched" />;
    case 'PARTIAL':
      return <CircleMinus className="size-4 text-primary" aria-label="Partially matched" />;
    case 'RELATED':
      return <CircleDashed className="size-4 text-warning" aria-label="Related experience" />;
    case 'MISSING':
      return <CircleX className="size-4 text-destructive" aria-label="Missing" />;
  }
}

export function SkillChips({ skills, variant = 'secondary', max, className }: { skills: string[]; variant?: BadgeVariant; max?: number; className?: string }) {
  const shown = max ? skills.slice(0, max) : skills;
  const rest = skills.length - shown.length;
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {shown.map((skill) => (
        <Badge key={skill} variant={variant}>
          {skill}
        </Badge>
      ))}
      {rest > 0 && <Badge variant="outline">+{rest}</Badge>}
    </div>
  );
}
