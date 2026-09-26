import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Plus, Sparkles, Trash2, WandSparkles } from 'lucide-react';
import * as React from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import type { z } from 'zod';
import {
  createJobSchema,
  EDUCATION_LEVEL_LABELS,
  EDUCATION_LEVELS,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVEL_LABELS,
  EXPERIENCE_LEVELS,
  REMOTE_TYPE_LABELS,
  REMOTE_TYPES,
  REQUIREMENT_CATEGORIES,
  type JobDetailDto,
} from '@hireflow/shared';
import { AIBadge, AIDisclaimer, ErrorState, PageHeader, PageLoader } from '@/components/common';
import { FormError, FormField } from '@/components/forms';
import { applyServerErrors } from '@/lib/form-errors';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Switch,
  Textarea,
} from '@/components/ui';
import {
  useAnalyzeJob,
  useCreateJob,
  useJob,
  useJobTransition,
  useUpdateJob,
  type JobAnalysisResult,
} from '@/features/api/jobs';
import { RequirePermission } from '@/features/auth/guards';
import { useDocumentTitle } from '@/hooks/use-document-title';

type FormInput = z.input<typeof createJobSchema>;
type FormOutput = z.output<typeof createJobSchema>;

const numberOrNull = (value: unknown) =>
  value === '' || value === null || value === undefined ? null : Number(value);
const toOptions = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }));
const CATEGORY_OPTIONS = REQUIREMENT_CATEGORIES.map((c) => ({
  value: c,
  label: c
    .replace('_', ' ')
    .toLowerCase()
    .replace(/^\w/, (x) => x.toUpperCase()),
}));
const WEIGHT_OPTIONS = ['1', '2', '3', '4', '5'].map((w) => ({ value: w, label: `Weight ${w}` }));

const EMPTY: FormInput = {
  title: '',
  description: '',
  location: '',
  employmentType: 'FULL_TIME',
  experienceLevel: 'MID',
  remoteType: 'HYBRID',
  salaryMin: null,
  salaryMax: null,
  currency: 'USD',
  minYearsExperience: null,
  educationLevel: null,
  responsibilities: [],
  requirements: [],
  analysisSummary: null,
  keywords: [],
};

function fromJob(job: JobDetailDto): FormInput {
  return {
    title: job.title,
    description: job.description,
    location: job.location ?? '',
    employmentType: job.employmentType,
    experienceLevel: job.experienceLevel,
    remoteType: job.remoteType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    currency: job.currency,
    minYearsExperience: job.minYearsExperience,
    educationLevel: job.educationLevel,
    responsibilities: job.responsibilities,
    requirements: job.requirements.map((r) => ({
      skill: r.skill,
      category: r.category,
      required: r.required,
      weight: r.weight,
      minimumYears: r.minimumYears,
      aiGenerated: r.aiGenerated,
    })),
    analysisSummary: job.analysisSummary,
    keywords: job.keywords,
  };
}

