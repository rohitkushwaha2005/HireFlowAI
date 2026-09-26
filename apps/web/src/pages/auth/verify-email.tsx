import { CheckCircle2, LoaderCircle, XCircle } from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui';
import { homePathFor, useAuth } from '@/features/auth/use-auth';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { errorMessage, post } from '@/lib/api';

export default function VerifyEmailPage() {
  useDocumentTitle('Verify email');
  const [params] = useSearchParams();
  const token = params.get('token');
  const { status, me, reload } = useAuth();
  const [state, setState] = React.useState<{ kind: 'loading' | 'done' | 'error'; message?: string }>({ kind: 'loading' });
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState({ kind: 'error', message: 'This verification link is missing its token.' });
      return;
    }
    post('/auth/verify-email', { token })
      .then(async () => {
        setState({ kind: 'done' });
        await reload().catch(() => undefined);
      })
      .catch((error: unknown) => setState({ kind: 'error', message: errorMessage(error) }));
  }, [token, reload]);

  return (
    <div className="space-y-4 text-center">
      {state.kind === 'loading' && (
        <>
          <LoaderCircle className="mx-auto size-10 animate-spin text-primary" />
          <h1 className="text-xl font-semibold">Verifying your email…</h1>
        </>
      )}
      {state.kind === 'done' && (
        <>
          <CheckCircle2 className="mx-auto size-10 text-success" />
          <h1 className="text-2xl font-semibold">Email verified</h1>
          <p className="text-sm text-muted-foreground">Thanks for confirming your email address.</p>
          <Button asChild>
            <Link to={status === 'authenticated' ? homePathFor(me) : '/login'}>Continue</Link>
          </Button>
        </>
      )}
      {state.kind === 'error' && (
        <>
          <XCircle className="mx-auto size-10 text-destructive" />
          <h1 className="text-2xl font-semibold">Verification failed</h1>
          <p className="text-sm text-muted-foreground">{state.message}</p>
          <Button variant="outline" asChild>
            <Link to="/">Go home</Link>
          </Button>
        </>
      )}
    </div>
  );
}
