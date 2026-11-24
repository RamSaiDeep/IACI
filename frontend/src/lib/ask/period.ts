import { MONTH_NAMES, SEASONS, type SeasonName } from "./labels";

/** A calendar window plus an optional month filter (for seasons). */
export interface Period {
  /** YYYYMM inclusive. */
  start: number;
  end: number;
  /** Only these calendar months count (e.g. monsoon = 6..9). */
  months?: number[];
  label: string;
}

/** What the model / forms may pass. */
export interface PeriodSpec {
  year?: number;
  season?: SeasonName;
  /** First / last year of a multi-year window. */
  from_year?: number;
  to_year?: number;
  /** YYYYMM bounds, alternative to years. */
  start?: number;
  end?: number;
  /** Shortcut: the most recent N full years. */
  last_years?: number;
}

export function periodLabel(p: PeriodSpec, last: number): string {
  const seasonLabel = p.season ? SEASONS[p.season].label : null;
  if (p.start && p.end && !p.year) return `${fmt(p.start)} to ${fmt(p.end)}`;
  const y = p.year ?? null;
  if (y && seasonLabel) return `${seasonLabel} ${y}`;
  if (y) return `${y}`;
  if (p.last_years) return `last ${p.last_years} years`;
  if (p.from_year && p.to_year) return `${p.from_year}–${p.to_year}${seasonLabel ? ", " + seasonLabel : ""}`;
  return `1991–${Math.floor(last / 100)}`;
}

function fmt(ym: number): string {
  return `${MONTH_NAMES[(ym % 100) - 1]} ${Math.floor(ym / 100)}`;
}

/** Turn a loose spec into a concrete Period. `first`/`last` are the data's YYYYMM bounds. */
export function resolvePeriod(spec: PeriodSpec, first: number, last: number): Period {
  const lastYear = Math.floor(last / 100);
  const firstYear = Math.floor(first / 100);
  let start = first;
  let end = last;
  if (spec.start || spec.end) {
    start = spec.start ?? first;
    end = spec.end ?? last;
  } else if (spec.year) {
    start = spec.year * 100 + 1;
    end = spec.year * 100 + 12;
  } else if (spec.from_year || spec.to_year) {
    start = (spec.from_year ?? firstYear) * 100 + 1;
    end = (spec.to_year ?? lastYear) * 100 + 12;
  } else if (spec.last_years) {
    // Most recent N *full* calendar years.
    const endYear = last % 100 === 12 ? lastYear : lastYear - 1;
    start = (endYear - spec.last_years + 1) * 100 + 1;
    end = endYear * 100 + 12;
  }
  let months: number[] | undefined;
  if (spec.season) {
    months = [...SEASONS[spec.season].months];
    if (spec.season === "winter" && spec.year) {
      // Winter of year Y = Dec(Y-1), Jan(Y), Feb(Y).
      start = (spec.year - 1) * 100 + 12;
      end = spec.year * 100 + 2;
    }
  }
  start = Math.max(start, first);
  end = Math.min(end, last);
  return { start, end, months, label: periodLabel(spec, last) };
}

export function inPeriod(period: number, p: Period): boolean {
  if (period < p.start || period > p.end) return false;
  return !p.months || p.months.includes(period % 100);
}
