import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ArrowRightLeft, CalendarClock, GripVertical } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router';
import {
  APPLICATION_STATUS_LABELS,
  PIPELINE_STAGES,
  type PipelineCardDto,
  type PipelineStage,
} from '@hireflow/shared';
import { ErrorState } from '@/components/common';
import { ScoreBadge } from '@/components/domain';
import { ConfirmDialog } from '@/components/forms';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Skeleton,
} from '@/components/ui';
import { useMoveApplication, usePipeline } from '@/features/api/applications';
import { useAuth } from '@/features/auth/use-auth';
import { cn, initialsOf } from '@/lib/utils';

/** Moves that notify the candidate or end the process are confirmed first. */
const CONFIRM_STAGES: ReadonlySet<PipelineStage> = new Set(['REJECTED', 'OFFER', 'HIRED']);

const COLUMN_ACCENT: Record<PipelineStage, string> = {
  APPLIED: 'bg-muted-foreground',
  SCREENING: 'bg-chart-2',
  SHORTLISTED: 'bg-primary',
  INTERVIEW: 'bg-chart-3',
  OFFER: 'bg-chart-5',
  HIRED: 'bg-success',
  REJECTED: 'bg-destructive',
};

interface PendingMove {
  card: PipelineCardDto;
  to: PipelineStage;
}