function JobEditorForm({ job }: { job?: JobDetailDto }) {
  const navigate = useNavigate();
  const create = useCreateJob();
  const update = useUpdateJob(job?.id ?? '');
  const transition = useJobTransition();
  const analyze = useAnalyzeJob();
  const [analysis, setAnalysis] = React.useState<JobAnalysisResult | null>(null);
  const [responsibilitiesText, setResponsibilitiesText] = React.useState(
    (job?.responsibilities ?? []).join('\n'),
  );

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createJobSchema),
    defaultValues: job ? fromJob(job) : EMPTY,
  });
  const { errors, isSubmitting } = form.formState;
  const requirements = useFieldArray({ control: form.control, name: 'requirements' });

  const runAnalysis = async () => {
    const ok = await form.trigger(['title', 'description']);
    if (!ok) return;
    const { title, description } = form.getValues();
    const result = await analyze.mutateAsync({ title, description });
    const a = result.analysis;
    setAnalysis(result);
    requirements.replace([
      ...a.requiredSkills.map((r) => ({ ...r, required: true, aiGenerated: true })),
      ...a.preferredSkills.map((r) => ({ ...r, required: false, aiGenerated: true })),
    ]);
    form.setValue('analysisSummary', a.summary);
    form.setValue('keywords', a.keywords);
    if (a.minYearsExperience !== null) form.setValue('minYearsExperience', a.minYearsExperience);
    if (a.educationLevel) form.setValue('educationLevel', a.educationLevel);
    if (a.seniority) form.setValue('experienceLevel', a.seniority);
    if (a.remoteType) form.setValue('remoteType', a.remoteType);
    if (a.employmentType) form.setValue('employmentType', a.employmentType);
    if (a.location && !form.getValues('location')) form.setValue('location', a.location);
    if (a.responsibilities.length && !responsibilitiesText.trim())
      setResponsibilitiesText(a.responsibilities.join('\n'));
  };

  const save = (publish: boolean) =>
    form.handleSubmit(async (values) => {
      const payload = {
        ...values,
        location: values.location || null,
        responsibilities: responsibilitiesText
          .split('\n')
          .map((l) => l.replace(/^[-•*]\s*/, '').trim())
          .filter(Boolean)
          .slice(0, 30),
      };
      try {
        const saved = job ? await update.mutateAsync(payload) : await create.mutateAsync(payload);
        if (publish && saved.status !== 'PUBLISHED')
          await transition.mutateAsync({ id: saved.id, action: 'publish' });
        navigate(`/app/jobs/${saved.id}`);
      } catch (error) {
        if (!applyServerErrors(error, form.setError)) {
          form.setError('root', {
            message: error instanceof Error ? error.message : 'Could not save the job',
          });
        }
      }
    })();

  const requiredCount = form.watch('requirements')?.filter((r) => r.required !== false).length ?? 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
      noValidate
      className="grid gap-6 lg:grid-cols-[1fr_380px]"
    >
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Job details</CardTitle>
            <CardDescription>
              Write the description, then let AI extract structured requirements you can review.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormError error={errors.root?.message ? new Error(errors.root.message) : null} />
            <FormField id="title" label="Job title" required error={errors.title?.message}>
              <Input placeholder="e.g. Full Stack Developer" {...form.register('title')} />
            </FormField>
            <FormField
              id="description"
              label="Job description"
              required
              error={errors.description?.message}
              hint="Include responsibilities, requirements and nice-to-haves. Markdown lists are supported."
            >
              <Textarea
                rows={14}
                className="font-mono text-[13px]"
                {...form.register('description')}
              />
            </FormField>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="soft"
                onClick={() => void runAnalysis()}
                loading={analyze.isPending}
              >
                <WandSparkles />{' '}
                {analysis || job?.analysisStatus === 'COMPLETED'
                  ? 'Re-analyze with AI'
                  : 'Analyze with AI'}
              </Button>
              {analyze.isError && (
                <p className="text-sm text-destructive">{analyze.error.message}</p>
              )}
              {analysis && (
                <AIBadge provider={analysis.isHeuristic ? 'heuristic' : analysis.provider} />
              )}
            </div>
            <FormField id="responsibilities" label="Responsibilities" hint="One per line.">
              <Textarea
                rows={5}
                value={responsibilitiesText}
                onChange={(e) => setResponsibilitiesText(e.target.value)}
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Requirements</CardTitle>
              <CardDescription>
                Used for matching. Weight 5 = critical. Required skills count double.{' '}
                {requiredCount} required.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                requirements.append({
                  skill: '',
                  category: 'OTHER',
                  required: true,
                  weight: 3,
                  minimumYears: null,
                  aiGenerated: false,
                })
              }
            >
              <Plus /> Add
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {requirements.fields.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No requirements yet. Run AI analysis or add them manually — at least one is needed
                to publish.
              </p>
            )}
            {requirements.fields.map((field, index) => (
              <div
                key={field.id}
                className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_130px_110px_90px_auto_auto] sm:items-end"
              >
                <FormField
                  id={`req-${index}-skill`}
                  label="Skill"
                  error={errors.requirements?.[index]?.skill?.message}
                >
                  <Input {...form.register(`requirements.${index}.skill`)} />
                </FormField>
                <div className="space-y-1.5">
                  <Label htmlFor={`req-${index}-category`}>Category</Label>
                  <Controller
                    control={form.control}
                    name={`requirements.${index}.category`}
                    render={({ field: f }) => (
                      <Select
                        id={`req-${index}-category`}
                        value={f.value ?? 'OTHER'}
                        onValueChange={f.onChange}
                        options={CATEGORY_OPTIONS}
                      />
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`req-${index}-weight`}>Importance</Label>
                  <Controller
                    control={form.control}
                    name={`requirements.${index}.weight`}
                    render={({ field: f }) => (
                      <Select
                        id={`req-${index}-weight`}
                        value={String(f.value ?? 3)}
                        onValueChange={(v) => f.onChange(Number(v))}
                        options={WEIGHT_OPTIONS}
                      />
                    )}
                  />
                </div>
                <FormField id={`req-${index}-years`} label="Min. years">
                  <Input
                    type="number"
                    min={0}
                    max={30}
                    step={0.5}
                    {...form.register(`requirements.${index}.minimumYears`, {
                      setValueAs: numberOrNull,
                    })}
                  />
                </FormField>
                <div className="flex h-9 items-center gap-2">
                  <Controller
                    control={form.control}
                    name={`requirements.${index}.required`}
                    render={({ field: f }) => (
                      <Switch
                        id={`req-${index}-required`}
                        checked={f.value ?? true}
                        onCheckedChange={f.onChange}
                      />
                    )}
                  />
                  <Label htmlFor={`req-${index}-required`} className="text-xs font-normal">
                    Required
                  </Label>
                  {form.watch(`requirements.${index}.aiGenerated`) && (
                    <Badge variant="default" className="px-1.5">
                      <Sparkles />
                    </Badge>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => requirements.remove(index)}
                  aria-label={`Remove requirement ${index + 1}`}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {(analysis || form.watch('analysisSummary')) && (
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" /> AI analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">{form.watch('analysisSummary')}</p>
              {(form.watch('keywords')?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {form.watch('keywords')!.map((k) => (
                    <Badge key={k} variant="outline">
                      {k}
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Everything AI suggested is editable. Review requirements before publishing.
              </p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Role settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField id="location" label="Location" error={errors.location?.message}>
              <Input placeholder="e.g. Austin, TX or Remote (US)" {...form.register('location')} />
            </FormField>
            {(
              [
                ['remoteType', 'Workplace', toOptions(REMOTE_TYPES, REMOTE_TYPE_LABELS)],
                [
                  'employmentType',
                  'Employment type',
                  toOptions(EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS),
                ],
                [
                  'experienceLevel',
                  'Seniority',
                  toOptions(EXPERIENCE_LEVELS, EXPERIENCE_LEVEL_LABELS),
                ],
              ] as const
            ).map(([name, label, options]) => (
              <div key={name} className="space-y-1.5">
                <Label htmlFor={name}>{label}</Label>
                <Controller
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <Select
                      id={name}
                      value={field.value as string}
                      onValueChange={field.onChange}
                      options={options}
                    />
                  )}
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                id="minYearsExperience"
                label="Min. years"
                error={errors.minYearsExperience?.message}
              >
                <Input
                  type="number"
                  min={0}
                  max={40}
                  {...form.register('minYearsExperience', { setValueAs: numberOrNull })}
                />
              </FormField>
              <div className="space-y-1.5">
                <Label htmlFor="educationLevel">Education</Label>
                <Controller
                  control={form.control}
                  name="educationLevel"
                  render={({ field }) => (
                    <Select
                      id="educationLevel"
                      value={field.value ?? 'ANY'}
                      onValueChange={(v) => field.onChange(v === 'ANY' ? null : v)}
                      options={[
                        { value: 'ANY', label: 'Not specified' },
                        ...toOptions(EDUCATION_LEVELS, EDUCATION_LEVEL_LABELS),
                      ]}
                    />
                  )}
                />
              </div>
            </div>
            <div className="grid grid-cols-[1fr_1fr_80px] gap-3">
              <FormField id="salaryMin" label="Salary min" error={errors.salaryMin?.message}>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  {...form.register('salaryMin', { setValueAs: numberOrNull })}
                />
              </FormField>
              <FormField id="salaryMax" label="Salary max" error={errors.salaryMax?.message}>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  {...form.register('salaryMax', { setValueAs: numberOrNull })}
                />
              </FormField>
              <FormField id="currency" label="Currency" error={errors.currency?.message}>
                <Input maxLength={3} {...form.register('currency')} />
              </FormField>
            </div>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-2">
          <Button type="submit" variant="outline" loading={isSubmitting && !transition.isPending}>
            {job ? 'Save changes' : 'Save as draft'}
          </Button>
          {(!job || job.status !== 'PUBLISHED') && (
            <Button type="button" onClick={() => void save(true)} loading={isSubmitting}>
              {job ? 'Save & publish' : 'Create & publish'}
            </Button>
          )}
        </div>
        <AIDisclaimer compact />
      </div>
    </form>
  );
}

export default function JobEditorPage() {
  const { id } = useParams();
  const { data: job, isLoading, isError, error, refetch } = useJob(id);
  useDocumentTitle(id ? 'Edit job' : 'New job');

  return (
    <div>
      <PageHeader
        breadcrumb={
          <Link
            to={id ? `/app/jobs/${id}` : '/app/jobs'}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> {id ? 'Back to job' : 'Jobs'}
          </Link>
        }
        title={id ? `Edit ${job?.title ?? 'job'}` : 'Create a job'}
      />
      <RequirePermission permission="jobs:write">
        {id && isLoading ? (
          <PageLoader />
        ) : id && (isError || !job) ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : (
          <JobEditorForm key={job?.id ?? 'new'} {...(job ? { job } : {})} />
        )}
      </RequirePermission>
    </div>
  );
}
