/**
 * Bottom-sheet prompt shown when HRV is toggled on but the WHOOP isn't
 * connected (or Bluetooth is off / not found). Matches wireframe ①b.
 *
 * Props:
 *   visible  — controls the Modal's visibility.
 *   mode     — drives copy: 'connecting' | 'bluetooth-off' | 'no-rr' | 'not-found'
 *   onConnect — primary CTA: start scanning again.
 *   onClose  — dismiss (tap backdrop or cancel).
 */
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Mandala } from '@/components/ui/mandala';
import { Gradients, Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STEPS = [
  'Turn on Bluetooth on your phone.',
  'In the WHOOP app, tap the strap icon (top-right) → turn on Broadcast Heart Rate.',
  'Come back here — we’ll connect to your band automatically.',
] as const;

type Mode = 'connecting' | 'bluetooth-off' | 'permission-denied' | 'no-rr' | 'not-found';

function modeTitle(mode: Mode): string {
  switch (mode) {
    case 'connecting':
      return 'Connecting…';
    case 'bluetooth-off':
      return 'Bluetooth is off';
    case 'permission-denied':
      return 'Bluetooth access needed';
    case 'no-rr':
      return 'No heart-rate signal';
    case 'not-found':
      return 'WHOOP not found';
  }
}

function modeSubtitle(mode: Mode): string {
  switch (mode) {
    case 'connecting':
      return 'Looking for your WHOOP band…';
    case 'bluetooth-off':
      return 'Enable Bluetooth so we can connect to your WHOOP band.';
    case 'permission-denied':
      return 'Allow Bluetooth for THRIVE in Settings, then try again.';
    case 'no-rr':
      return 'We’re connected but not receiving R‑R intervals. Try holding still.';
    case 'not-found':
      return 'To track live HRV we need a quick Bluetooth connection to your band.';
  }
}

export function ConnectWhoopSheet({
  visible,
  mode,
  onConnect,
  onClose,
}: {
  visible: boolean;
  mode: Mode;
  onConnect: () => void;
  onClose: () => void;
}) {
  const t = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      {/* dim backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={[styles.sheet, { backgroundColor: '#100c1e', borderColor: t.hairline }]}>
        {/* drag handle */}
        <View style={styles.handleRow}>
          <View style={[styles.handle, { backgroundColor: t.textTertiary }]} />
        </View>

        {/* icon + title */}
        <View style={styles.iconWrap}>
          <Mandala
            size={96}
            colors={Gradients.teal as unknown as string[]}
            motion="breathe"
            opacity={0.6}
            glow={0.78}
            breatheMs={5600}
          />
          {/* ECG / heartbeat glyph centered over mandala */}
          <View style={styles.glyphOver} pointerEvents="none">
            <Text style={[styles.glyphText, { color: t.live }]}>♡</Text>
          </View>
        </View>

        <Text style={[styles.title, { color: t.text }]}>{modeTitle(mode)}</Text>
        <Text style={[styles.subtitle, { color: t.textSecondary }]}>{modeSubtitle(mode)}</Text>

        {/* numbered steps */}
        <View style={styles.steps}>
          {STEPS.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={[styles.stepNum, { borderColor: `rgba(94,234,212,0.5)` }]}>
                <Text style={[styles.stepNumText, { color: t.live }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: t.textSecondary }]}>{step}</Text>
            </View>
          ))}
        </View>

        {/* primary CTA */}
        <Pressable
          style={[styles.connectBtn]}
          onPress={onConnect}>
          <Text style={styles.connectBtnText}>Connect</Text>
        </Pressable>

        {/* open settings row — always shown; especially useful for bluetooth-off */}
        <Pressable
          style={styles.settingsRow}
          onPress={() => void Linking.openSettings()}>
          <Text style={[styles.settingsText, { color: t.textTertiary }]}>
            Bluetooth is off ·{' '}
            <Text style={{ color: t.live }}>Open Settings</Text>
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5,4,12,0.66)',
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    paddingHorizontal: 22,
    paddingBottom: 32,
  },
  handleRow: { alignItems: 'center', paddingTop: 14, paddingBottom: 4 },
  handle: { width: 38, height: 5, borderRadius: 3, opacity: 0.5 },
  iconWrap: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  glyphOver: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphText: { fontSize: 28 },
  title: { ...Type.sectionTitle, textAlign: 'center', marginTop: 10 },
  subtitle: { ...Type.body, textAlign: 'center', marginTop: 6, maxWidth: 286, alignSelf: 'center' },
  steps: { marginTop: 22, gap: 15 },
  stepRow: { flexDirection: 'row', gap: 13, alignItems: 'flex-start' },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumText: { fontSize: 13, fontWeight: '700' },
  stepText: { ...Type.callout, lineHeight: 20, flex: 1 },
  connectBtn: {
    marginTop: 24,
    height: 54,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5eead4',
  },
  connectBtnText: {
    ...Type.bodyStrong,
    fontSize: 16,
    color: '#0a0814',
  },
  settingsRow: { marginTop: 14, alignItems: 'center' },
  settingsText: { ...Type.footnote, textAlign: 'center' },
});