function CardBody({ card, showJob, dragHandle, onMove, canMove }: { card: PipelineCardDto; showJob: boolean; dragHandle?: React.ReactNode; onMove?: (to: PipelineStage) => void; canMove: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-xs">
      <div className="flex items-start gap-2">
        {dragHandle}
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {initialsOf(card.candidate.firstName, card.candidate.lastName)}
        </div>
        <div className="min-w-0 flex-1">
          <Link to={`/app/applications/${card.id}`} className="block truncate text-sm font-medium hover:text-primary">
            {card.candidate.firstName} {card.candidate.lastName}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{showJob ? card.job.title : (card.candidate.headline ?? '—')}</p>
        </div>
        <ScoreBadge score={card.overallScore} />
      </div>
      {(card.matchedSkills.length > 0 || card.interviewCount > 0 || (canMove && onMove)) && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
            {card.matchedSkills.map((skill) => (
              <span key={skill} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {skill}
              </span>
            ))}
            {card.interviewCount > 0 && (
              <span className="flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[11px]">
                <CalendarClock className="size-3" /> {card.interviewCount}
              </span>
            )}
          </div>
          {canMove && onMove && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="size-6" aria-label={`Move ${card.candidate.firstName} ${card.candidate.lastName} to another stage`}>
                  <ArrowRightLeft className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Move to</DropdownMenuLabel>
                {PIPELINE_STAGES.filter((s) => s !== card.status).map((stage) => (
                  <DropdownMenuItem key={stage} onSelect={() => onMove(stage)}>
                    {APPLICATION_STATUS_LABELS[stage]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
}

function DraggableCard({ card, showJob, canMove, onMove }: { card: PipelineCardDto; showJob: boolean; canMove: boolean; onMove: (to: PipelineStage) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, data: { card }, disabled: !canMove });
  return (
    <div ref={setNodeRef} className={cn(isDragging && 'opacity-40')}>
      <CardBody
        card={card}
        showJob={showJob}
        canMove={canMove}
        onMove={onMove}
        dragHandle={
          canMove ? (
            <button
              className="-ml-1 mt-1.5 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-muted active:cursor-grabbing"
              aria-label={`Drag ${card.candidate.firstName} ${card.candidate.lastName}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
          ) : null
        }
      />
    </div>
  );
}

function Column({ status, total, children }: { status: PipelineStage; total: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${APPLICATION_STATUS_LABELS[status]} (${total})`}
      className={cn('flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors', isOver && 'border-primary bg-accent/60')}
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        <span className={cn('size-2 rounded-full', COLUMN_ACCENT[status])} aria-hidden />
        <h3 className="text-sm font-semibold">{APPLICATION_STATUS_LABELS[status]}</h3>
        <span className="ml-auto rounded-full bg-card px-2 text-xs tabular-nums text-muted-foreground">{total}</span>
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">{children}</div>
    </section>
  );
}

export function KanbanBoard({ jobId }: { jobId?: string }) {
  const { can } = useAuth();
  const canMove = can('applications:move');
  const { data, isLoading, isError, error, refetch } = usePipeline(jobId);
  const move = useMoveApplication();
  const [active, setActive] = React.useState<PipelineCardDto | null>(null);
  const [pending, setPending] = React.useState<PendingMove | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const requestMove = (card: PipelineCardDto, to: PipelineStage) => {
    if (card.status === to) return;
    if (CONFIRM_STAGES.has(to)) setPending({ card, to });
    else move.mutate({ id: card.id, from: card.status, to, ...(jobId ? { jobId } : {}) });
  };

  const onDragStart = (event: DragStartEvent) => setActive((event.active.data.current as { card: PipelineCardDto }).card);
  const onDragEnd = (event: DragEndEvent) => {
    setActive(null);
    const card = (event.active.data.current as { card: PipelineCardDto } | undefined)?.card;
    const to = event.over?.id as PipelineStage | undefined;
    if (card && to) requestMove(card, to);
  };

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-hidden">
        {PIPELINE_STAGES.slice(0, 4).map((s) => <Skeleton key={s} className="h-80 w-72 shrink-0 rounded-xl" />)}
      </div>
    );
  }
  if (isError || !data) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
        accessibility={{
          announcements: {
            onDragStart: ({ active: a }) => `Picked up ${(a.data.current as { card: PipelineCardDto }).card.candidate.firstName}.`,
            onDragOver: ({ over }) => (over ? `Over ${APPLICATION_STATUS_LABELS[over.id as PipelineStage]}.` : 'Not over a stage.'),
            onDragEnd: ({ over }) => (over ? `Dropped in ${APPLICATION_STATUS_LABELS[over.id as PipelineStage]}.` : 'Drop cancelled.'),
            onDragCancel: () => 'Drag cancelled.',
          },
        }}
      >
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0" style={{ minHeight: 420 }}>
          {data.columns
            .filter((c): c is typeof c & { status: PipelineStage } => (PIPELINE_STAGES as readonly string[]).includes(c.status))
            .map((column) => (
              <Column key={column.status} status={column.status} total={column.total}>
                {column.cards.length === 0 ? (
                  <p className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">No candidates</p>
                ) : (
                  column.cards.map((card) => (
                    <DraggableCard key={card.id} card={card} showJob={!jobId} canMove={canMove} onMove={(to) => requestMove(card, to)} />
                  ))
                )}
                {column.total > column.cards.length && (
                  <p className="py-1 text-center text-xs text-muted-foreground">+{column.total - column.cards.length} more in list view</p>
                )}
              </Column>
            ))}
        </div>
        <DragOverlay>{active ? <div className="w-68 rotate-2"><CardBody card={active} showJob={!jobId} canMove={false} /></div> : null}</DragOverlay>
      </DndContext>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending ? `Move ${pending.card.candidate.firstName} ${pending.card.candidate.lastName} to ${APPLICATION_STATUS_LABELS[pending.to]}?` : ''}
        description={
          pending?.to === 'REJECTED'
            ? 'The candidate will be notified by email. Please make sure this decision was reviewed by a person — AI scores alone are never a reason to reject.'
            : 'The candidate will be notified by email about this update.'
        }
        confirmLabel={pending ? `Move to ${APPLICATION_STATUS_LABELS[pending.to]}` : 'Confirm'}
        destructive={pending?.to === 'REJECTED'}
        onConfirm={() => {
          if (pending) move.mutate({ id: pending.card.id, from: pending.card.status, to: pending.to, ...(jobId ? { jobId } : {}) });
          setPending(null);
        }}
      />
    </>
  );
}
