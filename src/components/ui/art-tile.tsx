/**
 * Artwork tile — a dark glass tile with a slowly-rotating sacred-geometry
 * mandala, in a hue derived deterministically from `seed`. By default the
 * mandala is ghosted off the top-right corner (the card treatment); pass
 * `fill` for small circular art (avatar, mini-player) where it fills instead.
 */
import { useState, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { CardMandala, Mandala } from '@/components/ui/mandala';
import { ContentHues, Radius, Type } from '@/constants/theme';

function hueFor(seed: string): string[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ContentHues[h % ContentHues.length];
}

export function ArtTile({
  seed,
  style,
  radius = Radius.md,
  label,
  children,
  fill = false,
  colors,
}: {
  seed: string;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  label?: string;
  children?: ReactNode;
  fill?: boolean;
  colors?: string[];
}) {
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const hue = colors ?? hueFor(seed);
  const reverse = seed.charCodeAt(0) % 2 === 0;

  const onLayout = (e: LayoutChangeEvent) =>
    setDim({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const minD = Math.min(dim.w, dim.h);
  const maxD = Math.max(dim.w, dim.h);

  return (
    <View style={[styles.tile, { borderRadius: radius }, style]} onLayout={onLayout}>
      {minD > 0 ? (
        fill ? (
          <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
            <Mandala
              size={maxD * 1.4}
              colors={hue}
              opacity={0.5}
              glow={0.55}
              motion={reverse ? 'rotateReverse' : 'rotate'}
            />
          </View>
        ) : (
          <CardMandala colors={hue} size={minD * 1.65} reverse={reverse} opacity={0.42} glow={0.55} />
        )
      ) : null}
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
  tile: {
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  label: {
    ...Type.bodyStrong,
    color: '#fff',
    padding: 12,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
});
