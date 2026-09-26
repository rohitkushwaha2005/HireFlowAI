import { QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { PageLoader } from '@/components/common';
import { TooltipProvider } from '@/components/ui';
import { AuthProvider } from '@/features/auth/auth-context';
import { GuestOnly, RequireAuth } from '@/features/auth/guards';
import { CandidateLayout } from '@/layouts/candidate-layout';
import { AuthLayout, PublicLayout } from '@/layouts/public-layout';
import { RecruiterLayout } from '@/layouts/recruiter-layout';
import { queryClient } from '@/lib/query-client';
import { RouteError } from '@/pages/route-error';

const page = (loader: () => Promise<{ default: React.ComponentType }>) => {
  const Component = React.lazy(loader);
  return (
    <React.Suspense fallback={<PageLoader />}>
      <Component />
    </React.Suspense>
  );
};

const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: '/', element: page(() => import('@/pages/public/landing')) },
          { path: '/jobs', element: page(() => import('@/pages/public/job-board')) },
          { path: '/jobs/:slug', element: page(() => import('@/pages/public/job-detail')) },
        ],
      },
      {
        element: <AuthLayout />,
        children: [
          {
            element: <GuestOnly />,
            children: [
              { path: '/login', element: page(() => import('@/pages/auth/login')) },
              { path: '/register', element: page(() => import('@/pages/auth/register')) },
              {
                path: '/forgot-password',
                element: page(() => import('@/pages/auth/forgot-password')),
              },
            ],
          },
          { path: '/reset-password', element: page(() => import('@/pages/auth/reset-password')) },
          { path: '/verify-email', element: page(() => import('@/pages/auth/verify-email')) },
          { path: '/auth/callback', element: page(() => import('@/pages/auth/oauth-callback')) },
          { path: '/onboarding', element: page(() => import('@/pages/auth/onboarding')) },
        ],
      },
      {
        path: '/app',
        element: <RequireAuth role="staff" />,
        children: [
          {
            element: <RecruiterLayout />,
            children: [
              { index: true, element: page(() => import('@/pages/recruiter/overview')) },
              { path: 'jobs', element: page(() => import('@/pages/recruiter/jobs')) },
              { path: 'jobs/new', element: page(() => import('@/pages/recruiter/job-editor')) },
              { path: 'jobs/:id', element: page(() => import('@/pages/recruiter/job-detail')) },
              {
                path: 'jobs/:id/edit',
                element: page(() => import('@/pages/recruiter/job-editor')),
              },
              { path: 'candidates', element: page(() => import('@/pages/recruiter/candidates')) },
              {
                path: 'candidates/:id',
                element: page(() => import('@/pages/recruiter/candidate-detail')),
              },
              {
                path: 'applications',
                element: page(() => import('@/pages/recruiter/applications')),
              },
              {
                path: 'applications/:id',
                element: page(() => import('@/pages/recruiter/application-detail')),
              },
              { path: 'interviews', element: page(() => import('@/pages/recruiter/interviews')) },
              { path: 'analytics', element: page(() => import('@/pages/recruiter/analytics')) },
              { path: 'copilot', element: page(() => import('@/pages/recruiter/copilot')) },
              { path: 'team', element: page(() => import('@/pages/recruiter/team')) },
              { path: 'settings', element: page(() => import('@/pages/recruiter/settings')) },
            ],
          },
        ],
      },
      {
        path: '/portal',
        element: <RequireAuth role="candidate" />,
        children: [
          {
            element: <CandidateLayout />,
            children: [
              { index: true, element: page(() => import('@/pages/candidate/dashboard')) },
              { path: 'jobs', element: page(() => import('@/pages/public/job-board')) },
              { path: 'jobs/:slug', element: page(() => import('@/pages/public/job-detail')) },
              {
                path: 'applications',
                element: page(() => import('@/pages/candidate/applications')),
              },
              {
                path: 'applications/:id',
                element: page(() => import('@/pages/candidate/application-detail')),
              },
              { path: 'profile', element: page(() => import('@/pages/candidate/profile')) },
              { path: 'resume', element: page(() => import('@/pages/candidate/resume')) },
              { path: 'interviews', element: page(() => import('@/pages/candidate/interviews')) },
              { path: 'settings', element: page(() => import('@/pages/candidate/settings')) },
            ],
          },
        ],
      },
      { path: '/dashboard', element: <Navigate to="/app" replace /> },
      { path: '*', element: page(() => import('@/pages/not-found')) },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <RouterProvider router={router} />
          <Toaster richColors closeButton position="top-right" />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
