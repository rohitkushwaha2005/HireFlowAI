import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@hireflow/shared';
import { FormError, FormField } from '@/components/forms';
import { Button, Input } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { post } from '@/lib/api';

export default function ForgotPasswordPage() {
  useDocumentTitle('Forgot password');
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ email }) => {
    try {
      await post('/auth/forgot-password', { email });
      setSentTo(email);
    } catch (error) {
      form.setError('root', { message: error instanceof Error ? error.message : 'Request failed' });
    }
  });

  if (sentTo) {
    return (
      <div className="space-y-4 text-center">
        <MailCheck className="mx-auto size-10 text-primary" />
        <h1 className="text-2xl font-semibold">Check your inbox</h1>
        <p className="text-sm text-muted-foreground">
          If an account exists for <strong>{sentTo}</strong>, we sent a link to reset your password.
          It expires in one hour.
        </p>
        <Button variant="outline" asChild>
          <Link to="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we’ll send you a reset link.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError error={errors.root?.message ? new Error(errors.root.message) : null} />
        <FormField id="email" label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" autoFocus {...form.register('email')} />
        </FormField>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Send reset link
        </Button>
      </form>
      <p className="text-center text-sm">
        <Link to="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
