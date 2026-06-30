/**
 * Minimal live RMSSD sparkline — a single stretched SVG polyline over the recent
 * samples. No chart library in the project; this is a plain react-native-svg
 * <Path>, normalised to the recent min/max. Used inline on Now Playing and (tiny)
 * in the mini-player while tracking.
 */
import Svg, { Line, Path } from 'react-native-svg';

type SparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  /** Optional horizontal dashed reference line (data units), e.g. the HRV baseline. */
  baseline?: number;
  baselineColor?: string;
};

export function Sparkline({
  data,
  width = 280,
  height = 44,
  color = '#5eead4',
  strokeWidth = 2.4,
  baseline,
  baselineColor = 'rgba(255,255,255,0.32)',
}: SparklineProps) {
  if (data.length < 2) {
    return (
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" />
    );
  }

  const pad = Math.min(4, height / 6);
  // Fold the baseline into the domain so its reference line stays in view.
  const values = baseline != null ? [...data, baseline] : data;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const yFor = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);

  const d = data
    .map((v, i) => {
      const x = (width * i) / (data.length - 1);
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${yFor(v).toFixed(1)}`;
    })
    .join(' ');

  const baselineY = baseline != null ? yFor(baseline) : null;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {baselineY != null ? (
        <Line
          x1={0}
          y1={baselineY.toFixed(1)}
          x2={width}
          y2={baselineY.toFixed(1)}
          stroke={baselineColor}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      ) : null}
      <Path
        d={d}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
