/**
 * Moving-average series for the trend charts.
 *
 * The index is reported monthly, so a "5 year moving average" is a 60-month
 * window. It is trailing (right-aligned): the value at month t averages
 * t-59 … t. A centred window would need 30 months of future data and would
 * stop the line 2.5 years short of the newest observation.
 *
 * A plain mean is the right smoother here. Values are z-scores already
 * standardized per calendar month against 1991–2020, so the seasonal cycle is
 * removed by construction, and 60 is a multiple of 12 — every calendar month
 * enters each window exactly five times, so the line cannot drift merely
 * because the window slid from a winter month to a summer one.
 */

import { FIELDS, monthOf, yearOf } from "./climate";
import type { Field, Series } from "./climate";

/** Months in the averaging window: 5 years of monthly observations. */
export const WINDOW_MONTHS = 60;

export interface TrendPoint {
  /** YYYYMM. */
  period: number;
  year: number;
  month: number;
  /** The raw monthly z-score, or null when unmeasured. */
  value: number | null;
  /** Moving average ending at this month, or null when nothing to average. */
  average: number | null;
  /**
   * True while fewer than WINDOW_MONTHS of history exist (before Dec 1995).
   * These points average a growing window rather than a full five years, so
   * the chart draws them dashed.
   */
  partial: boolean;
}

/**
 * Build the raw + smoothed series for one field, oldest first.
 *
 * Uses a growing window for the first WINDOW_MONTHS-1 months so the line spans
 * the full record; those points are flagged `partial`. Nulls are excluded from
 * each window rather than treated as zero, and a window with no observations
 * yields null so the line breaks instead of inventing a value.
 */
export function buildTrend(series: Series, field: Field): TrendPoint[] {
  const periods = [...series.keys()].sort((a, b) => a - b);
  const values = periods.map((p) => series.get(p)?.[field] ?? null);

  // Prefix sums over non-null observations make each window O(1).
  const sums = new Float64Array(values.length + 1);
  const counts = new Int32Array(values.length + 1);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    sums[i + 1] = sums[i] + (v ?? 0);
    counts[i + 1] = counts[i] + (v == null ? 0 : 1);
  }

  return periods.map((period, i) => {
    const start = Math.max(0, i - WINDOW_MONTHS + 1);
    const n = counts[i + 1] - counts[start];
    return {
      period,
      year: yearOf(period),
      month: monthOf(period),
      value: values[i],
      average: n > 0 ? (sums[i + 1] - sums[start]) / n : null,
      partial: i < WINDOW_MONTHS - 1,
    };
  });
}

/** True when a region carries no observation at all for any component. */
export function isEmptySeries(series: Series | null | undefined): boolean {
  if (!series) return true;
  for (const values of series.values()) {
    if (FIELDS.some((f) => values[f] != null)) return false;
  }
  return true;
}
