/**
 * Sacred-geometry mandala (rosette) — the app's signature graphic.
 *
 * Pure vector: N equal circles whose centers sit on a ring, drawn over each
 * other, plus framing circles and a glowing core. Re-colorable via `colors`,
 * animatable — `motion="breathe"` for focal dials, `motion="rotate"` behind
 * cards. Fuzziness/glow comes from static SVG Gaussian-blur filters.
 *
 * `dynamicBlur` (breathe only): cross-fades a SHARP layer and a FUZZY layer by
 * opacity as it breathes — fuzzy when contracted, sharp when expanded. We
 * cross-fade opacity (GPU-composited, smooth) rather than animate the blur
 * filter itself (which re-rasterizes every frame and stutters).
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

/** One static rendering of the rosette at a given blur multiplier. */
function MandalaSvg({
  size,
  colors,
  opacity,
  glow,
  blurMul,
}: {
  size: number;
  colors: string[];
  opacity: number;
  glow: number;
  blurMul: number;
}) {
  const uid = useId().replace(/[:]/g, '');
  const grad = `mg_${uid}`;
  const bloom = `mb_${uid}`;
  const softF = `ms_${uid}`;
  const glowF = `mw_${uid}`;

  const circles = useMemo(
    () => [
      ...ringCircles(size, 24, 0.46, 0.46),
      ...ringCircles(size, 12, 0.3, 0.3, Math.PI / 12),
      ...ringCircles(size, 12, 0.62, 0.2),
    ],
    [size],
  );

  const c = size / 2;
  const sw = Math.max(0.6, size * 0.0034);
  const mid = colors[Math.floor(colors.length / 2)] ?? colors[0];
  const lineStd = size * 0.011 * blurMul;
  const softStd = Math.max(0.5, lineStd);
  const glowStd = Math.max(1.5, size * 0.026 * blurMul); // keep a soft halo even at zero line-blur
  const lineFilter = lineStd > 0.4 ? `url(#${softF})` : undefined; // blurMul 0 → crisp line-work

  return (
    <Svg width={size} height={size}>
      <Defs>
        <LinearGradient id={grad} x1="0" y1="0" x2={size} y2={size} gradientUnits="userSpaceOnUse">
          {colors.map((col, i) => (
            <Stop key={i} offset={i / (colors.length - 1)} stopColor={col} />
          ))}
        </LinearGradient>
        <RadialGradient id={bloom} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={mid} stopOpacity={glow * 0.5} />
          <Stop offset="0.7" stopColor={colors[0]} stopOpacity={glow * 0.14} />
          <Stop offset="1" stopColor={colors[0]} stopOpacity={0} />
        </RadialGradient>
        <Filter id={softF} x="-30%" y="-30%" width="160%" height="160%">
          <FeGaussianBlur in="SourceGraphic" stdDeviation={softStd} />
        </Filter>
        <Filter id={glowF} x="-60%" y="-60%" width="220%" height="220%">
          <FeGaussianBlur in="SourceGraphic" stdDeviation={glowStd} />
        </Filter>
      </Defs>

      <Circle cx={c} cy={c} r={c} fill={`url(#${bloom})`} />

      <G stroke={`url(#${grad})`} strokeWidth={sw * 2.2} fill="none" opacity={glow * 0.55} filter={`url(#${glowF})`}>
        {circles.map((o, i) => (
          <Circle key={`b${i}`} cx={o.cx} cy={o.cy} r={o.r} />
        ))}
      </G>

      <G stroke={`url(#${grad})`} strokeWidth={sw} fill="none" opacity={opacity} filter={lineFilter}>
        <Circle cx={c} cy={c} r={c * 0.84} />
        <Circle cx={c} cy={c} r={c * 0.97} />
        {circles.map((o, i) => (
          <Circle key={`c${i}`} cx={o.cx} cy={o.cy} r={o.r} />
        ))}
      </G>

      <Circle cx={c} cy={c} r={c * 0.05} fill={`url(#${grad})`} />
    </Svg>
  );
}

export function Mandala({
  size,
  colors = Gradients.spectral as unknown as string[],
  opacity = 0.5,
  glow = 0.6,
  motion = 'none',
  blur = 1,
  breatheMs = 7000,
  breatheRange = 0.12,
  dynamicBlur = false,
  style,
}: {
  size: number;
  colors?: string[];
  opacity?: number;
  glow?: number;
  motion?: Motion;
  /** Blur multiplier — <1 sharper, >1 fuzzier. */
  blur?: number;
  /** Breathe cycle duration (ms) — smaller is faster. */
  breatheMs?: number;
  /** Breathe scale swing — larger pulses bigger. */
  breatheRange?: number;
  /** Couple blur to the breath: fuzzy when contracted, sharp when expanded. */
  dynamicBlur?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const dyn = motion === 'breathe' && dynamicBlur;
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
      return {
        transform: [{ scale: 0.93 + breatheRange * t.value }],
        opacity: dyn ? 1 : 0.55 + 0.4 * t.value,
      };
    }
    if (motion === 'rotate' || motion === 'rotateReverse') {
      const dir = motion === 'rotateReverse' ? -1 : 1;
      return { transform: [{ rotate: `${dir * 360 * t.value}deg` }] };
    }
    return {};
  });

  // Cross-fade layers (only used when dyn): sharp shows as it expands, fuzzy as it contracts.
  const sharpStyle = useAnimatedStyle(() => ({ opacity: t.value }));
  const fuzzyStyle = useAnimatedStyle(() => ({ opacity: 1 - t.value }));

  return (
    <Animated.View style={[{ width: size, height: size }, outerStyle, style]}>
      {dyn ? (
        <>
          <Animated.View style={[styles.layer, fuzzyStyle]}>
            <MandalaSvg size={size} colors={colors} opacity={opacity} glow={glow} blurMul={2.6} />
          </Animated.View>
          <Animated.View style={[styles.layer, sharpStyle]}>
            <MandalaSvg size={size} colors={colors} opacity={opacity} glow={glow} blurMul={0} />
          </Animated.View>
        </>
      ) : (
        <MandalaSvg size={size} colors={colors} opacity={opacity} glow={glow} blurMul={blur} />
      )}
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
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
