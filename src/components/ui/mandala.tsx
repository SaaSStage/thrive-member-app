/**
 * Sacred-geometry mandala (rosette) — the app's signature graphic.
 *
 * Faithful port of the wireframe (docs/wireframes/screens-thrive-concept.html):
 * N equal circles whose centers sit on a ring, drawn over each other, plus two
 * framing circles and a glowing core. Each mandala is THREE stacked stroke
 * layers — a wide blurred glow + a medium blurred glow (brightness/bloom) under
 * an ALWAYS-CRISP top line (sharpness). That crisp-line-over-glow stack is what
 * reads as both sharp and bright, matching the wireframe.
 *
 * `motion="breathe"` pulses scale + opacity only (like the wireframe's keyframes)
 * — it never blurs the line. `motion="rotate"` slowly spins (clockwise).
 *
 * Re-colorable via `colors`. (`dynamicBlur`/`blur` are accepted for backward
 * compat but no longer do anything — the line is always crisp now.)
 */
import { useEffect, useId, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, FeGaussianBlur, Filter, G, LinearGradient, RadialGradient, Stop } from 'react-native-svg';

import { Gradients } from '@/constants/theme';

type Motion = 'none' | 'breathe' | 'rotate' | 'rotateReverse';

function ringCircles(size: number, n: number, dF: number, rF: number, phase = 0) {
  const c = size / 2;
  const d = (size / 2) * dF;
  const r = (size / 2) * rF;
  const out: { cx: number; cy: number; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n + phase;
    out.push({ cx: c + d * Math.cos(a), cy: c + d * Math.sin(a), r });
  }
  return out;
}

/** The static rosette: 2 glow layers under an always-crisp top line. */
function MandalaSvg({
  size,
  colors,
  opacity,
  glow,
}: {
  size: number;
  colors: string[];
  opacity: number;
  glow: number;
}) {
  const uid = useId().replace(/[:]/g, '');
  const grad = `mg_${uid}`;
  const bloom = `mbl_${uid}`;
  const wideF = `mw_${uid}`;
  const medF = `mm_${uid}`;

  const circles = useMemo(
    () => [
      ...ringCircles(size, 24, 0.46, 0.46),
      ...ringCircles(size, 12, 0.3, 0.3, Math.PI / 12),
      ...ringCircles(size, 12, 0.62, 0.2),
    ],
    [size],
  );

  const c = size / 2;
  const sw = Math.max(0.85, size * 0.0036); // crisp line stroke (wireframe ≈ size*0.003)
  const mid = colors[Math.floor(colors.length / 2)] ?? colors[0];
  const wideStd = size * 0.014; // wide glow blur (tighter → less wash over line-work)
  const medStd = size * 0.007; // medium glow blur
  const r84 = c * 0.84;
  const r97 = c * 0.97;

  // The geometry (framing circles + rosette) repeated per layer.
  const geometry = (keyPrefix: string) => (
    <>
      <Circle cx={c} cy={c} r={r84} />
      <Circle cx={c} cy={c} r={r97} />
      {circles.map((o, i) => (
        <Circle key={`${keyPrefix}${i}`} cx={o.cx} cy={o.cy} r={o.r} />
      ))}
    </>
  );

  return (
    <Svg width={size} height={size}>
      <Defs>
        <LinearGradient id={grad} x1="0" y1="0" x2={size} y2={size} gradientUnits="userSpaceOnUse">
          {colors.map((col, i) => (
            <Stop key={i} offset={i / (colors.length - 1)} stopColor={col} />
          ))}
        </LinearGradient>
        <RadialGradient id={bloom} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={mid} stopOpacity={glow * 0.55} />
          <Stop offset="0.65" stopColor={colors[0]} stopOpacity={glow * 0.16} />
          <Stop offset="1" stopColor={colors[0]} stopOpacity={0} />
        </RadialGradient>
        <Filter id={wideF} x="-60%" y="-60%" width="220%" height="220%">
          <FeGaussianBlur in="SourceGraphic" stdDeviation={wideStd} />
        </Filter>
        <Filter id={medF} x="-40%" y="-40%" width="180%" height="180%">
          <FeGaussianBlur in="SourceGraphic" stdDeviation={medStd} />
        </Filter>
      </Defs>

      {/* soft radial bloom backdrop (brightness) */}
      <Circle cx={c} cy={c} r={c} fill={`url(#${bloom})`} />

      {/* layer 1 — wide glow */}
      <G stroke={`url(#${grad})`} strokeWidth={sw * 1.8} fill="none" opacity={Math.min(1, glow * 0.55)} filter={`url(#${wideF})`}>
        {geometry('w')}
      </G>
      {/* layer 2 — medium glow */}
      <G stroke={`url(#${grad})`} strokeWidth={sw * 1.25} fill="none" opacity={Math.min(1, glow * 0.9)} filter={`url(#${medF})`}>
        {geometry('m')}
      </G>
      {/* layer 3 — CRISP top line (no filter, always sharp) */}
      <G stroke={`url(#${grad})`} strokeWidth={sw} fill="none" opacity={Math.min(1, opacity * 1.55)}>
        {geometry('s')}
      </G>

      {/* bright core */}
      <Circle cx={c} cy={c} r={c * 0.055} fill={`url(#${grad})`} />
    </Svg>
  );
}

