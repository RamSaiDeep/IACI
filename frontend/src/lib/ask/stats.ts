/**
 * Small deterministic statistics used by the Ask tools. No LLM ever computes
 * these; the model only receives the results.
 */

export function mean(values: (number | null | undefined)[]): number | null {
  let s = 0;
  let n = 0;
  for (const v of values) {
    if (v != null && !Number.isNaN(v)) {
      s += v;
      n++;
    }
  }
  return n ? s / n : null;
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 erf approximation). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export interface TrendResult {
  n: number;
  /** Sen's slope in value-units per step (here: per year). */
  slopePerYear: number | null;
  slopePerDecade: number | null;
  /** Mann-Kendall S statistic. */
  s: number | null;
  /** Two-sided p-value of the Mann-Kendall test (normal approximation, tie-corrected). */
  pValue: number | null;
  direction: "increasing" | "decreasing" | "no significant trend" | "insufficient data";
}

/**
 * Sen's slope + Mann-Kendall test on an annual series (x = year, y = value;
 * nulls are skipped, x values need not be contiguous).
 */
export function senMannKendall(
  points: { x: number; y: number | null }[],
  alpha = 0.05
): TrendResult {
  const pts = points.filter((p): p is { x: number; y: number } => p.y != null);
  const n = pts.length;
  if (n < 8) {
    return { n, slopePerYear: null, slopePerDecade: null, s: null, pValue: null, direction: "insufficient data" };
  }
  pts.sort((a, b) => a.x - b.x);

  const slopes: number[] = [];
  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = pts[j].x - pts[i].x;
      const dy = pts[j].y - pts[i].y;
      if (dx !== 0) slopes.push(dy / dx);
      s += Math.sign(dy);
    }
  }
  slopes.sort((a, b) => a - b);
  const mid = Math.floor(slopes.length / 2);
  const slope = slopes.length % 2 ? slopes[mid] : (slopes[mid - 1] + slopes[mid]) / 2;

  // Tie correction for the variance of S.
  const counts = new Map<number, number>();
  for (const p of pts) counts.set(p.y, (counts.get(p.y) ?? 0) + 1);
  let tieTerm = 0;
  for (const t of counts.values()) if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5);
  const variance = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  const z = s > 0 ? (s - 1) / Math.sqrt(variance) : s < 0 ? (s + 1) / Math.sqrt(variance) : 0;
  const p = 2 * (1 - normalCdf(Math.abs(z)));

  return {
    n,
    slopePerYear: slope,
    slopePerDecade: slope * 10,
    s,
    pValue: p,
    direction: p < alpha ? (slope > 0 ? "increasing" : "decreasing") : "no significant trend",
  };
}

/**
 * Rank of `value` among `all` where 1 = highest. Ties share the better rank.
 * `all` should include `value` itself.
 */
export function rankHighest(value: number, all: number[]): number {
  let higher = 0;
  for (const v of all) if (v > value) higher++;
  return higher + 1;
}

export function round(v: number | null, digits = 2): number | null {
  if (v == null) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
