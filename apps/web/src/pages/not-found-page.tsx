import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { AuthLayout } from '@/components/auth-layout';

export function NotFoundPage() {
  return (
    <AuthLayout>
      <title>Page not found · YoungVista</title>
      <div className="grid gap-4 text-center">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground">The link may be old or mistyped.</p>
        <Button asChild>
          <Link to="/">Go to your rooms</Link>
        </Button>
      </div>
    </AuthLayout>
  );
}
