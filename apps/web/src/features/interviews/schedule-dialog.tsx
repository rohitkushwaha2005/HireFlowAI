import { addDays, format } from 'date-fns';
import * as React from 'react';
import { INTERVIEW_TYPES, type InterviewType } from '@hireflow/shared';
import { FormError, FormField } from '@/components/forms';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Select, Textarea } from '@/components/ui';
import { useCreateInterview, useMembers } from '@/features/api/misc';
import { useAuth } from '@/features/auth/use-auth';

const TYPE_OPTIONS = INTERVIEW_TYPES.map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() }));
const DURATIONS = ['30', '45', '60', '90', '120'].map((d) => ({ value: d, label: `${d} minutes` }));

export function ScheduleInterviewDialog({
  open,
  onOpenChange,
  applicationId,
  candidateName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  candidateName: string;
}) {
  const { me } = useAuth();
  const members = useMembers();
  const create = useCreateInterview();
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const [values, setValues] = React.useState({
    interviewerId: me?.user.id ?? '',
    date: tomorrow,
    time: '10:00',
    duration: '60',
    type: 'VIDEO' as InterviewType,
    meetingUrl: '',
    location: '',
    notes: '',
  });
  const [error, setError] = React.useState<string | null>(null);
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((v) => ({ ...v, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const scheduledAt = new Date(`${values.date}T${values.time}`);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now()) {
      setError('Choose a date and time in the future.');
      return;
    }
    create.mutate(
      {
        applicationId,
        interviewerId: values.interviewerId,
        scheduledAt: scheduledAt.toISOString(),
        duration: Number(values.duration),
        type: values.type,
        meetingUrl: values.meetingUrl || null,
        location: values.location || null,
        notes: values.notes || null,
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) => setError(err.message),
      },
    );
  };

  const interviewerOptions = (members.data ?? []).map((m) => ({ value: m.userId, label: `${m.firstName} ${m.lastName}` }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule interview</DialogTitle>
          <DialogDescription>{candidateName} will receive an email with the details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <FormError error={error ? new Error(error) : null} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="interviewer">Interviewer</Label>
              <Select id="interviewer" value={values.interviewerId} onValueChange={(v) => set('interviewerId', v)} options={interviewerOptions} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="type">Type</Label>
              <Select id="type" value={values.type} onValueChange={(v) => set('type', v)} options={TYPE_OPTIONS} />
            </div>
            <FormField id="date" label="Date">
              <Input type="date" min={format(new Date(), 'yyyy-MM-dd')} value={values.date} onChange={(e) => set('date', e.target.value)} required />
            </FormField>
            <FormField id="time" label="Time">
              <Input type="time" value={values.time} onChange={(e) => set('time', e.target.value)} required />
            </FormField>
            <div className="space-y-1.5">
              <Label htmlFor="duration">Duration</Label>
              <Select id="duration" value={values.duration} onValueChange={(v) => set('duration', v)} options={DURATIONS} />
            </div>
            {values.type === 'ONSITE' ? (
              <FormField id="location" label="Location">
                <Input value={values.location} onChange={(e) => set('location', e.target.value)} placeholder="Office address" />
              </FormField>
            ) : (
              <FormField id="meetingUrl" label="Meeting link">
                <Input type="url" value={values.meetingUrl} onChange={(e) => set('meetingUrl', e.target.value)} placeholder="https://…" />
              </FormField>
            )}
          </div>
          <FormField id="notes" label="Notes for the interview team">
            <Textarea rows={3} value={values.notes} onChange={(e) => set('notes', e.target.value)} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending} disabled={!values.interviewerId}>Schedule</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
