import {
  COMPONENTS,
  SCALE_MAX,
  formatValue,
  severityOf,
} from "../lib/indicators";
import type { Indicator } from "../lib/indicators";
import type { Field, Values } from "../lib/climate";

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

/**
 * Headline composite value with its severity band.
 *
 * `label` and `field` default to India's, so every existing call site keeps its
 * current output; Nepal passes NACI.
 */
export function CompositeValue({
  value,
  label = "IACI Composite",
}: {
  value: number | null;
  label?: string;
}) {
  const severity = severityOf(value);

  return (
    <div className="rounded-xl border border-accent/25 bg-gradient-to-br from-accent/10 to-accent/3 p-3.5 flex flex-col gap-1.5 shadow-sm">
      <div className="flex justify-between items-center gap-2">
        <span className="text-xs font-bold tracking-widest uppercase text-foreground/75">
          {label}
        </span>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 border rounded-full uppercase tracking-wider whitespace-nowrap ${severity.badge}`}
        >
          {severity.label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl lg:text-4xl font-bold text-accent tracking-tight">
          {value == null ? "—" : value.toFixed(3)}
        </span>
        <span className="text-xs text-foreground/60 font-bold uppercase tracking-widest">
          z-score
        </span>
      </div>
    </div>
  );
}

/**
 * The components as labelled diverging bars. `values` may be null when the
 * selected period has no row at all, which renders every component as absent —
 * as does sea level on its own for any inland region, where the composite is
 * the five-component one.
 *
 * Scrolls rather than clipping: Explore gives this a fixed-height card, and six
 * bars do not always fit the shorter viewports that five did.
 */
export function ComponentBars({
  values,
  components = COMPONENTS,
}: {
  values: Values | null;
  /**
   * Which components to draw. Defaults to India's six. Nepal passes its five --
   * omitting sea level entirely rather than drawing it permanently empty, which
   * would read as "no data here" instead of "not part of the index".
   */
  components?: Indicator[];
}) {
  return (
    <div className="flex flex-col gap-2 min-h-0 overflow-y-auto">
      {components.map((component) => {
        const value = values?.[component.id as Field] ?? null;
        const severity = severityOf(value);
        const isUnavailable = component.id === "SS" && value == null;

        return (
          <div
            key={component.id}
            className={`flex flex-col gap-0.5 border-b border-foreground/6 pb-1.5 last:border-0 last:pb-0 transition-opacity ${
              isUnavailable ? "opacity-45" : ""
            }`}
          >
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-xs font-bold text-foreground/85 tracking-wide uppercase">
                {component.name}
                <span className="text-foreground/45 ml-1.5 font-semibold text-[10.5px]">
                  {component.short}
                </span>
              </span>
              <span className={`text-xs font-bold tracking-tight ${severity.text}`}>
                {formatValue(value)}
              </span>
            </div>
            <div className="text-[10px] text-foreground/55 leading-tight">
              {isUnavailable ? "Not applicable for inland region" : component.desc}
            </div>
            <ValueBar value={value} />
          </div>
        );
      })}
    </div>
  );
}
