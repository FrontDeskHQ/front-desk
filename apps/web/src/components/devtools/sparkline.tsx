"use client";

interface SparklineSeries {
  color: string;
  values: readonly number[];
}

interface SparklineProps {
  className?: string;
  max?: number;
  min?: number;
  series: readonly SparklineSeries[];
}

const WIDTH = 64;
const HEIGHT = 18;
const PADDING = 1;

const getPoints = (
  values: readonly number[],
  min: number,
  max: number,
  pointCount: number
) => {
  const range = Math.max(max - min, 1);

  return values
    .map((value, index) => {
      const x =
        pointCount === 1
          ? WIDTH / 2
          : PADDING + (index / (pointCount - 1)) * (WIDTH - PADDING * 2);
      const normalizedValue = Math.min(1, Math.max(0, (value - min) / range));
      const y = HEIGHT - PADDING - normalizedValue * (HEIGHT - PADDING * 2);

      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
};

export const Sparkline = ({ className, max, min, series }: SparklineProps) => {
  const values = series.flatMap((item) => item.values);
  const resolvedMin = min ?? Math.min(0, ...values);
  const resolvedMax = max ?? Math.max(1, ...values);
  const pointCount = Math.max(1, ...series.map((item) => item.values.length));

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      preserveAspectRatio="none"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      {series.map((item, index) => (
        <polyline
          key={`${item.color}-${index}`}
          points={getPoints(item.values, resolvedMin, resolvedMax, pointCount)}
          stroke={item.color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
};
