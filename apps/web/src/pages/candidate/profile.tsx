import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Sparkles, Trash2, X } from 'lucide-react';
import * as React from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import {
  EDUCATION_LEVEL_LABELS,
  EDUCATION_LEVELS,
  updateCandidateProfileSchema,
  type CandidateProfileDto,
  type EducationLevel,
} from '@hireflow/shared';
import { ErrorState, PageHeader, PageLoader } from '@/components/common';
import { FormError, FormField } from '@/components/forms';
import { applyServerErrors } from '@/lib/form-errors';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Input, Label, Progress, Select, Textarea } from '@/components/ui';
import { useMyProfile, useReplaceEducation, useReplaceExperience, useReplaceSkills, useUpdateProfile } from '@/features/api/candidates';
import { useDocumentTitle } from '@/hooks/use-document-title';

const monthValue = (iso: string | null) => (iso ? iso.slice(0, 7) : '');

function BasicsForm({ profile }: { profile: CandidateProfileDto }) {
  const update = useUpdateProfile();
  type Values = z.input<typeof updateCandidateProfileSchema>;
  const form = useForm<Values, unknown, z.output<typeof updateCandidateProfileSchema>>({
    resolver: zodResolver(updateCandidateProfileSchema),
    defaultValues: {
      headline: profile.headline ?? '',
      summary: profile.summary ?? '',
      currentRole: profile.currentRole ?? '',
      location: profile.location ?? '',
      phone: profile.phone ?? '',
      linkedinUrl: profile.linkedinUrl ?? '',
      githubUrl: profile.githubUrl ?? '',
      portfolioUrl: profile.portfolioUrl ?? '',
    },
  });
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync(values);
    } catch (error) {
      if (!applyServerErrors(error, form.setError)) form.setError('root', { message: error instanceof Error ? error.message : 'Save failed' });
    }
  });
  return (
    <Card>
      <CardHeader><CardTitle>Basics</CardTitle><CardDescription>This is what hiring teams see first.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormError error={errors.root?.message ? new Error(errors.root.message) : null} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="headline" label="Headline" error={errors.headline?.message}><Input placeholder="e.g. Full Stack Developer" {...form.register('headline')} /></FormField>
            <FormField id="currentRole" label="Current role" error={errors.currentRole?.message}><Input {...form.register('currentRole')} /></FormField>
            <FormField id="location" label="Location" error={errors.location?.message}><Input {...form.register('location')} /></FormField>
            <FormField id="phone" label="Phone" error={errors.phone?.message}><Input type="tel" {...form.register('phone')} /></FormField>
          </div>
          <FormField id="summary" label="Summary" error={errors.summary?.message}><Textarea rows={4} {...form.register('summary')} /></FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField id="linkedinUrl" label="LinkedIn URL" error={errors.linkedinUrl?.message}><Input type="url" {...form.register('linkedinUrl')} /></FormField>
            <FormField id="githubUrl" label="GitHub URL" error={errors.githubUrl?.message}><Input type="url" {...form.register('githubUrl')} /></FormField>
            <FormField id="portfolioUrl" label="Portfolio URL" error={errors.portfolioUrl?.message}><Input type="url" {...form.register('portfolioUrl')} /></FormField>
          </div>
          <div className="flex justify-end"><Button type="submit" loading={isSubmitting}>Save basics</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

function SkillsEditor({ profile }: { profile: CandidateProfileDto }) {
  const save = useReplaceSkills();
  const [skills, setSkills] = React.useState(profile.skills.map((s) => ({ skill: s.skill, yearsExperience: s.yearsExperience, proficiency: s.proficiency })));
  const [draft, setDraft] = React.useState('');
  const add = () => {
    const value = draft.trim();
    if (value && !skills.some((s) => s.skill.toLowerCase() === value.toLowerCase())) setSkills((list) => [...list, { skill: value, yearsExperience: null, proficiency: null }]);
    setDraft('');
  };
  return (
    <Card>
      <CardHeader><CardTitle>Skills</CardTitle><CardDescription>Skills are matched against job requirements. Aliases like “ReactJS” are normalized automatically.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input aria-label="Add a skill" placeholder="Add a skill and press Enter" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <Button type="button" variant="outline" onClick={add}><Plus /> Add</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {skills.map((s, index) => (
            <span key={s.skill} className="flex items-center gap-1.5 rounded-full border bg-card py-1 pl-3 pr-1 text-sm">
              {s.skill}
              <input
                type="number"
                min={0}
                max={50}
                step={0.5}
                aria-label={`Years with ${s.skill}`}
                placeholder="yrs"
                value={s.yearsExperience ?? ''}
                onChange={(e) => setSkills((list) => list.map((item, i) => (i === index ? { ...item, yearsExperience: e.target.value === '' ? null : Number(e.target.value) } : item)))}
                className="w-12 rounded border bg-background px-1 text-xs"
              />
              <button type="button" onClick={() => setSkills((list) => list.filter((_, i) => i !== index))} className="rounded-full p-0.5 hover:bg-muted" aria-label={`Remove ${s.skill}`}><X className="size-3.5" /></button>
            </span>
          ))}
          {skills.length === 0 && <p className="text-sm text-muted-foreground">No skills yet.</p>}
        </div>
        <div className="flex justify-end"><Button onClick={() => save.mutate({ skills })} loading={save.isPending}>Save skills</Button></div>
      </CardContent>
    </Card>
  );
}

const experienceForm = z.object({
  experiences: z.array(z.object({ company: z.string().trim().min(1, { error: 'Required' }), title: z.string().trim().min(1, { error: 'Required' }), description: z.string(), startDate: z.string(), endDate: z.string(), current: z.boolean() })),
});

function ExperienceEditor({ profile }: { profile: CandidateProfileDto }) {
  const save = useReplaceExperience();
  const form = useForm<z.infer<typeof experienceForm>>({
    resolver: zodResolver(experienceForm),
    defaultValues: {
      experiences: profile.experiences.map((e) => ({ company: e.company, title: e.title, description: e.description ?? '', startDate: monthValue(e.startDate), endDate: monthValue(e.endDate), current: e.current })),
    },
  });
  const fields = useFieldArray({ control: form.control, name: 'experiences' });
  const submit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync({ experiences: values.experiences.map((e) => ({ ...e, description: e.description || null, startDate: e.startDate || null, endDate: e.current ? null : e.endDate || null })) });
    } catch (error) {
      form.setError('root', { message: error instanceof Error ? error.message : 'Save failed' });
    }
  });
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div><CardTitle>Experience</CardTitle><CardDescription>Dated roles determine your years of experience.</CardDescription></div>
        <Button type="button" variant="outline" size="sm" onClick={() => fields.append({ company: '', title: '', description: '', startDate: '', endDate: '', current: false })}><Plus /> Add role</Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormError error={form.formState.errors.root?.message ? new Error(form.formState.errors.root.message) : null} />
          {fields.fields.map((field, index) => (
            <div key={field.id} className="space-y-3 rounded-lg border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField id={`exp-${index}-title`} label="Title" error={form.formState.errors.experiences?.[index]?.title?.message}><Input {...form.register(`experiences.${index}.title`)} /></FormField>
                <FormField id={`exp-${index}-company`} label="Company" error={form.formState.errors.experiences?.[index]?.company?.message}><Input {...form.register(`experiences.${index}.company`)} /></FormField>
                <FormField id={`exp-${index}-start`} label="Start"><Input type="month" {...form.register(`experiences.${index}.startDate`)} /></FormField>
                <FormField id={`exp-${index}-end`} label="End"><Input type="month" disabled={form.watch(`experiences.${index}.current`)} {...form.register(`experiences.${index}.endDate`)} /></FormField>
              </div>
              <FormField id={`exp-${index}-desc`} label="Description"><Textarea rows={3} {...form.register(`experiences.${index}.description`)} /></FormField>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Controller control={form.control} name={`experiences.${index}.current`} render={({ field: f }) => <Checkbox id={`exp-${index}-current`} checked={f.value} onCheckedChange={(v) => f.onChange(v === true)} />} />
                  <Label htmlFor={`exp-${index}-current`} className="font-normal">I currently work here</Label>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => fields.remove(index)}><Trash2 /> Remove</Button>
              </div>
            </div>
          ))}
          {fields.fields.length === 0 && <p className="text-sm text-muted-foreground">No roles yet.</p>}
          <div className="flex justify-end"><Button type="submit" loading={save.isPending}>Save experience</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

