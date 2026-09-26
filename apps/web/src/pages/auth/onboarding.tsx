import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { createOrganizationSchema, type CreateOrganizationInput } from '@hireflow/shared';
import { PageLoader } from '@/components/common';
import { FormError, FormField } from '@/components/forms';
import { applyServerErrors } from '@/lib/form-errors';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { post } from '@/lib/api';

/** Staff users without an organization (e.g. removed from their team) create a new workspace. */
export default function OnboardingPage() {
  useDocumentTitle('Create your workspace');
  const { status, isStaff, membership, reload } = useAuth();
  const navigate = useNavigate();
  const form = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: '' },
  });
  const { errors, isSubmitting } = form.formState;

  if (status === 'loading') return <PageLoader />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  if (!isStaff) return <Navigate to="/portal" replace />;
  if (membership) return <Navigate to="/app" replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await post('/organizations', values);
      await reload();
      navigate('/app', { replace: true });
    } catch (error) {
      if (!applyServerErrors(error, form.setError))
        form.setError('root', { message: error instanceof Error ? error.message : 'Failed' });
    }
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create your workspace</h1>
        <p className="text-sm text-muted-foreground">
          Your jobs, candidates and team live in an organization.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError error={errors.root?.message ? new Error(errors.root.message) : null} />
        <FormField id="name" label="Company name" error={errors.name?.message}>
          <Input autoFocus {...form.register('name')} />
        </FormField>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create workspace
        </Button>
      </form>
    </div>
  );
}
