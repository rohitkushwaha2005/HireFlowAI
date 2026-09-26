import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  changePasswordSchema,
  DEFAULT_MATCHING_WEIGHTS,
  normalizeWeights,
  type ChangePasswordInput,
  type MatchingWeights,
} from '@hireflow/shared';
import { ErrorState, PageHeader, PageLoader } from '@/components/common';
import { FormError, FormField } from '@/components/forms';
import { applyServerErrors } from '@/lib/form-errors';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Slider,
} from '@/components/ui';
import { useOrganization, useUpdateOrganization } from '@/features/api/misc';
import { useAuth } from '@/features/auth/use-auth';
import { Can } from '@/features/auth/guards';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { patch, post } from '@/lib/api';

const WEIGHT_LABELS: Record<keyof MatchingWeights, { label: string; hint: string }> = {
  skills: { label: 'Skills', hint: 'Coverage of required and preferred skills' },
  experience: { label: 'Experience', hint: 'Years of experience vs. the job minimum' },
  education: { label: 'Education', hint: 'Education level vs. the requirement' },
  semantic: { label: 'Semantic fit', hint: 'Similarity of background and job description' },
};

function OrganizationSettings() {
  const { data: org, isLoading, isError, error, refetch } = useOrganization();
  const update = useUpdateOrganization();
  const { can } = useAuth();
  const [name, setName] = React.useState('');
  const [weights, setWeights] = React.useState<MatchingWeights>(DEFAULT_MATCHING_WEIGHTS);

  React.useEffect(() => {
    if (org) {
      setName(org.name);
      setWeights(org.matchingWeights);
    }
  }, [org]);

  if (isLoading) return <PageLoader />;
  if (isError || !org) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const editable = can('org:update');
  const normalized = normalizeWeights(weights);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>Shown to candidates on the job board.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <FormField id="org-name" label="Name" className="flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} />
          </FormField>
          {editable && (
            <Button
              onClick={() => update.mutate({ name })}
              loading={update.isPending && !!name}
              disabled={name === org.name || name.trim().length < 2}
            >
              Save
            </Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Matching weights</CardTitle>
          <CardDescription>
            How much each component contributes to the overall match score. Weights are normalized
            to 100%. Saving recalculates every match in the background.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {(Object.keys(WEIGHT_LABELS) as Array<keyof MatchingWeights>).map((key) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor={`w-${key}`}>{WEIGHT_LABELS[key].label}</Label>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {Math.round(normalized[key] * 100)}%
                </span>
              </div>
              <Slider
                id={`w-${key}`}
                thumbLabel={`${WEIGHT_LABELS[key].label} weight`}
                min={0}
                max={100}
                step={5}
                disabled={!editable}
                value={[Math.round(weights[key] * 100)]}
                onValueChange={([v]) => setWeights((w) => ({ ...w, [key]: (v ?? 0) / 100 }))}
              />
              <p className="text-xs text-muted-foreground">{WEIGHT_LABELS[key].hint}</p>
            </div>
          ))}
          {editable && (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setWeights(DEFAULT_MATCHING_WEIGHTS)}>
                Reset to defaults
              </Button>
              <Button
                onClick={() => update.mutate({ matchingWeights: normalized })}
                loading={update.isPending}
              >
                Save weights
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export function AccountSettings() {
  const { me, reload } = useAuth();
  const [first, setFirst] = React.useState(me?.user.firstName ?? '');
  const [last, setLast] = React.useState(me?.user.lastName ?? '');
  const [saving, setSaving] = React.useState(false);
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const changePassword = form.handleSubmit(async (values) => {
    try {
      await post('/auth/change-password', values);
      toast.success('Password changed. Please sign in again on other devices.');
      form.reset();
      await reload().catch(() => undefined);
    } catch (error) {
      if (!applyServerErrors(error, form.setError))
        form.setError('root', { message: error instanceof Error ? error.message : 'Failed' });
    }
  });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Your account</CardTitle>
          <CardDescription>{me?.user.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="first" label="First name">
              <Input value={first} onChange={(e) => setFirst(e.target.value)} />
            </FormField>
            <FormField id="last" label="Last name">
              <Input value={last} onChange={(e) => setLast(e.target.value)} />
            </FormField>
          </div>
          <div className="flex justify-end">
            <Button
              loading={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await patch('/auth/me', { firstName: first, lastName: last });
                  await reload();
                  toast.success('Account updated');
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Update failed');
                } finally {
                  setSaving(false);
                }
              }}
            >
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Other sessions will be signed out.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-4" noValidate>
            <FormError error={errors.root?.message ? new Error(errors.root.message) : null} />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                id="currentPassword"
                label="Current password"
                error={errors.currentPassword?.message}
              >
                <Input
                  type="password"
                  autoComplete="current-password"
                  {...form.register('currentPassword')}
                />
              </FormField>
              <FormField id="newPassword" label="New password" error={errors.newPassword?.message}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  {...form.register('newPassword')}
                />
              </FormField>
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={isSubmitting}>
                Change password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

export default function SettingsPage() {
  useDocumentTitle('Settings');
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Organization preferences, matching configuration and your account."
      />
      <div className="max-w-3xl space-y-6">
        <Can permission="org:read">
          <OrganizationSettings />
        </Can>
        <AccountSettings />
      </div>
    </div>
  );
}
