/**
 * Minimal live RMSSD sparkline — a single stretched SVG polyline over the recent
 * samples. No chart library in the project; this is a plain react-native-svg
 * <Path>, normalised to the recent min/max. Used inline on Now Playing and (tiny)
 * in the mini-player while tracking.
 */
import Svg, { Path } from 'react-native-svg';

type SparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
};

function buildPath(data: number[], width: number, height: number): string | null {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = Math.min(4, height / 6);
  return data
    .map((v, i) => {
      const x = (width * i) / (data.length - 1);
      const y = height - pad - ((v - min) / span) * (height - pad * 2);
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function Sparkline({
  data,
  width = 280,
  height = 44,
  color = '#5eead4',
  strokeWidth = 2.4,
}: SparklineProps) {
  const d = buildPath(data, width, height);
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {d ? (
        <Path
          d={d}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </Svg>
  );
}