function EducationEditor({ profile }: { profile: CandidateProfileDto }) {
  const save = useReplaceEducation();
  const [items, setItems] = React.useState(
    profile.education.map((e) => ({ institution: e.institution, degree: e.degree ?? '', field: e.field ?? '', level: e.level, startDate: monthValue(e.startDate), endDate: monthValue(e.endDate), grade: e.grade ?? '' })),
  );
  const set = (index: number, patch: Partial<(typeof items)[number]>) => setItems((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const levelOptions = [{ value: 'NONE', label: 'Not specified' }, ...EDUCATION_LEVELS.filter((l) => l !== 'NONE').map((l) => ({ value: l, label: EDUCATION_LEVEL_LABELS[l] }))];
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div><CardTitle>Education</CardTitle></div>
        <Button type="button" variant="outline" size="sm" onClick={() => setItems((l) => [...l, { institution: '', degree: '', field: '', level: null, startDate: '', endDate: '', grade: '' }])}><Plus /> Add</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item, index) => (
          <div key={index} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
            <FormField id={`edu-${index}-inst`} label="Institution"><Input value={item.institution} onChange={(e) => set(index, { institution: e.target.value })} /></FormField>
            <div className="space-y-1.5">
              <Label htmlFor={`edu-${index}-level`}>Level</Label>
              <Select id={`edu-${index}-level`} value={item.level ?? 'NONE'} onValueChange={(v) => set(index, { level: v === 'NONE' ? null : (v as EducationLevel) })} options={levelOptions} />
            </div>
            <FormField id={`edu-${index}-degree`} label="Degree"><Input value={item.degree} onChange={(e) => set(index, { degree: e.target.value })} /></FormField>
            <FormField id={`edu-${index}-field`} label="Field of study"><Input value={item.field} onChange={(e) => set(index, { field: e.target.value })} /></FormField>
            <FormField id={`edu-${index}-end`} label="Graduation"><Input type="month" value={item.endDate} onChange={(e) => set(index, { endDate: e.target.value })} /></FormField>
            <div className="flex items-end justify-end"><Button type="button" variant="ghost" size="sm" onClick={() => setItems((l) => l.filter((_, i) => i !== index))}><Trash2 /> Remove</Button></div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">No education yet.</p>}
        <FormError error={save.error} />
        <div className="flex justify-end">
          <Button
            loading={save.isPending}
            disabled={items.some((i) => !i.institution.trim())}
            onClick={() => save.mutate({ education: items.map((i) => ({ ...i, degree: i.degree || null, field: i.field || null, grade: i.grade || null, startDate: i.startDate || null, endDate: i.endDate || null })) })}
          >
            Save education
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CandidateProfilePage() {
  useDocumentTitle('Profile');
  const { data: profile, isLoading, isError, error, refetch } = useMyProfile();
  if (isLoading) return <PageLoader />;
  if (isError || !profile) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const parsing = profile.resumes.some((r) => r.parsingStatus === 'PENDING' || r.parsingStatus === 'PROCESSING');

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Keep your profile up to date — it’s what hiring teams see when you apply." />
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center">
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium">Profile completeness: {profile.profileCompleteness}%</p>
            <Progress value={profile.profileCompleteness} aria-label="Profile completeness" />
          </div>
          {parsing ? (
            <Badge variant="default"><Sparkles /> Updating from your resume…</Badge>
          ) : (
            <Button variant="outline" asChild><Link to="/portal/resume"><Sparkles /> Fill from resume</Link></Button>
          )}
        </CardContent>
      </Card>
      {/* Remount editors when the profile is re-extracted from a new resume. */}
      <div key={profile.updatedAt} className="space-y-6">
        <BasicsForm profile={profile} />
        <SkillsEditor profile={profile} />
        <ExperienceEditor profile={profile} />
        <EducationEditor profile={profile} />
      </div>
    </div>
  );
}
