import { AlertTriangle } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Button } from '@/components/ui';

/** Top-level error boundary for route rendering errors (including failed lazy chunk loads). */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';
  const chunkFailed = /dynamically imported module|Failed to fetch/i.test(message);
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"
      role="alert"
    >
      <AlertTriangle className="size-10 text-destructive" />
      <h1 className="text-xl font-semibold">
        {chunkFailed ? 'A new version is available' : 'Something went wrong'}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {chunkFailed ? 'Reload the page to get the latest version of HireFlow AI.' : message}
      </p>
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>Reload</Button>
        <Button variant="outline" asChild>
          <Link to="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
