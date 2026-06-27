/**
 * BLE Diagnostic screen (investigation tool, not a member-facing feature).
 *
 * Runs a one-shot capture that interrogates every GATT channel on the WHOOP and
 * writes the result to `public.user_reports` (jsonb `playback_stats`) so it can be
 * read back and analysed. Reachable from the WHOOP screen.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSupabase } from '@/api/supabase';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { runBleDiagnostic, type DiagPayload } from '@/hrv/ble-diagnostic';

type Phase = 'idle' | 'running' | 'saving' | 'done' | 'error';

export default function BleDiag() {
  const t = useTheme();
  const router = useRouter();
  const supabase = useSupabase();

  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState('Make sure Broadcast Heart Rate is ON in the WHOOP app, then start.');
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function run() {
    setPhase('running');
    setSummary(null);
    setErrorMsg(null);
    let payload: DiagPayload;
    try {
      payload = await runBleDiagnostic({ durationMs: 60_000, onStatus: setStatus });
    } catch (e) {
      setPhase('error');
      setErrorMsg(e instanceof Error ? e.message : String(e));
      return;
    }

    setPhase('saving');
    setStatus('Saving capture to the database…');
    try {
      const { data: id, error: idErr } = await supabase.rpc('current_user_id');
      if (idErr || !id) throw idErr ?? new Error('Not signed in.');
      const { error } = await supabase.from('user_reports').insert({
        user_id: id,
        message: 'BLE HRV diagnostic capture',
        player_state: 'ble-diagnostic',
        playback_stats: payload,
      });
      if (error) throw error;
      setSummary((payload.counts as Record<string, number>) ?? {});
      setPhase('done');
      setStatus('Saved. Tell Claude you are done and the capture will be analysed.');
    } catch (e) {
      setPhase('error');
      setErrorMsg(e instanceof Error ? e.message : String(e));
      // Keep the counts visible even if the DB write failed.
      setSummary((payload.counts as Record<string, number>) ?? {});
    }
  }

  const busy = phase === 'running' || phase === 'saving';

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: t.background }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={[styles.back, { color: t.link }]}>‹ Back</Text>
        </Pressable>

        <Text style={[styles.title, { color: t.text }]}>BLE Diagnostic</Text>
        <Text style={[styles.sub, { color: t.textSecondary }]}>
          Connects to your WHOOP, listens on every Bluetooth channel for 60 seconds, and saves the raw
          result to the database for analysis. Sit still and quiet during the capture.
        </Text>

        <Pressable
          disabled={busy}
          onPress={run}
          style={[styles.btn, { backgroundColor: busy ? t.surface : t.tabActive, opacity: busy ? 0.7 : 1 }]}>
          {busy ? (
            <ActivityIndicator color={t.text} />
          ) : (
            <Text style={[styles.btnText, { color: busy ? t.text : '#0b0b12' }]}>
              {phase === 'done' ? 'Run again' : 'Start 60-second capture'}
            </Text>
          )}
        </Pressable>

        <Text style={[styles.status, { color: phase === 'error' ? t.danger : t.textSecondary }]}>{status}</Text>
        {errorMsg ? <Text style={[styles.status, { color: t.danger }]}>Error: {errorMsg}</Text> : null}

        {summary ? (
          <View style={[styles.card, { backgroundColor: t.surface }]}>
            <Text style={[styles.cardTitle, { color: t.text }]}>Capture summary</Text>
            {Object.entries(summary).map(([k, v]) => (
              <View key={k} style={styles.row}>
                <Text style={[styles.k, { color: t.textSecondary }]}>{k}</Text>
                <Text style={[styles.v, { color: t.text }]}>{String(v)}</Text>
              </View>
            ))}
            <Text style={[styles.hint, { color: t.textTertiary }]}>
              Full raw packets are saved in the report. The line that matters first:
              {'\n'}hr180d_packets_with_rr &gt; 0 means R-R is arriving on the standard channel.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: 20, gap: 14 },
  back: { fontSize: 16, marginBottom: 4 },
  title: { fontSize: 28, fontWeight: '700' },
  sub: { fontSize: 14, lineHeight: 20 },
  btn: { height: 52, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnText: { fontSize: 16, fontWeight: '700' },
  status: { fontSize: 13, lineHeight: 18 },
  card: { borderRadius: Radius.md, padding: 16, gap: 8, marginTop: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  k: { fontSize: 13 },
  v: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 8 },
});
