import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { LuCircleCheck } from 'react-icons/lu';
import { AuthLayout } from '@/components/auth-layout';
import { FormError } from '@/components/form-error';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { useAuthAction } from '@/lib/use-auth-action';

export function ResetPasswordPage() {
  const location = useLocation();
  const initial = (location.state as { email?: string } | null)?.email ?? '';
  const [email, setEmail] = useState(initial);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { busy, error, run, setBusy } = useAuthAction();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (await run(() => sendPasswordResetEmail(firebaseAuth(), address))) {
      setSentTo(address);
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <title>Reset password · YoungVista</title>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Reset your password</CardTitle>
          <CardDescription>We will email you a link to choose a new password.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FormError message={error} />
          {sentTo ? (
            <Alert>
              <LuCircleCheck aria-hidden />
              <AlertTitle>Check your email</AlertTitle>
              <AlertDescription>
                If there is an account for {sentTo}, a reset link is on its way. It can take a
                minute and may land in spam.
              </AlertDescription>
            </Alert>
          ) : null}
          <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
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
            <Button type="submit" size="lg" disabled={busy}>
              {sentTo ? 'Send again' : 'Send reset link'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <Link to="/sign-in" className="font-medium underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}
