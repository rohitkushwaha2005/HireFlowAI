import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { PASSWORD_MIN_LENGTH, passwordSchema } from '@hireflow/shared';
import { EmptyState } from '@/components/common';
import { FormError, FormField } from '@/components/forms';
import { Button, Input } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { post } from '@/lib/api';

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], error: 'Passwords do not match' });
type Values = z.infer<typeof schema>;

/** Also used to accept team invitations (`?invite=1`), which set the first password. */
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const invite = params.get('invite') === '1';
  useDocumentTitle(invite ? 'Accept invitation' : 'Choose a new password');
  const [done, setDone] = React.useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      await post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (error) {
      form.setError('root', { message: error instanceof Error ? error.message : 'Could not reset password' });
    }
  });

  if (!token) {
    return <EmptyState title="Invalid link" description="This link is missing its token. Request a new one." action={<Button asChild><Link to="/forgot-password">Request a new link</Link></Button>} />;
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <h1 className="text-2xl font-semibold">{invite ? 'You’re all set' : 'Password updated'}</h1>
        <p className="text-sm text-muted-foreground">Sign in with your new password.</p>
        <Button asChild>
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{invite ? 'Join your team' : 'Choose a new password'}</h1>
        <p className="text-sm text-muted-foreground">{invite ? 'Set a password to activate your account.' : 'Signing in elsewhere will require the new password.'}</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError error={errors.root?.message ? new Error(errors.root.message) : null} />
        <FormField id="password" label="New password" error={errors.password?.message} hint={`At least ${PASSWORD_MIN_LENGTH} characters, mixed case and a number.`}>
          <Input type="password" autoComplete="new-password" autoFocus {...form.register('password')} />
        </FormField>
        <FormField id="confirm" label="Confirm password" error={errors.confirm?.message}>
          <Input type="password" autoComplete="new-password" {...form.register('confirm')} />
        </FormField>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          {invite ? 'Activate account' : 'Update password'}
        </Button>
      </form>
    </div>
  );
}
