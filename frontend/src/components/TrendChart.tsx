"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MONTHS } from "../lib/climate";
import { WINDOW_MONTHS } from "../lib/trend";
import { indicator } from "../lib/indicators";
import type { Field } from "../lib/climate";
import type { TrendPoint } from "../lib/trend";

interface TrendChartProps {
  points: TrendPoint[];
  field: Field;
  /** Region the series describes, shown in the caption. */
  scope: string;
  /** Optional YYYYMM to mark, tying the chart to the page's month filter. */
  highlight?: number;
  loading?: boolean;
  className?: string;
  height?: number;
}

type SeriesKey = "average" | "positive" | "negative";

const SERIES: { key: SeriesKey; label: string; swatch: string }[] = [
  { key: "average", label: "5 year moving average", swatch: "var(--foreground)" },
  { key: "positive", label: "Positive index values", swatch: "rgba(225,29,72,0.8)" },
  { key: "negative", label: "Negative index values", swatch: "rgba(13,148,136,0.85)" },
];

const POSITIVE_FILL = "rgba(225,29,72,0.72)";
const NEGATIVE_FILL = "rgba(13,148,136,0.78)";

// Fallback viewBox width for the first paint, before the container is measured.
const W_DEFAULT = 1000;

/** Axis label size, in the same CSS pixels the viewBox is now measured in. */
const LABEL_PX = 11;

/**
 * Margins scale with the chart. A 46px gutter for the y labels is a rounding
 * error on a desktop chart and a fifth of the plot on a 320px phone, so the
 * narrow case gets a tighter gutter and the ticks that go with it.
 */
function marginsFor(width: number) {
  const narrow = width < 420;
  return { top: 16, right: narrow ? 10 : 14, bottom: 30, left: narrow ? 32 : 46 };
}

/**
 * The chart's own width in CSS pixels.
 *
 * The SVG used to draw into a fixed 1000-unit viewBox with
 * `preserveAspectRatio="none"`, which stretches the x axis to fit the
 * container: on a 360px phone every glyph was squashed to a third of its width
 * and the axis labels were unreadable. Measuring instead lets the viewBox match
 * the element 1:1, so a unit is a pixel, text renders at its true size, and the
 * bars are laid out against the width the chart actually has.
 */
function useMeasuredWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(W_DEFAULT);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const apply = (next: number) => {
      if (next > 0) setWidth((prev) => (Math.abs(prev - next) < 1 ? prev : next));
    };

    // Measure once, directly. ResizeObserver delivers its first callback as
    // part of the rendering lifecycle, which a background or hidden tab does
    // not run — a chart mounted there would otherwise sit on the placeholder
    // width until something resized it. This also avoids a first paint at the
    // wrong scale.
    apply(el.getBoundingClientRect().width);

    // Then track changes: a sidebar collapsing, the compare grid dropping to
    // one column, a phone rotating. Older browsers without ResizeObserver keep
    // the measured mount width, which is still correct for a static layout.
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => apply(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

export default function TrendChart({
  points,
  field,
  scope,
  highlight,
  loading = false,
  className = "",
  height = 320,
}: TrendChartProps) {
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    average: true,
    positive: true,
    negative: true,
  });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const W = useMeasuredWidth(plotRef);

  /**
   * Hiding the last visible series would leave an empty chart, so that click
   * restores all three instead.
   */
  const toggle = (key: SeriesKey) => {
    const next = { ...visible, [key]: !visible[key] };
    if (!next.average && !next.positive && !next.negative) {
      setVisible({ average: true, positive: true, negative: true });
    } else {
      setVisible(next);
    }
  };

  const H = height;
  const M = useMemo(() => marginsFor(W), [W]);
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const { yMin, yMax, hasData } = useMemo(() => {
    const shown: number[] = [];
    for (const p of points) {
      if (p.value != null) {
        if (p.value >= 0 && visible.positive) shown.push(p.value);
        if (p.value < 0 && visible.negative) shown.push(p.value);
      }
      if (p.average != null && visible.average) shown.push(p.average);
    }
    if (shown.length === 0) return { yMin: -1, yMax: 1, hasData: false };

    // Auto-scale to whatever is on screen — a single shared axis, so hiding the
    // bars lets the much smaller moving average fill the space and become
    // readable rather than sitting flat against zero.
    let lo = Math.min(0, ...shown);
    let hi = Math.max(0, ...shown);
    const pad = (hi - lo) * 0.08 || 0.1;
    lo -= pad;
    hi += pad;
    return { yMin: lo, yMax: hi, hasData: true };
  }, [points, visible]);

  const x = useCallback(
    (i: number) => M.left + (points.length <= 1 ? 0 : (i / (points.length - 1)) * plotW),
    [points.length, plotW, M.left]
  );
  const y = useCallback(
    (v: number) => M.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH,
    [plotH, yMin, yMax, M.top]
  );
  const barW = points.length > 0 ? Math.max(1, (plotW / points.length) * 0.8) : 1;
  const zeroY = y(0);

  // The moving average splits into a dashed ramp-up (fewer than WINDOW_MONTHS
  // of history) and a solid full-window segment, so the two are never confused.
  const { rampPath, fullPath } = useMemo(() => {
    const build = (filter: (p: TrendPoint, i: number) => boolean) => {
      let d = "";
      let open = false;
      points.forEach((p, i) => {
        if (p.average == null || !filter(p, i)) {
          open = false;
          return;
        }
        d += `${open ? "L" : "M"}${x(i).toFixed(2)},${y(p.average).toFixed(2)}`;
        open = true;
      });
      return d;
    };
    const lastPartial = points.findIndex((p) => !p.partial);
    return {
      rampPath: build((p) => p.partial),
      // Start one point early so the dashed and solid segments join up.
      fullPath: build((p, i) => !p.partial || (lastPartial > 0 && i === lastPartial - 1)),
    };
  }, [points, x, y]);

  const yTicks = useMemo(() => {
    const span = yMax - yMin;
    const step = span > 3 ? 1 : span > 1.4 ? 0.5 : span > 0.7 ? 0.25 : span > 0.3 ? 0.1 : 0.05;
    const ticks: number[] = [];
    for (let t = Math.ceil(yMin / step) * step; t <= yMax; t += step) {
      ticks.push(Math.abs(t) < step / 100 ? 0 : t);
    }
    return ticks;
  }, [yMin, yMax]);

  // Year labels are ~28px wide, so the interval has to come from the space the
  // chart actually has: a fixed 5-year step overlapped into an unreadable smear
  // once the compare grid put two charts side by side on a phone.
  const xTicks = useMemo(() => {
    const span = points.length / 12;
    if (span <= 0) return [];

    const maxLabels = Math.max(2, Math.floor(plotW / 46));
    const step = [1, 2, 5, 10, 20, 25, 50].find((s) => span / s <= maxLabels) ?? 50;

    return points
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.month === 1 && p.year % step === 1 % step);
  }, [points, plotW]);

  const highlightIdx = highlight
    ? points.findIndex((p) => p.period === highlight)
    : -1;

  const active = hoverIdx != null ? points[hoverIdx] : null;
  const { name, short } = indicator(field);

  // Pointer events rather than mouse events, so a finger drag reads values on a
  // touch screen exactly as a cursor does on a desktop.
  const handlePointer = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(ratio * (points.length - 1));
    setHoverIdx(idx >= 0 && idx < points.length ? idx : null);
  };

  // The ~420 monthly bars are the bulk of the DOM here, and they do not depend
  // on the hover position — keeping them in their own memo means moving the
  // pointer re-renders the guide line and the readout instead of every rect.
  const bars = useMemo(
    () =>
      points.map((p, i) => {
        if (p.value == null) return null;
        const isPositive = p.value >= 0;
        if (isPositive ? !visible.positive : !visible.negative) return null;
        const top = isPositive ? y(p.value) : zeroY;
        const h = Math.abs(y(p.value) - zeroY);
        return (
          <rect
            key={p.period}
            x={x(i) - barW / 2}
            y={top}
            width={barW}
            height={Math.max(h, 0.5)}
            fill={isPositive ? POSITIVE_FILL : NEGATIVE_FILL}
          />
        );
      }),
    [points, visible.positive, visible.negative, x, y, zeroY, barW]
  );

  return (
    <figure className={`card card-lg p-5 sm:p-6 flex flex-col gap-4 ${className}`}>
      <figcaption className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Long-run trend</span>
          <h3 className="text-base sm:text-lg font-extrabold uppercase tracking-tight leading-tight">
            {scope} — {name}
          </h3>
          <p className="text-[11px] text-foreground/55">
            Monthly {short} z-scores with a {WINDOW_MONTHS / 12}-year moving average.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SERIES.map((s) => (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              aria-pressed={visible[s.key]}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-colors ${
                visible[s.key]
                  ? "border-foreground/15 bg-surface text-foreground/80"
                  : "border-foreground/8 bg-foreground/3 text-foreground/35"
              }`}
            >
              <span
                aria-hidden="true"
                className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0"
                style={{
                  background: visible[s.key] ? s.swatch : "transparent",
                  boxShadow: visible[s.key] ? "none" : "inset 0 0 0 1.5px currentColor",
                }}
              />
              {s.label}
            </button>
          ))}
        </div>
      </figcaption>

      <div className="relative" ref={plotRef}>
        {loading ? (
          <div
            className="flex items-center justify-center rounded-xl bg-surface-muted/50"
            style={{ height }}
          >
            <span className="w-7 h-7 border-[3px] border-foreground/10 border-t-accent rounded-full animate-spin" />
          </div>
        ) : !hasData ? (
          <div
            className="flex items-center justify-center rounded-xl border border-dashed border-foreground/12"
            style={{ height }}
          >
            <span className="text-[11px] font-semibold tracking-widest text-foreground/40 uppercase">
              No {short} data for {scope}
            </span>
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="block w-full touch-pan-y"
              style={{ height }}
              role="img"
              aria-label={`${name} for ${scope}, monthly from ${points[0]?.year} to ${
                points[points.length - 1]?.year
              }, with a ${WINDOW_MONTHS / 12}-year moving average`}
            >
              {yTicks.map((t) => (
                <g key={t}>
                  <line
                    x1={M.left}
                    x2={W - M.right}
                    y1={y(t)}
                    y2={y(t)}
                    stroke="currentColor"
                    className={t === 0 ? "text-foreground/25" : "text-foreground/8"}
                    strokeWidth={t === 0 ? 1.25 : 1}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={M.left - 8}
                    y={y(t)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-foreground/45"
                    style={{ fontSize: LABEL_PX }}
                  >
                    {t === 0 ? "0" : t.toFixed(Math.abs(t) < 0.1 ? 2 : 1)}
                  </text>
                </g>
              ))}

              {xTicks.map(({ p, i }) => (
                <text
                  key={p.period}
                  x={x(i)}
                  y={H - 10}
                  textAnchor="middle"
                  className="fill-foreground/45"
                  style={{ fontSize: LABEL_PX }}
                >
                  {p.year}
                </text>
              ))}

              {highlightIdx >= 0 && (
                <line
                  x1={x(highlightIdx)}
                  x2={x(highlightIdx)}
                  y1={M.top}
                  y2={M.top + plotH}
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {bars}

              {/* Marks the hovered month. This replaces dimming every other bar,
                  which repainted the whole series on each pointer move. */}
              {hoverIdx != null && (
                <line
                  x1={x(hoverIdx)}
                  x2={x(hoverIdx)}
                  y1={M.top}
                  y2={M.top + plotH}
                  stroke="currentColor"
                  className="text-foreground/35"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {visible.average && (
                <>
                  <path
                    d={rampPath}
                    fill="none"
                    stroke="var(--foreground)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d={fullPath}
                    fill="none"
                    stroke="var(--foreground)"
                    strokeWidth={2.25}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}

              {active && active.average != null && visible.average && (
                <circle cx={x(hoverIdx!)} cy={y(active.average)} r={3.5} fill="var(--foreground)" />
              )}

              <rect
                x={M.left}
                y={M.top}
                width={plotW}
                height={plotH}
                fill="transparent"
                onPointerDown={handlePointer}
                onPointerMove={handlePointer}
                onPointerLeave={() => setHoverIdx(null)}
                onPointerCancel={() => setHoverIdx(null)}
              />
            </svg>

            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 mt-1 text-[11px]">
              <span className="text-foreground/45">
                Dashed: fewer than {WINDOW_MONTHS / 12} years of history (before{" "}
                {MONTHS[11].slice(0, 3)} {points[0]!.year + 4}).
              </span>
              {active ? (
                <span className="font-semibold tabular-nums">
                  {MONTHS[active.month - 1]} {active.year} ·{" "}
                  <span className={active.value != null && active.value < 0 ? "text-teal-700" : "text-rose-700"}>
                    {active.value == null ? "—" : active.value.toFixed(2)}
                  </span>
                  <span className="text-foreground/45"> · avg </span>
                  <span className="text-foreground">
                    {active.average == null ? "—" : active.average.toFixed(3)}
                  </span>
                </span>
              ) : (
                <span className="text-foreground/35">
                  <span className="hidden sm:inline">Hover</span>
                  <span className="sm:hidden">Touch</span> the chart for monthly values
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </figure>
  );
}
