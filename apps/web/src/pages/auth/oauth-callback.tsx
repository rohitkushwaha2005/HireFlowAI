import * as React from 'react';
import { useNavigate } from 'react-router';
import { PageLoader } from '@/components/common';
import { homePathFor, useAuth } from '@/features/auth/use-auth';
import { refreshSession } from '@/lib/api';

/** Landing page after Google OAuth: the API set the refresh cookie; exchange it for a session. */
export default function OAuthCallbackPage() {
  const { applySession } = useAuth();
  const navigate = useNavigate();
  const done = React.useRef(false);

  React.useEffect(() => {
    if (done.current) return;
    done.current = true;
    void refreshSession().then((session) => {
      if (session) {
        applySession(session);
        navigate(homePathFor(session), { replace: true });
      } else {
        navigate('/login?error=google', { replace: true });
      }
    });
  }, [applySession, navigate]);

  return <PageLoader />;
}
