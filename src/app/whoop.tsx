/**
 * WHOOP · Wearable home modal.
 *
 * Shows:
 *   - Live HRV · Bluetooth: connect/disconnect the WHOOP band for live BLE HRV
 *   - Link status: Connect / Connected (last-synced) / Reconnect (cloud sync)
 *   - Sync now button (when linked)
 *   - Disconnect (when linked)
 *   - 30-day recovery-score + HRV sparklines (when linked and data present)
 *
 * Glass-card aesthetic matches score.tsx / account.tsx.
 * Uses <Aura> as the animated background canvas.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useWhoopLinkStatus,
  useConnectWhoop,
  useUnlinkWhoop,
  useDailySync,
  useWhoopDailyData,
  useWhoopBody,
  useWhoopWeightHistory,
} from '@/api/whoop';
import { Aura } from '@/components/ui/aura';
import { Button } from '@/components/ui/button';
import { Sparkline } from '@/components/hrv/sparkline';
import { Gradients, Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { BleHrClient, type BleHrErrorCode } from '@/hrv/ble-hr';
import { useWearableStore } from '@/stores/wearable-store';

// ---- Relative time helper ---------------------------------------------------

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

const BLE_CONNECT_TIMEOUT_MS = 30_000;

const WHOOP_STEPS = [
  'Turn on Bluetooth on your phone.',
  'In the WHOOP app, tap the strap icon (top-right) → turn on Broadcast Heart Rate.',
  'Keep the band on your wrist and stay still.',
] as const;

function bleErrorMessage(code: BleHrErrorCode): string {
  switch (code) {
    case 'permission-denied':
      return 'Allow Bluetooth for THRIVE in Settings, then try again.';
    case 'bluetooth-off':
      return 'Turn on Bluetooth and try again.';
    case 'not-found':
      return 'No WHOOP found nearby — make sure it\'s on and broadcasting.';
    default:
      return 'Couldn\'t reach your WHOOP — check it\'s on and try again.';
  }
}

// ---- Screen -----------------------------------------------------------------

export default function WhoopScreen() {
  const t = useTheme();
  const router = useRouter();
  const { data: linkStatus, isLoading: statusLoading } = useWhoopLinkStatus();
  const connect = useConnectWhoop();
  const unlink = useUnlinkWhoop();
  const { triggerSync, syncing } = useDailySync();
  const { data: dailyRows } = useWhoopDailyData(30);
  const { data: bodyRow } = useWhoopBody();
  const { data: weightHistory } = useWhoopWeightHistory(180);

  const connected = useWearableStore((s) => s.connected);
  const setConnected = useWearableStore((s) => s.setConnected);

  // BLE connect-test state
  const [bleConnecting, setBleConnecting] = useState(false);
  const [bleError, setBleError] = useState<string | null>(null);
  const bleClientRef = useRef<BleHrClient | null>(null);
  const bleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const linked = linkStatus?.state === 'linked';
  const needsReauth = linkStatus?.state === 'reauth_required';

  const recoveryData = (dailyRows ?? [])
    .map((r) => r.recovery_score)
    .filter((v): v is number => v != null);
  const hrvData = (dailyRows ?? [])
    .map((r) => r.hrv_rmssd_ms)
    .filter((v): v is number => v != null);
  const weightData = (weightHistory ?? [])
    .map((r) => r.weight_kg)
    .filter((v): v is number => v != null);
  const currentWeightKg = bodyRow?.weight_kg ?? null;

  function stopBleProbe() {
    if (bleTimerRef.current) {
      clearTimeout(bleTimerRef.current);
      bleTimerRef.current = null;
    }
    if (bleClientRef.current) {
      void bleClientRef.current.stop();
      bleClientRef.current = null;
    }
  }

  function startBleConnect() {
    setBleError(null);
    setBleConnecting(true);
    stopBleProbe();

    const client = new BleHrClient({
      onStatus: (status) => {
        if (status === 'tracking') {
          // Successfully reached the HR service — band is connected.
          stopBleProbe();
          setConnected(true);
          setBleConnecting(false);
        }
      },
      onError: (code) => {
        stopBleProbe();
        setBleConnecting(false);
        setBleError(bleErrorMessage(code));
      },
    });
    bleClientRef.current = client;

    // Safety timeout — if we never reach 'tracking' within the window, give up.
    bleTimerRef.current = setTimeout(() => {
      stopBleProbe();
      setBleConnecting(false);
      setBleError('No WHOOP found nearby — make sure it\'s on and broadcasting.');
    }, BLE_CONNECT_TIMEOUT_MS);

    void client.start({ deviceNameHint: 'whoop' });
  }

  function handleDisconnect() {
    stopBleProbe();
    setConnected(false);
    setBleError(null);
  }

  return (
    <Aura>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: t.text }]}>WHOOP</Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={[styles.close, { color: t.link }]}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {/* ---- Live HRV · Bluetooth card ---- */}
          <View style={[styles.card, styles.glass]}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="pulse-outline" size={18} color={t.live} />
              <Text style={[styles.cardTitle, { color: t.text }]}>Live HRV · Bluetooth</Text>
            </View>

            {connected ? (
              <>
                <Text style={[styles.cardSub, { color: t.textSecondary }]}>
                  WHOOP band connected — live HRV is available while you listen.
                </Text>
                <Button
                  label="Disconnect"
                  variant="ghost"
                  onPress={handleDisconnect}
                  style={styles.ctaBtn}
                />
              </>
            ) : (
              <>
                <Text style={[styles.cardSub, { color: t.textSecondary }]}>
                  Connect your WHOOP band over Bluetooth to track live HRV while you listen.
                </Text>

                {bleConnecting ? (
                  <>
                    <View style={styles.connectingRow}>
                      <ActivityIndicator color={t.live} />
                      <Text style={[styles.connectingText, { color: t.textSecondary }]}>
                        Connecting…
                      </Text>
                    </View>
                    <View style={styles.steps}>
                      {WHOOP_STEPS.map((step, i) => (
                        <View key={i} style={styles.stepRow}>
                          <View style={[styles.stepNum, { borderColor: 'rgba(94,234,212,0.5)' }]}>
                            <Text style={[styles.stepNumText, { color: t.live }]}>{i + 1}</Text>
                          </View>
                          <Text style={[styles.stepText, { color: t.textSecondary }]}>{step}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : (
                  <Button
                    label="Connect your WHOOP band"
                    variant="primary"
                    onPress={startBleConnect}
                    style={styles.ctaBtn}
                  />
                )}

                {bleError ? (
                  <Text style={[styles.errorText, { color: t.danger }]}>{bleError}</Text>
                ) : null}
              </>
            )}
          </View>

          {/* ---- Link status card ---- */}
          <View style={[styles.card, styles.glass]}>
            <Text style={[styles.cardTitle, { color: t.text }]}>Wearable</Text>
            <Text style={[styles.cardSub, { color: t.textSecondary }]}>
              {statusLoading
                ? 'Checking connection…'
                : linked
                  ? `Connected · synced ${relativeTime((linkStatus as { state: 'linked'; lastSyncedAt: string | null }).lastSyncedAt)}`
                  : needsReauth
                    ? 'Reconnect required — your session expired'
                    : 'Not connected'}
            </Text>

            {statusLoading ? (
              <ActivityIndicator color={t.primary} style={styles.statusSpinner} />
            ) : linked ? (
              <View style={styles.btnRow}>
                <Button
                  label={syncing ? 'Syncing…' : 'Sync now'}
                  variant="tint"
                  loading={syncing}
                  onPress={() => void triggerSync()}
                  style={styles.btnFlex}
                />
                <Button
                  label="Disconnect"
                  variant="ghost"
                  loading={unlink.isPending}
                  onPress={() => void unlink.mutateAsync()}
                  style={styles.btnFlex}
                />
              </View>
            ) : (
              <Button
                label={needsReauth ? 'Reconnect WHOOP' : 'Connect WHOOP'}
                variant="primary"
                loading={connect.isPending}
                onPress={() => void connect.mutateAsync()}
                style={styles.ctaBtn}
              />
            )}

            {connect.isError ? (
              <Text style={[styles.errorText, { color: t.danger }]}>
                {connect.error instanceof Error ? connect.error.message : 'Connection failed.'}
              </Text>
            ) : null}
            {unlink.isError ? (
              <Text style={[styles.errorText, { color: t.danger }]}>
                {unlink.error instanceof Error ? unlink.error.message : 'Disconnect failed.'}
              </Text>
            ) : null}
          </View>

          {/* ---- Recovery score sparkline ---- */}
          {linked && recoveryData.length >= 2 ? (
            <View style={[styles.card, styles.glass]}>
              <Text style={[styles.chartLabel, { color: t.textSecondary }]}>
                Recovery score · 30 days
              </Text>
              <Sparkline
                data={recoveryData}
                width={320}
                height={52}
                color={Gradients.score[0] as string}
                strokeWidth={2.4}
              />
              <View style={styles.chartFooter}>
                <Text style={[styles.chartStat, { color: t.text }]}>
                  {Math.round(recoveryData[recoveryData.length - 1])}
                </Text>
                <Text style={[styles.chartUnit, { color: t.textTertiary }]}>latest</Text>
              </View>
            </View>
          ) : null}

          {/* ---- HRV sparkline ---- */}
          {linked && hrvData.length >= 2 ? (
            <View style={[styles.card, styles.glass]}>
              <Text style={[styles.chartLabel, { color: t.textSecondary }]}>
                HRV (rMSSD ms) · 30 days
              </Text>
              <Sparkline
                data={hrvData}
                width={320}
                height={52}
                color={Gradients.teal[1] as string}
                strokeWidth={2.4}
              />
              <View style={styles.chartFooter}>
                <Text style={[styles.chartStat, { color: t.text }]}>
                  {Math.round(hrvData[hrvData.length - 1])}
                </Text>
                <Text style={[styles.chartUnit, { color: t.textTertiary }]}>ms · latest</Text>
              </View>
            </View>
          ) : null}

          {/* ---- Weight sparkline ---- */}
          {linked && weightData.length >= 2 ? (
            <View style={[styles.card, styles.glass]}>
              <Text style={[styles.chartLabel, { color: t.textSecondary }]}>
                Weight (kg) · 180 days
              </Text>
              <Sparkline
                data={weightData}
                width={320}
                height={52}
                color={Gradients.gold[1] as string}
                strokeWidth={2.4}
              />
              <View style={styles.chartFooter}>
                {currentWeightKg != null ? (
                  <>
                    <Text style={[styles.chartStat, { color: t.text }]}>
                      {currentWeightKg.toFixed(1)}
                    </Text>
                    <Text style={[styles.chartUnit, { color: t.textTertiary }]}>kg · latest</Text>
                  </>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* ---- Weight: current reading only (no sparkline yet) ---- */}
          {linked && weightData.length < 2 && currentWeightKg != null ? (
            <View style={[styles.card, styles.glass]}>
              <Text style={[styles.chartLabel, { color: t.textSecondary }]}>Weight</Text>
              <View style={styles.chartFooter}>
                <Text style={[styles.chartStat, { color: t.text }]}>
                  {currentWeightKg.toFixed(1)}
                </Text>
                <Text style={[styles.chartUnit, { color: t.textTertiary }]}>kg</Text>
              </View>
              <Text style={[styles.cardSub, { color: t.textTertiary, marginTop: 6 }]}>
                Trend builds after a few daily syncs.
              </Text>
            </View>
          ) : null}

          {/* ---- Empty state when linked but no data yet ---- */}
          {linked && recoveryData.length < 2 && hrvData.length < 2 ? (
            <View style={[styles.card, styles.glass]}>
              <Text style={[styles.cardSub, { color: t.textSecondary, textAlign: 'center' }]}>
                Sync your WHOOP to see your recovery &amp; HRV trends here.
              </Text>
            </View>
          ) : null}

          {/* ---- Explainer (always visible) ---- */}
          <View style={[styles.card, styles.glass]}>
            <Text style={[styles.cardTitle, { color: t.text }]}>About WHOOP · Tier 2</Text>
            <Text style={[styles.cardSub, { color: t.textSecondary }]}>
              Your recovery score, HRV, resting heart rate, sleep, and strain data are pulled
              once daily from your personal WHOOP account. Your WHOOP credentials are stored
              only on the server — never on this device.
            </Text>
          </View>

          {/* ---- BLE diagnostic entry (investigation tool) ---- */}
          <Button
            label="Run BLE Diagnostic"
            variant="ghost"
            onPress={() => router.push('/ble-diag' as Href)}
          />
        </ScrollView>
      </SafeAreaView>
    </Aura>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  title: { ...Type.largeTitle, fontSize: 26 },
  close: { ...Type.bodyStrong },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  glass: {
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
  },
  card: { borderRadius: Radius.xxl, padding: 18, marginBottom: 14 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  cardTitle: { ...Type.bodyStrong },
  cardSub: { ...Type.subhead, lineHeight: 19 },
  statusSpinner: { marginTop: 14 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btnFlex: { flex: 1 },
  ctaBtn: { marginTop: 14 },
  errorText: { ...Type.footnote, marginTop: 8 },
  connectingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  connectingText: { ...Type.subhead },
  steps: { marginTop: 16, gap: 12 },
  stepRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumText: { fontSize: 12, fontWeight: '700' },
  stepText: { ...Type.callout, lineHeight: 20, flex: 1 },
  chartLabel: { ...Type.subhead, marginBottom: 10 },
  chartFooter: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 },
  chartStat: { ...Type.numeral, fontSize: 26 },
  chartUnit: { ...Type.footnote },
});
