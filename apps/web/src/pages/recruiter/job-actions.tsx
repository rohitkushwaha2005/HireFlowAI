import {
  Copy,
  ExternalLink,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router';
import type { JobSummaryDto, JobTransition } from '@hireflow/shared';
import { ConfirmDialog } from '@/components/forms';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { useDeleteJob, useDuplicateJob, useJobTransition } from '@/features/api/jobs';
import { useAuth } from '@/features/auth/use-auth';

/** Shared job actions menu (list rows and detail header). */
export function JobActionsMenu({
  job,
  onDeleted,
  trigger,
}: {
  job: JobSummaryDto;
  onDeleted?: () => void;
  trigger?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const transition = useJobTransition();
  const duplicate = useDuplicateJob();
  const remove = useDeleteJob();
  const [confirm, setConfirm] = React.useState<'close' | 'delete' | null>(null);

  const run = (action: JobTransition) => transition.mutate({ id: job.id, action });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${job.title}`}>
              <MoreHorizontal />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {can('jobs:write') && (
            <DropdownMenuItem onSelect={() => navigate(`/app/jobs/${job.id}/edit`)}>
              <Pencil /> Edit
            </DropdownMenuItem>
          )}
          {job.status === 'PUBLISHED' && (
            <DropdownMenuItem
              onSelect={() => window.open(`/jobs/${job.slug}`, '_blank', 'noopener')}
            >
              <ExternalLink /> View public page
            </DropdownMenuItem>
          )}
          {can('jobs:publish') && (job.status === 'DRAFT' || job.status === 'PAUSED') && (
            <DropdownMenuItem onSelect={() => run('publish')}>
              <Play /> Publish
            </DropdownMenuItem>
          )}
          {can('jobs:publish') && job.status === 'PUBLISHED' && (
            <DropdownMenuItem onSelect={() => run('pause')}>
              <Pause /> Pause
            </DropdownMenuItem>
          )}
          {can('jobs:publish') && job.status === 'CLOSED' && (
            <DropdownMenuItem onSelect={() => run('reopen')}>
              <RotateCcw /> Reopen
            </DropdownMenuItem>
          )}
          {can('jobs:write') && (
            <DropdownMenuItem
              onSelect={() =>
                duplicate.mutate(job.id, {
                  onSuccess: (copy) => navigate(`/app/jobs/${copy.id}/edit`),
                })
              }
            >
              <Copy /> Duplicate
            </DropdownMenuItem>
          )}
          {can('jobs:publish') && job.status !== 'CLOSED' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setConfirm('close')}>
                <XCircle /> Close job
              </DropdownMenuItem>
            </>
          )}
          {can('jobs:delete') && job.applicationCount === 0 && (
            <DropdownMenuItem destructive onSelect={() => setConfirm('delete')}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirm === 'close'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Close “${job.title}”?`}
        description="The job will be removed from the job board and stop accepting applications. Existing applications are kept and you can reopen it later."
        confirmLabel="Close job"
        destructive
        loading={transition.isPending}
        onConfirm={() =>
          transition.mutate({ id: job.id, action: 'close' }, { onSettled: () => setConfirm(null) })
        }
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Delete “${job.title}”?`}
        description="This permanently deletes the job and its requirements. This cannot be undone."
        confirmLabel="Delete job"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(job.id, {
            onSuccess: () => {
              setConfirm(null);
              onDeleted?.();
            },
          })
        }
      />
    </>
  );
}