export function Mandala({
  size,
  colors = Gradients.spectral as unknown as string[],
  opacity = 0.55,
  glow = 0.7,
  motion = 'none',
  breatheMs = 7000,
  breatheRange = 0.12,
  style,
}: {
  size: number;
  colors?: string[];
  opacity?: number;
  glow?: number;
  motion?: Motion;
  /** Breathe cycle duration (ms) — smaller is faster. */
  breatheMs?: number;
  /** Breathe scale swing — larger pulses bigger. */
  breatheRange?: number;
  /** @deprecated no-op — the line is always crisp now. */
  dynamicBlur?: boolean;
  /** @deprecated no-op — the line is always crisp now. */
  blur?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    if (motion === 'none') {
      t.value = 0;
      return;
    }
    const breathing = motion === 'breathe';
    t.value = withRepeat(
      withTiming(1, {
        duration: breathing ? breatheMs : 110000,
        easing: breathing ? Easing.inOut(Easing.sin) : Easing.linear,
      }),
      -1,
      breathing,
    );
  }, [motion, t, breatheMs]);

  const outerStyle = useAnimatedStyle(() => {
    if (motion === 'breathe') {
      // Wireframe breathe: scale 0.94→1.06 + opacity 0.7→1 (no blur).
      return {
        transform: [{ scale: 1 - breatheRange / 2 + breatheRange * t.value }],
        opacity: 0.72 + 0.28 * t.value,
      };
    }
    if (motion === 'rotate' || motion === 'rotateReverse') {
      const dir = motion === 'rotateReverse' ? -1 : 1;
      return { transform: [{ rotate: `${dir * 360 * t.value}deg` }] };
    }
    return {};
  });

  return (
    <Animated.View style={[{ width: size, height: size }, outerStyle, style]}>
      <MandalaSvg size={size} colors={colors} opacity={opacity} glow={glow} />
    </Animated.View>
  );
}

/**
 * A ghosted, slowly-rotating mandala anchored off the TOP-RIGHT corner of a
 * card (the wireframe's card-background treatment). Parent must clip overflow.
 */
export function CardMandala({
  colors,
  size = 200,
  reverse = false,
  opacity = 0.42,
  glow = 0.55,
}: {
  colors?: string[];
  size?: number;
  reverse?: boolean;
  opacity?: number;
  glow?: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={[styles.corner, { width: size, height: size, right: -size * 0.32, top: -size * 0.32 }]}>
      <Mandala
        size={size}
        colors={colors}
        opacity={opacity}
        glow={glow}
        motion={reverse ? 'rotateReverse' : 'rotate'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  corner: { position: 'absolute' },
});
