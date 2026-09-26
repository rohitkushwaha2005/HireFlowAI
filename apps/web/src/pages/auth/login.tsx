import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { loginSchema, type LoginInput } from '@hireflow/shared';
import { FormError, FormField } from '@/components/forms';
import { Button, Input, Separator } from '@/components/ui';
import { useAuthConfig } from '@/features/api/jobs';
import { homePathFor, safeNextPath, useAuth } from '@/features/auth/use-auth';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { apiBaseUrl } from '@/lib/api';

export function GoogleButton({
  role = 'CANDIDATE',
  label = 'Continue with Google',
}: {
  role?: 'CANDIDATE' | 'RECRUITER';
  label?: string;
}) {
  const { data: config } = useAuthConfig();
  if (!config?.googleEnabled) return null;
  return (
    <>
      <Button variant="outline" className="w-full" asChild>
        <a href={`${apiBaseUrl}/auth/google?role=${role}`}>
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
            <path
              fill="#EA4335"
              d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z"
            />
          </svg>
          {label}
        </a>
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="flex-1" /> or <Separator className="flex-1" />
      </div>
    </>
  );
}

export default function LoginPage() {
  useDocumentTitle('Sign in');
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const session = await login(values);
      navigate(safeNextPath(params.get('next')) ?? homePathFor(session), { replace: true });
    } catch (error) {
      form.setError('root', { message: error instanceof Error ? error.message : 'Sign in failed' });
    }
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to your HireFlow AI account.</p>
      </div>
      {params.get('error') === 'google' && (
        <FormError error={new Error('Google sign-in failed. Please try again.')} />
      )}
      <GoogleButton />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError error={errors.root?.message ? new Error(errors.root.message) : null} />
        <FormField id="email" label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" autoFocus {...form.register('email')} />
        </FormField>
        <FormField id="password" label="Password" error={errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...form.register('password')} />
        </FormField>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        New to HireFlow?{' '}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
      {import.meta.env.DEV && (
        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Demo accounts (development only)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              ['Recruiter', 'recruiter@demo.hireflow.local'],
              ['Candidate', 'candidate@demo.hireflow.local'],
            ].map(([label, email]) => (
              <Button
                key={email}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  form.setValue('email', email!);
                  form.setValue('password', 'HireFlowDemo!2026');
                }}
              >
                Use {label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
