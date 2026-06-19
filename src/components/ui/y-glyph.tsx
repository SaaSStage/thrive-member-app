/**
 * The "Y" of the YOY / "You Only Younger" entry lockup. Custom vector so the
 * arms flow straight into the stem with flat (clipped) horizontal tops — the
 * deep royal-purple of the logo's "RADIO" lettering.
 */
import { useId } from 'react';
import Svg, { ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

export function YGlyph({ h }: { h: number }) {
  const w = h * 0.64;
  const sw = h * 0.155;
  const jx = w * 0.5;
  const jy = h * 0.52;
  const top = h * 0.05;
  const over = h * 0.17;
  const lx = w * 0.06;
  const rx = w * 0.94;
  const tt = (top - over - jy) / (top - jy);
  const slx = jx + tt * (lx - jx);
  const srx = jx + tt * (rx - jx);
  const sty = top - over;
  const d = `M${slx},${sty} L${jx},${jy} L${jx},${h} M${srx},${sty} L${jx},${jy}`;

  const uid = useId().replace(/[:]/g, '');
  const grad = `yg_${uid}`;
  const clip = `yc_${uid}`;

  return (
    <Svg width={w} height={h}>
      <Defs>
        <LinearGradient id={grad} x1="0" y1="0" x2={w * 0.5} y2={h} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#5e3897" />
          <Stop offset="0.5" stopColor="#331760" />
          <Stop offset="1" stopColor="#1e0c3d" />
        </LinearGradient>
        <ClipPath id={clip}>
          <Rect x={-30} y={top} width={w + 60} height={h} />
        </ClipPath>
      </Defs>
      {/* faint wide under-glow (no blur available in RN SVG) */}
      <Path d={d} stroke={`url(#${grad})`} strokeWidth={sw * 1.6} strokeLinejoin="round" fill="none" opacity={0.3} />
      {/* crisp glyph, tops clipped flat */}
      <G clipPath={`url(#${clip})`}>
        <Path
          d={d}
          stroke={`url(#${grad})`}
          strokeWidth={sw}
          strokeLinecap="butt"
          strokeLinejoin="round"
          fill="none"
        />
      </G>
    </Svg>
  );
}
