import { Link } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';
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
import { Text } from '@/components/ui/text';
import { firebaseAuth } from '@/lib/firebase';
import { signInWithGoogle } from '@/lib/google';
import { useAuthAction } from '@/lib/use-auth-action';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const { busy, error, run } = useAuthAction();

  const submit = () => {
    void run(() => signInWithEmailAndPassword(firebaseAuth(), email.trim(), password));
  };

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sign in</CardTitle>
          <CardDescription>Use the same account as on the website.</CardDescription>
        </CardHeader>
        <CardContent className="gap-4">
          <FormError message={error} />
          <View className="gap-2">
            <Label nativeID="sign-in-email">Email</Label>
            <Input
              aria-labelledby="sign-in-email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </View>
          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <Label nativeID="sign-in-password">Password</Label>
              <Link href={{ pathname: '/reset-password', params: { email: email.trim() } }} asChild>
                <Button variant="link" size="sm" className="h-auto px-0 py-0">
                  <Text className="text-sm">Forgot password?</Text>
                </Button>
              </Link>
            </View>
            <Input
              ref={passwordRef}
              aria-labelledby="sign-in-password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={submit}
            />
          </View>
          <Button size="lg" onPress={submit} disabled={busy}>
            <Text>Sign in</Text>
          </Button>
          <OrDivider />
          <GoogleButton onPress={() => void run(signInWithGoogle)} disabled={busy} />
        </CardContent>
        <CardFooter className="justify-center gap-1">
          <Text className="text-muted-foreground text-sm">New to YoungVista?</Text>
          <Link href="/sign-up" replace asChild>
            <Button variant="link" size="sm" className="h-auto px-0 py-0">
              <Text className="text-sm">Create an account</Text>
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}
