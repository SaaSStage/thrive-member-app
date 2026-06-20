/**
 * Sleek line-art microphone — gradient stroke, rounded caps. Replaces the
 * cartoonish 🎙️ emoji on the voice-intro and score-empty screens.
 */
import { useId } from 'react';
import Svg, { Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

export function MicGlyph({
  size = 64,
  colors = ['#5eead4', '#a78bfa'],
}: {
  size?: number;
  colors?: string[];
}) {
  const w = size * 0.75;
  const uid = useId().replace(/[:]/g, '');
  const id = `mic_${uid}`;
  const sw = 2.6;
  const stroke = `url(#${id})`;
  return (
    <Svg width={w} height={size} viewBox="0 0 48 64">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={colors[0]} />
          <Stop offset="1" stopColor={colors[1] ?? colors[0]} />
        </LinearGradient>
      </Defs>
      {/* capsule body */}
      <Rect x="16" y="4" width="16" height="30" rx="8" fill="none" stroke={stroke} strokeWidth={sw} />
      {/* cradle */}
      <Path d="M10 28 a14 14 0 0 0 28 0" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
      {/* stand + base */}
      <Line x1="24" y1="42" x2="24" y2="55" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
      <Line x1="15" y1="56" x2="33" y2="56" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  );
}
