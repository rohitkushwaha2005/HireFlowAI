import { zodResolver } from '@hookform/resolvers/zod';
import { Briefcase, UserRound } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { PASSWORD_MIN_LENGTH, registerSchema, type RegisterInput } from '@hireflow/shared';
import { FormError, FormField } from '@/components/forms';
import { applyServerErrors } from '@/lib/form-errors';
import { Button, Input } from '@/components/ui';
import { homePathFor, safeNextPath, useAuth } from '@/features/auth/use-auth';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { cn } from '@/lib/utils';
import { GoogleButton } from './login';

const ROLES = [
  {
    value: 'CANDIDATE',
    title: 'I’m looking for a job',
    description: 'Build your profile and apply',
    icon: UserRound,
  },
  {
    value: 'RECRUITER',
    title: 'I’m hiring',
    description: 'Create a workspace for your team',
    icon: Briefcase,
  },
] as const;

export default function RegisterPage() {
  useDocumentTitle('Create account');
  const { register: signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialRole = params.get('role') === 'recruiter' ? 'RECRUITER' : 'CANDIDATE';

  const form = useForm<z.input<typeof registerSchema>, unknown, RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      role: initialRole,
      organizationName: '',
    },
  });
  const { errors, isSubmitting } = form.formState;
  const role = form.watch('role');

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const session = await signUp(values);
      navigate(safeNextPath(params.get('next')) ?? homePathFor(session), { replace: true });
    } catch (error) {
      if (!applyServerErrors(error, form.setError)) {
        form.setError('root', {
          message: error instanceof Error ? error.message : 'Registration failed',
        });
      }
    }
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">Free for candidates and hiring teams.</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => (
            <div role="radiogroup" aria-label="Account type" className="grid grid-cols-2 gap-2">
              {ROLES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={field.value === option.value}
                  onClick={() => field.onChange(option.value)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    field.value === option.value
                      ? 'border-primary bg-accent ring-1 ring-primary'
                      : 'hover:bg-muted',
                  )}
                >
                  <option.icon className="mb-2 size-5 text-primary" />
                  <p className="text-sm font-medium">{option.title}</p>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </button>
              ))}
            </div>
          )}
        />
        <GoogleButton role={role} label="Sign up with Google" />
        <FormError error={errors.root?.message ? new Error(errors.root.message) : null} />
        <div className="grid grid-cols-2 gap-3">
          <FormField id="firstName" label="First name" error={errors.firstName?.message}>
            <Input autoComplete="given-name" {...form.register('firstName')} />
          </FormField>
          <FormField id="lastName" label="Last name" error={errors.lastName?.message}>
            <Input autoComplete="family-name" {...form.register('lastName')} />
          </FormField>
        </div>
        {role === 'RECRUITER' && (
          <FormField
            id="organizationName"
            label="Company name"
            error={errors.organizationName?.message}
          >
            <Input autoComplete="organization" {...form.register('organizationName')} />
          </FormField>
        )}
        <FormField id="email" label="Work email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...form.register('email')} />
        </FormField>
        <FormField
          id="password"
          label="Password"
          error={errors.password?.message}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters with upper and lower case letters and a number.`}
        >
          <Input type="password" autoComplete="new-password" {...form.register('password')} />
        </FormField>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
