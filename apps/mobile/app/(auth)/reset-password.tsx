import { Link, useLocalSearchParams } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useState } from 'react';
import { View } from 'react-native';
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
import { Text } from '@/components/ui/text';
import { firebaseAuth } from '@/lib/firebase';
import { useAuthAction } from '@/lib/use-auth-action';

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { busy, error, run, setBusy } = useAuthAction();

  const submit = async () => {
    const address = email.trim();
    if (await run(() => sendPasswordResetEmail(firebaseAuth(), address))) {
      setSentTo(address);
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Reset your password</CardTitle>
          <CardDescription>We will email you a link to choose a new password.</CardDescription>
        </CardHeader>
        <CardContent className="gap-4">
          <FormError message={error} />
          {sentTo ? (
            <Alert icon={LuCircleCheck}>
              <AlertTitle>Check your email</AlertTitle>
              <AlertDescription>
                If there is an account for {sentTo}, a reset link is on its way. It can take a
                minute and may land in spam.
              </AlertDescription>
            </Alert>
          ) : null}
          <View className="gap-2">
            <Label nativeID="reset-email">Email</Label>
            <Input
              aria-labelledby="reset-email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={() => void submit()}
            />
          </View>
          <Button size="lg" onPress={() => void submit()} disabled={busy}>
            <Text>{sentTo ? 'Send again' : 'Send reset link'}</Text>
          </Button>
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/sign-in" replace asChild>
            <Button variant="link" size="sm" className="h-auto px-0 py-0">
              <Text className="text-sm">Back to sign in</Text>
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}
