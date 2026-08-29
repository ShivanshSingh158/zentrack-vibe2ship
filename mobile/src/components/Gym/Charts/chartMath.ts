/**
 * chartMath.ts — ZenTrack Mobile
 * Shared mathematical algorithms, SVG coordinate builders, and color interpolators for Gym charts.
 */

/** Epley 1-Rep Max formula */
export function calculate1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  return Math.round(weight * (1 + reps / 30));
}

/** Formats YYYY-MM-DD to "MMM D" e.g. "Jul 14" */
export function formatChartDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[(m || 1) - 1]} ${d || ''}`;
}

/** Calculates 4-level workout heatmap intensity */
export function getHeatmapIntensityColor(volume: number, isDark: boolean = true): string {
  if (volume <= 0) return isDark ? 'rgba(255,255,255,0.04)' : '#EAE9F2';
  if (volume < 1000) return isDark ? 'rgba(165,153,255,0.22)' : 'rgba(108,92,231,0.25)';
  if (volume < 3000) return isDark ? 'rgba(165,153,255,0.52)' : 'rgba(108,92,231,0.55)';
  return isDark ? '#a599ff' : '#059669';
}

/** Builds an SVG line path across an array of numeric values */
export function buildSvgLinePath(
  values: number[],
  width: number,
  height: number,
  maxVal: number,
  padX: number = 10,
  padY: number = 10
): string {
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const step = chartW / Math.max(values.length - 1, 1);

  return values
    .map((v, i) => {
      const x = padX + i * step;
      const y = padY + chartH - (maxVal > 0 ? (v / maxVal) * chartH : 0);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Builds a smooth cubic bezier SVG curve from points */
export function generateSmoothSvgPath(coords: { x: number; y: number }[]): string {
  if (!coords || coords.length === 0) return '';
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;

  let path = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const curr = coords[i];
    const next = coords[i + 1];
    const midX = (curr.x + next.x) / 2;
    path += ` C ${midX} ${curr.y}, ${midX} ${next.y}, ${next.x} ${next.y}`;
  }
  return path;
}
