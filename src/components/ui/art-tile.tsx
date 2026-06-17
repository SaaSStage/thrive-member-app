/**
 * Artwork tile. Solid color for now (derived deterministically from a seed so a
 * given station/playlist always gets the same color); designed so swapping to a
 * real gradient (expo-linear-gradient) later is a one-component change. Size
 * comes from `style`; pass `label` for an overlaid caption, or `icon` children.
 */
import { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Gradients, type GradientName, Radius } from '@/constants/theme';

const NAMES: GradientName[] = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  // Use the richer (second) stop of a deterministically-picked gradient.
  return Gradients[NAMES[h % NAMES.length]][1];
}

export function ArtTile({
  seed,
  style,
  radius = Radius.md,
  label,
  children,
}: {
  seed: string;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: colorFor(seed), borderRadius: radius },
        style,
      ]}>
      {children}
      {label ? (
        <Text style={styles.label} numberOfLines={2}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { overflow: 'hidden', justifyContent: 'flex-end', alignItems: 'flex-start' },
  label: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    padding: 10,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
});
