import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/use-document-title';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <Compass className="size-10 text-primary" />
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">The page you’re looking for doesn’t exist or was moved.</p>
      <Button asChild>
        <Link to="/">Back to home</Link>
      </Button>
    </div>
  );
}
