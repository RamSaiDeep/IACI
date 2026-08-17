import { SCALE_GRADIENT, SCALE_MAX, indicator } from "../lib/indicators";
import type { Field } from "../lib/climate";

/** Gradient key for the choropleth, labelled with the active indicator. */
export default function ScaleLegend({ field }: { field: Field }) {
  const { name } = indicator(field);

  return (
    <div className="flex flex-col items-center gap-2 border-t border-foreground/8 pt-4">
      <div className="text-[10px] font-bold tracking-widest uppercase text-foreground/55 text-center">
        {name} — z-score
      </div>

      <div className="w-full max-w-lg flex flex-col gap-1">
        <div
          className="w-full h-3.5 rounded-full ring-1 ring-inset ring-foreground/10"
          style={{ background: SCALE_GRADIENT }}
        />
        <div className="relative w-full h-4">
          <span className="absolute left-0 text-[10px] font-semibold text-foreground/60">
            −{SCALE_MAX}
          </span>
          <span className="absolute left-1/2 -translate-x-1/2 text-[10px] font-bold text-foreground/85">
            0
          </span>
          <span className="absolute right-0 text-[10px] font-semibold text-foreground/60">
            +{SCALE_MAX}
          </span>
        </div>
      </div>
    </div>
  );
}
