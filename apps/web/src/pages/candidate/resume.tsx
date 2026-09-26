import { FileText, RotateCcw, Star, Trash2, Upload } from 'lucide-react';
import * as React from 'react';
import type { ResumeDto } from '@hireflow/shared';
import { AIBadge, EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/common';
import { ParsingStatusBadge } from '@/components/domain';
import { ConfirmDialog, FormError } from '@/components/forms';
import { Badge, Button, Card, CardContent, Progress } from '@/components/ui';
import { openResume, useDeleteResume, useMyResumes, useRetryResume, useSetPrimaryResume, useUploadResume } from '@/features/api/candidates';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { cn, formatBytes, timeAgo } from '@/lib/utils';

const MAX_MB = 5;

function Dropzone() {
  const upload = useUploadResume();
  const [dragging, setDragging] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const input = React.useRef<HTMLInputElement>(null);

  const handle = (file: File | undefined) => {
    setLocalError(null);
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return setLocalError('Please upload a PDF file.');
    if (file.size > MAX_MB * 1024 * 1024) return setLocalError(`The file is larger than ${MAX_MB} MB.`);
    setProgress(0);
    upload.mutate({ file, onProgress: setProgress }, { onSettled: () => setProgress(null) });
  };

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a PDF resume"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-2 focus-visible:outline-ring',
          dragging ? 'border-primary bg-accent/50' : 'hover:border-primary/60 hover:bg-muted/40',
        )}
      >
        <Upload className="mb-3 size-8 text-primary" />
        <p className="font-medium">Drop your resume here or click to browse</p>
        <p className="mt-1 text-sm text-muted-foreground">PDF, up to {MAX_MB} MB. We’ll extract your skills, experience and education automatically.</p>
        <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {progress !== null && <Progress value={progress} aria-label="Upload progress" />}
      <FormError error={localError ? new Error(localError) : upload.error} />
    </div>
  );
}

function ResumeRow({ resume }: { resume: ResumeDto }) {
  const retry = useRetryResume();
  const primary = useSetPrimaryResume();
  const remove = useDeleteResume();
  const [confirm, setConfirm] = React.useState(false);
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <FileText className="size-8 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          <span className="truncate">{resume.fileName}</span>
          {resume.isPrimary && <Badge><Star /> Primary</Badge>}
          <AIBadge provider={resume.parsingStatus === 'COMPLETED' ? resume.aiProvider : null} />
        </p>
        <p className="text-xs text-muted-foreground">{formatBytes(resume.fileSize)} · uploaded {timeAgo(resume.createdAt)}</p>
        {resume.parsingStatus === 'FAILED' && resume.parsingError && <p className="mt-1 text-xs text-destructive">{resume.parsingError}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ParsingStatusBadge status={resume.parsingStatus} />
        <Button variant="ghost" size="sm" onClick={() => void openResume(resume.id)}>Open</Button>
        {resume.parsingStatus === 'FAILED' && <Button variant="outline" size="sm" onClick={() => retry.mutate(resume.id)} loading={retry.isPending}><RotateCcw /> Retry</Button>}
        {!resume.isPrimary && <Button variant="outline" size="sm" onClick={() => primary.mutate(resume.id)} loading={primary.isPending}>Make primary</Button>}
        <Button variant="ghost" size="icon-sm" onClick={() => setConfirm(true)} aria-label={`Delete ${resume.fileName}`}><Trash2 /></Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this resume?"
        description="The file is removed permanently. Resumes attached to active applications can’t be deleted."
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate(resume.id, { onSettled: () => setConfirm(false) })}
      />
    </div>
  );
}

export default function ResumePage() {
  useDocumentTitle('Resume');
  const { data, isLoading, isError, error, refetch } = useMyResumes();
  return (
    <div className="space-y-6">
      <PageHeader title="Resume" description="Your primary resume is used for new applications and to build your profile." />
      <Card><CardContent className="pt-5"><Dropzone /></CardContent></Card>
      {isLoading ? <ListSkeleton rows={2} /> : isError ? <ErrorState error={error} onRetry={() => void refetch()} /> : !data?.length ? (
        <EmptyState icon={FileText} title="No resumes yet" description="Upload a PDF to get started." />
      ) : (
        <Card className="divide-y overflow-hidden">{data.map((r) => <ResumeRow key={r.id} resume={r} />)}</Card>
      )}
    </div>
  );
}
