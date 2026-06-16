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
    return e.errors[0]?.longMessage ?? e.errors[0]?.message ?? 'Something went wrong.';
  }
  return e instanceof Error ? e.message : 'Something went wrong.';
}

export default function SignIn() {
  const t = useTheme();
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();

  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    if (!isLoaded || !signIn) return;
    setBusy(true);
    setError(null);
    try {
      await signIn.create({ identifier: email.trim() });
      const factor = signIn.supportedFirstFactors?.find((f) => f.strategy === 'email_code');
      if (!factor || !('emailAddressId' in factor)) {
        throw new Error('Email-code sign-in is not available for this account.');
      }
      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: factor.emailAddressId,
      });
      setStage('code');
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!isLoaded || !signIn || !setActive) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signIn.attemptFirstFactor({ strategy: 'email_code', code: code.trim() });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        // The root navigator's auth effect routes to (tabs) once signed in.
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
            {stage === 'email' ? (
              <>
                <Text style={[styles.title, { color: t.text }]}>Sign in</Text>
                <Text style={[styles.sub, { color: t.textSecondary }]}>
                  Enter the email your provider invited. We&apos;ll send you a 6-digit code.
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@email.com"
                  placeholderTextColor={t.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  editable={!busy}
                  onSubmitEditing={sendCode}
                  style={[styles.input, { backgroundColor: t.surface, color: t.text }]}
                />
              </>
            ) : (
              <>
                <Text style={[styles.title, { color: t.text }]}>Enter your code</Text>
                <Text style={[styles.sub, { color: t.textSecondary }]}>
                  We sent a 6-digit code to <Text style={{ color: t.text }}>{email.trim()}</Text>
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
                  onSubmitEditing={verify}
                  style={[styles.input, styles.codeInput, { backgroundColor: t.surface, color: t.text }]}
                />
                <Pressable onPress={() => { setStage('email'); setCode(''); setError(null); }} hitSlop={8}>
                  <Text style={[styles.resend, { color: t.link }]}>
                    Didn&apos;t get it? Use a different email
                  </Text>
                </Pressable>
              </>
            )}

            {error ? <Text style={[styles.error, { color: t.danger }]}>{error}</Text> : null}
          </View>

          <View style={styles.footer}>
            {stage === 'email' ? (
              <Button
                label="Send code"
                onPress={sendCode}
                loading={busy}
                disabled={!email.includes('@')}
              />
            ) : (
              <Button label="Continue" onPress={verify} loading={busy} disabled={code.length !== 6} />
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
  codeInput: { letterSpacing: 8, fontSize: 22, textAlign: 'center' },
  resend: { fontSize: 14, marginTop: 20, textAlign: 'center' },
  error: { fontSize: 14, marginTop: 20 },
  footer: { paddingHorizontal: 24, paddingBottom: 24 },
});
