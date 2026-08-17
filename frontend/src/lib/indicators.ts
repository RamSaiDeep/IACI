/**
 * Shared presentation metadata for the index and its components.
 *
 * Explore, Analyze and About all describe the same six indicators and colour
 * the same z-score scale, so the labels, accents and severity bands live here
 * rather than being restated (and drifting) in each page.
 */

import type { Field } from "./climate";

export interface Indicator {
  id: Field;
  /** Full label for dropdowns and legends. */
  name: string;
  /** Compact label for tight spaces. */
  short: string;
  desc: string;
  accent: string;
}

// Reporting order: composite first, then the five components as
// Tmax (T90S) / Tmin (T10S) / precipitation / wind / dry days. This is the
// single source of truth for that order — every dropdown, legend, table and
// chart toggle in the app maps over this array directly, so reordering here
// reorders everywhere at once.
export const INDICATORS: Indicator[] = [
  {
    id: "IACI",
    name: "IACI Composite",
    short: "IACI",
    desc: "Indian Actuaries Climate Index",
    accent: "#f26a21",
  },
  {
    id: "T90S",
    name: "Hot Extreme",
    short: "T90S",
    desc: "Extreme hot temperature anomaly",
    accent: "#f97316",
  },
  {
    id: "T10S",
    name: "Cold Extreme",
    short: "T10S",
    desc: "Extreme cold temperature anomaly",
    accent: "#0d9488",
  },
  {
    id: "PS",
    name: "Precipitation",
    short: "PS",
    desc: "Extreme precipitation anomaly",
    accent: "#2563eb",
  },
  {
    id: "W",
    name: "Wind Anomaly",
    short: "W",
    desc: "Extreme wind speed anomaly",
    accent: "#0284c7",
  },
  {
    id: "DS",
    name: "Dry Spell",
    short: "DS",
    desc: "Consecutive dry days anomaly",
    accent: "#d97706",
  },
];

/** The five components the composite averages, in reporting order. */
export const COMPONENTS = INDICATORS.filter((i) => i.id !== "IACI");

export function indicator(id: Field): Indicator {
  return INDICATORS.find((i) => i.id === id) ?? INDICATORS[0];
}

/** Scale bound for every bar and legend — z-scores are clamped to ±4. */
export const SCALE_MAX = 4;

export interface Severity {
  label: string;
  /** Badge classes: background, text and border together. */
  badge: string;
  /** Solid fill for bars. */
  bar: string;
  /** Text-only colour for figures. */
  text: string;
}

const SEVERITIES: { max: number; severity: Severity }[] = [
  {
    max: -1,
    severity: {
      label: "Below Normal",
      badge: "bg-teal-600/10 text-teal-800 border-teal-600/30",
      bar: "bg-teal-600",
      text: "text-teal-700",
    },
  },
  {
    max: 0,
    severity: {
      label: "Near Normal",
      badge: "bg-teal-400/15 text-teal-700 border-teal-400/30",
      bar: "bg-teal-400",
      text: "text-teal-600",
    },
  },
  {
    max: 1,
    severity: {
      label: "Moderate",
      badge: "bg-amber-400/15 text-amber-800 border-amber-400/40",
      bar: "bg-amber-400",
      text: "text-amber-600",
    },
  },
  {
    max: 2,
    severity: {
      label: "Elevated",
      badge: "bg-orange-500/15 text-orange-700 border-orange-500/30",
      bar: "bg-orange-500",
      text: "text-orange-600",
    },
  },
  {
    max: 3.5,
    severity: {
      label: "Severe",
      badge: "bg-rose-600/15 text-rose-700 border-rose-600/30",
      bar: "bg-rose-600",
      text: "text-rose-600",
    },
  },
];

const EXTREME: Severity = {
  label: "Extreme",
  badge: "bg-rose-950/15 text-rose-950 border-rose-950/30",
  bar: "bg-rose-950",
  text: "text-rose-950",
};

const NO_DATA: Severity = {
  label: "No Data",
  badge: "bg-foreground/5 text-foreground/40 border-foreground/10",
  bar: "bg-foreground/15",
  text: "text-foreground/35",
};

/** Severity band for a z-score. `null` maps to an explicit "No Data" band. */
export function severityOf(value: number | null | undefined): Severity {
  if (value == null || Number.isNaN(value)) return NO_DATA;
  return SEVERITIES.find((s) => value <= s.max)?.severity ?? EXTREME;
}

/** Signed, fixed-precision text for a z-score, or an em dash when absent. */
export function formatValue(
  value: number | null | undefined,
  digits = 2
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

/**
 * Continuous diverging colour for a z-score across [-4, +4]:
 * deep teal (cold/low) through a neutral cream at zero to deep wine (extreme).
 * Returns "transparent" for missing values so unshaded regions read as absent
 * rather than as a real reading of zero.
 */
export function colorForValue(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "transparent";

  const stops: [number, number, number, number, number][] = [
    [-4.0, 15, 118, 110, 0.95],
    [-2.0, 20, 184, 166, 0.7],
    [-0.5, 94, 234, 212, 0.45],
    [0.0, 254, 240, 138, 0.35],
    [0.5, 251, 146, 60, 0.45],
    [2.0, 225, 29, 72, 0.7],
    [4.0, 136, 19, 55, 0.95],
  ];

  const first = stops[0];
  const last = stops[stops.length - 1];
  if (value <= first[0]) return `rgba(${first[1]},${first[2]},${first[3]},${first[4]})`;
  if (value >= last[0]) return `rgba(${last[1]},${last[2]},${last[3]},${last[4]})`;

  for (let i = 0; i < stops.length - 1; i++) {
    const [z0, r0, g0, b0, a0] = stops[i];
    const [z1, r1, g1, b1, a1] = stops[i + 1];
    if (value >= z0 && value <= z1) {
      const t = (value - z0) / (z1 - z0);
      const r = Math.round(r0 + t * (r1 - r0));
      const g = Math.round(g0 + t * (g1 - g0));
      const b = Math.round(b0 + t * (b1 - b0));
      const a = +(a0 + t * (a1 - a0)).toFixed(2);
      return `rgba(${r},${g},${b},${a})`;
    }
  }
  return "transparent";
}

/** CSS gradient matching `colorForValue`, for legends. */
export const SCALE_GRADIENT =
  "linear-gradient(to right, rgba(15,118,110,0.95), rgba(20,184,166,0.7), rgba(94,234,212,0.45), rgba(254,240,138,0.5) 50%, rgba(251,146,60,0.45), rgba(225,29,72,0.7), rgba(136,19,55,0.95))";
