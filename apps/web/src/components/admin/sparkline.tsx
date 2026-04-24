interface Point {
  day: string;
  count: number;
}

interface Props {
  data: Point[];
  stroke?: string;
  fill?: string;
  height?: number;
}

/**
 * Minimal inline SVG sparkline — no client JS, no deps.
 * Renders a closed area path + line from a time-series of { day, count }.
 */
export function Sparkline({
  data,
  stroke = '#2563eb',
  fill = 'rgba(37, 99, 235, 0.12)',
  height = 60,
}: Props) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 text-[11px] text-slate-400"
        style={{ height }}
      >
        —
      </div>
    );
  }

  const width = 300;
  const max = Math.max(1, ...data.map((d) => d.count));
  const step = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data.map((d, i) => {
    const x = data.length === 1 ? width / 2 : i * step;
    const y = height - (d.count / max) * (height - 4) - 2;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L${points[points.length - 1]![0].toFixed(1)} ${height} L${points[0]![0].toFixed(1)} ${height} Z`;

  const total = data.reduce((s, d) => s + d.count, 0);
  const last = data[data.length - 1]!.count;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-[60px] w-full"
        aria-hidden="true"
      >
        <path d={areaPath} fill={fill} />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>total {total}</span>
        <span>last {last}</span>
      </div>
    </div>
  );
}
