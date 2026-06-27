/**
 * WHOOP · Wearable home modal.
 *
 * Shows:
 *   - Link status: Connect / Connected (last-synced) / Reconnect
 *   - Sync now button (when linked)
 *   - Disconnect (when linked)
 *   - 30-day recovery-score + HRV sparklines (when linked and data present)
 *
 * Glass-card aesthetic matches score.tsx / account.tsx.
 * Uses <Aura> as the animated background canvas.
 */
import { useRouter, type Href } from 'expo-router';
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
  cardTitle: { ...Type.bodyStrong, marginBottom: 4 },
  cardSub: { ...Type.subhead, lineHeight: 19 },
  statusSpinner: { marginTop: 14 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btnFlex: { flex: 1 },
  ctaBtn: { marginTop: 14 },
  errorText: { ...Type.footnote, marginTop: 8 },
  chartLabel: { ...Type.subhead, marginBottom: 10 },
  chartFooter: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 },
  chartStat: { ...Type.numeral, fontSize: 26 },
  chartUnit: { ...Type.footnote },
});
