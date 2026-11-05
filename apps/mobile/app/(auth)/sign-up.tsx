import { Link } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
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

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const { busy, error, run } = useAuthAction();

  const submit = () => {
    void run(() => createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password));
  };

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create an account</CardTitle>
          <CardDescription>Use the same account on the website and here.</CardDescription>
        </CardHeader>
        <CardContent className="gap-4">
          <FormError message={error} />
          <View className="gap-2">
            <Label nativeID="sign-up-email">Email</Label>
            <Input
              aria-labelledby="sign-up-email"
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
            <Label nativeID="sign-up-password">Password</Label>
            <Input
              ref={passwordRef}
              aria-labelledby="sign-up-password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={submit}
            />
            <Text className="text-muted-foreground text-xs">At least 6 characters.</Text>
          </View>
          <Button size="lg" onPress={submit} disabled={busy}>
            <Text>Create account</Text>
          </Button>
          <OrDivider />
          <GoogleButton onPress={() => void run(signInWithGoogle)} disabled={busy} />
        </CardContent>
        <CardFooter className="justify-center gap-1">
          <Text className="text-muted-foreground text-sm">Already have an account?</Text>
          <Link href="/sign-in" replace asChild>
            <Button variant="link" size="sm" className="h-auto px-0 py-0">
              <Text className="text-sm">Sign in</Text>
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}
