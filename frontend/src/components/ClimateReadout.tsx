import {
  COMPONENTS,
  SCALE_MAX,
  formatValue,
  severityOf,
} from "../lib/indicators";
import type { Values } from "../lib/climate";

/**
 * Zero-centred diverging bar. The track spans [-SCALE_MAX, +SCALE_MAX] with the
 * baseline down the middle, so sign reads as direction and magnitude as length.
 */
function ValueBar({ value }: { value: number | null }) {
  const severity = severityOf(value);
  const clamped = value == null ? 0 : Math.max(-SCALE_MAX, Math.min(SCALE_MAX, value));
  const widthPct = (Math.abs(clamped) / SCALE_MAX) * 50;
  const isNegative = clamped < 0;

  return (
    <div className="w-full h-2.5 bg-foreground/6 rounded-full overflow-hidden relative">
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-foreground/25 z-10 -translate-x-1/2" />
      {value != null && (
        <div
          className={`h-full absolute transition-[width,left] duration-300 ${severity.bar} ${
            isNegative ? "rounded-l-full" : "rounded-r-full"
          }`}
          style={{
            left: isNegative ? `${50 - widthPct}%` : "50%",
            width: `${widthPct}%`,
          }}
        />
      )}
    </div>
  );
}

/** Headline composite value with its severity band. */
export function CompositeValue({ value }: { value: number | null }) {
  const severity = severityOf(value);

  return (
    <div className="rounded-xl border border-accent/20 bg-gradient-to-br from-accent/8 to-accent/3 p-4 flex flex-col gap-2">
      <div className="flex justify-between items-center gap-2">
        <span className="text-[10px] font-bold tracking-widest uppercase text-foreground/65">
          IACI Composite
        </span>
        <span
          className={`text-[9px] font-bold px-2 py-0.5 border rounded-full uppercase tracking-wider whitespace-nowrap ${severity.badge}`}
        >
          {severity.label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-black text-accent tracking-tight">
          {value == null ? "—" : value.toFixed(3)}
        </span>
        <span className="text-[10px] text-foreground/55 font-semibold uppercase tracking-widest">
          z-score
        </span>
      </div>
    </div>
  );
}

/**
 * The five components as labelled diverging bars. `values` may be null when the
 * selected period has no row at all, which renders every component as absent.
 */
export function ComponentBars({ values }: { values: Values | null }) {
  return (
    <div className="flex flex-col gap-3.5">
      {COMPONENTS.map((component) => {
        const value = values?.[component.id] ?? null;
        const severity = severityOf(value);

        return (
          <div
            key={component.id}
            className="flex flex-col gap-1.5 border-b border-foreground/6 pb-3 last:border-0 last:pb-0"
          >
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-[11px] font-bold text-foreground/80 tracking-wide uppercase">
                {component.name}
                <span className="text-foreground/40 ml-1.5 font-semibold">
                  {component.short}
                </span>
              </span>
              <span className={`text-xs font-black tracking-tight ${severity.text}`}>
                {formatValue(value)}
              </span>
            </div>
            <div className="text-[9.5px] text-foreground/50">{component.desc}</div>
            <ValueBar value={value} />
          </div>
        );
      })}
    </div>
  );
}
