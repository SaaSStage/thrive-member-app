import { isClerkAPIResponseError, useSignIn } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function toMessage(e: unknown): string {
  if (isClerkAPIResponseError(e)) {
    const code = e.errors[0]?.code;
    if (code === 'form_password_incorrect' || code === 'form_identifier_not_found') {
      return 'Invalid email/username or password.';
    }
    return e.errors[0]?.longMessage ?? e.errors[0]?.message ?? 'Something went wrong.';
  }
  return e instanceof Error ? e.message : 'Something went wrong.';
}

export default function SignIn() {
  const t = useTheme();
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();

  // Primary flow is identifier + password. `code` is only reached if the account
  // has email-code two-factor enabled (Clerk returns needs_second_factor).
  const [stage, setStage] = useState<'password' | 'code'>('password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithPassword() {
    if (!isLoaded || !signIn || !setActive) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signIn.create({ identifier: identifier.trim(), password });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        // The root navigator's auth effect routes to (tabs) once signed in.
        return;
      }
      if (result.status === 'needs_second_factor') {
        const sf = result.supportedSecondFactors?.find((f) => f.strategy === 'email_code');
        if (sf) {
          await signIn.prepareSecondFactor({ strategy: 'email_code' });
          setStage('code');
          return;
        }
        setError('Two-factor authentication is required but not available here.');
        return;
      }
      setError('Could not complete sign-in. Please try again.');
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (!isLoaded || !signIn || !setActive) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signIn.attemptSecondFactor({ strategy: 'email_code', code: code.trim() });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      } else {
        setError('Could not complete sign-in. Please try again.');
      }
    } catch (e) {
      setError(toMessage(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.fill, { backgroundColor: t.background }]}>
      <SafeAreaView style={styles.fill}>
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
            <Text style={[styles.backText, { color: t.link }]}>‹ Back</Text>
          </Pressable>

          <View style={styles.body}>
            {stage === 'password' ? (
              <>
                <Text style={[styles.title, { color: t.text }]}>Sign in</Text>
                <Text style={[styles.sub, { color: t.textSecondary }]}>
                  Use the email or username and password from your provider.
                </Text>
                <TextInput
                  value={identifier}
                  onChangeText={setIdentifier}
                  placeholder="Email or username"
                  placeholderTextColor={t.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  textContentType="username"
                  editable={!busy}
                  style={[styles.input, { backgroundColor: t.surface, color: t.text }]}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={t.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  autoComplete="current-password"
                  textContentType="password"
                  editable={!busy}
                  onSubmitEditing={signInWithPassword}
                  style={[styles.input, styles.inputSpaced, { backgroundColor: t.surface, color: t.text }]}
                />
              </>
            ) : (
              <>
                <Text style={[styles.title, { color: t.text }]}>Enter your code</Text>
                <Text style={[styles.sub, { color: t.textSecondary }]}>
                  Your account has two-factor sign-in. We sent a 6-digit code to your email.
                </Text>
                <TextInput
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  placeholderTextColor={t.textTertiary}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  editable={!busy}
                  onSubmitEditing={verifyCode}
                  style={[styles.input, styles.codeInput, { backgroundColor: t.surface, color: t.text }]}
                />
                <Pressable
                  onPress={() => {
                    setStage('password');
                    setCode('');
                    setError(null);
                  }}
                  hitSlop={8}>
                  <Text style={[styles.resend, { color: t.link }]}>‹ Back to password</Text>
                </Pressable>
              </>
            )}

            {error ? <Text style={[styles.error, { color: t.danger }]}>{error}</Text> : null}
          </View>

          <View style={styles.footer}>
            {stage === 'password' ? (
              <Button
                label="Sign in"
                onPress={signInWithPassword}
                loading={busy}
                disabled={identifier.trim().length === 0 || password.length === 0}
              />
            ) : (
              <Button label="Continue" onPress={verifyCode} loading={busy} disabled={code.length !== 6} />
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  back: { paddingHorizontal: 18, paddingTop: 8 },
  backText: { fontSize: 17 },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sub: { fontSize: 15, marginTop: 8, lineHeight: 21 },
  input: {
    height: 56,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    fontSize: 17,
    marginTop: 28,
  },
  inputSpaced: { marginTop: 14 },
  codeInput: { letterSpacing: 8, fontSize: 22, textAlign: 'center' },
  resend: { fontSize: 14, marginTop: 20, textAlign: 'center' },
  error: { fontSize: 14, marginTop: 20 },
  footer: { paddingHorizontal: 24, paddingBottom: 24 },
});
