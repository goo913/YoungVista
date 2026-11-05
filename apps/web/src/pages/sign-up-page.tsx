import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
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

export function SignUpPage() {
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAuthAction();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password));
  };

  return (
    <AuthLayout>
      <title>Create an account · YoungVista</title>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create an account</CardTitle>
          <CardDescription>Use the same account on the phone app and here.</CardDescription>
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
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby="password-hint"
              />
              <p id="password-hint" className="text-xs text-muted-foreground">
                At least 6 characters.
              </p>
            </div>
            <Button type="submit" size="lg" disabled={busy}>
              Create account
            </Button>
          </form>
          <OrDivider />
          <GoogleButton onClick={() => void run(signInWithGoogle)} disabled={busy} />
        </CardContent>
        <CardFooter className="justify-center gap-1 text-muted-foreground">
          Already have an account?
          <Link
            to="/sign-in"
            state={location.state}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}
