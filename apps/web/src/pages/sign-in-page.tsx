import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { AuthLayout } from '@/components/auth-layout';
import { FormError } from '@/components/form-error';
import { GoogleButton } from '@/components/google-button';
import { OrDivider } from '@/components/or-divider';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { firebaseAuth } from '@/lib/firebase';
import { signInWithGoogle } from '@/lib/google';
import { useAuthAction } from '@/lib/use-auth-action';

export function SignInPage() {
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAuthAction();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => signInWithEmailAndPassword(firebaseAuth(), email.trim(), password));
  };

  return (
    <AuthLayout>
      <title>Sign in · YoungVista</title>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sign in</CardTitle>
          <CardDescription>Welcome back. Sign in to see your rooms.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FormError message={error} />
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/reset-password"
                  state={{ email }}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" size="lg" disabled={busy}>
              Sign in
            </Button>
          </form>
          <OrDivider />
          <GoogleButton onClick={() => void run(signInWithGoogle)} disabled={busy} />
        </CardContent>
        <CardFooter className="justify-center gap-1 text-muted-foreground">
          New to YoungVista?
          <Link
            to="/sign-up"
            state={location.state}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}
