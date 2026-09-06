"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { normalizeName } from "../lib/climate";
import { colorForValue, formatValue, indicator } from "../lib/indicators";
import type { Field } from "../lib/climate";

/**
 * A choropleth of one boundary file.
 *
 * Deliberately simpler than `IndiaMap`, which owns India's whole drill-down —
 * which file to fetch, which level it is on, and what a click means. That works
 * for exactly three levels. This one draws whatever collection it is pointed at
 * and reports clicks by name; the page owns the hierarchy, so the same
 * component serves Nepal's four levels and would serve a fifth.
 *
 * The projection auto-fits the features it is given, so nothing here knows
 * where in the world the region is.
 */

interface GeoJsonFeature {
  type: string;
  properties: { name?: string; parent?: string; [key: string]: unknown };
  geometry: unknown;
}

interface GeoJsonCollection {
  type: string;
  features: GeoJsonFeature[];
}

// Boundary files are static and shared between pages, so they are fetched once
// per tab rather than once per mounted map.
const geoCache = new Map<string, Promise<GeoJsonCollection>>();

function loadGeoJson(url: string): Promise<GeoJsonCollection> {
  const cached = geoCache.get(url);
  if (cached) return cached;

  const request = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`${res.status} loading ${url}`);
      return res.json() as Promise<GeoJsonCollection>;
    })
    .catch((err) => {
      geoCache.delete(url);
      throw err;
    });

  geoCache.set(url, request);
  return request;
}

function featureName(feature: GeoJsonFeature): string {
  return String(feature.properties.name ?? "Unknown");
}

export default function RegionMap({
  url,
  values,
  variable,
  onSelect,
  levelLabel,
  focusName,
  hint,
  className,
  heightClassName,
}: {
  /** Boundary file to draw. Null renders the empty state. */
  url: string | null;
  /** Region name (upper-cased) -> value, for shading. */
  values: Record<string, number>;
  variable: Field;
  /** Called with the clicked region's name. */
  onSelect?: (name: string) => void;
  /** What one feature is, for the tooltip ("Province", "District"…). */
  levelLabel: string;
  /** When set, only this region is drawn — the zoomed-in view. */
  focusName?: string | null;
  /** Tooltip footer line. */
  hint?: string;
  className?: string;
  heightClassName?: string;
}) {
  const [collection, setCollection] = useState<{ url: string; data: GeoJsonCollection } | null>(
    null
  );
  const [hovered, setHovered] = useState<GeoJsonFeature | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Tagged with the url it belongs to, so switching regions derives an empty
  // map immediately instead of briefly drawing the previous one.
  const data = collection?.url === url ? collection.data : null;

  useEffect(() => {
    if (!url) return;
    let active = true;
    loadGeoJson(url)
      .then((loaded) => {
        if (active) setCollection({ url, data: loaded });
      })
      .catch((err) => console.error(err));
    // Ignore a slow response for a region the user has navigated away from.
    return () => {
      active = false;
    };
  }, [url]);

  const { paths, viewBox } = useMemo(() => {
    const source = focusName
      ? {
          type: "FeatureCollection",
          features: (data?.features ?? []).filter(
            (f) => normalizeName(featureName(f)) === normalizeName(focusName)
          ),
        }
      : data;

    if (!source?.features?.length) return { paths: [], viewBox: "0 0 1000 1000" };

    const projection = geoMercator().fitSize([1000, 1000], source as never);
    const generator = geoPath().projection(projection);

    const list = source.features.map((feature, idx) => ({
      feature,
      d: generator(feature as never) || "",
      key: `${url}-${focusName ?? ""}-${idx}`,
    }));

    const [[x0, y0], [x1, y1]] = generator.bounds(source as never);
    const width = Math.max(1, x1 - x0);
    const height = Math.max(1, y1 - y0);
    // 3.5% padding so strokes and edge details do not touch the border.
    const pad = Math.max(width, height) * 0.035;

    return {
      paths: list,
      viewBox: `${(x0 - pad).toFixed(1)} ${(y0 - pad).toFixed(1)} ${(width + pad * 2).toFixed(1)} ${(height + pad * 2).toFixed(1)}`,
    };
  }, [data, focusName, url]);

  /** Position the tooltip by writing to the node directly. */
  const handlePointerMove = (e: React.PointerEvent) => {
    const container = containerRef.current;
    const tooltip = tooltipRef.current;
    if (!container || !tooltip) return;

    const rect = container.getBoundingClientRect();
    const x = Math.min(
      Math.max(8, e.clientX - rect.left + 12),
      Math.max(10, rect.width - tooltip.offsetWidth - 8)
    );
    const y = Math.max(tooltip.offsetHeight + 8, e.clientY - rect.top + 12);
    tooltip.style.transform = `translate3d(${x}px, ${y}px, 0) translateY(-100%)`;
  };

  const isLoading = Boolean(url) && !data;
  const hoveredName = hovered ? featureName(hovered) : null;
  const hoveredValue = hoveredName ? values[normalizeName(hoveredName)] : undefined;

  return (
    <div
      className={`w-full h-full flex flex-col items-center min-h-0 ${className || ""}`}
      onPointerMove={handlePointerMove}
    >
      <div
        ref={containerRef}
        className={`w-full h-full min-h-0 ${
          heightClassName || ""
        } rounded-2xl bg-gradient-to-b from-surface-muted/60 to-surface border border-foreground/8 overflow-hidden flex items-center justify-center relative flex-1`}
      >
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-surface/80 backdrop-blur-sm z-10">
            <span className="w-8 h-8 rounded-full border-[3px] border-accent border-t-transparent animate-spin" />
            <span className="text-xs font-semibold text-foreground/65 tracking-widest uppercase">
              Loading boundaries
            </span>
          </div>
        )}

        <svg
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full max-w-full max-h-full select-none p-1 sm:p-2"
          role="img"
          aria-label={`${levelLabel} shaded by ${variable}`}
        >
          <g>
            {paths.map(({ feature, d, key }) => {
              const name = featureName(feature);
              const value = values[normalizeName(name)];
              const isHovered = hovered === feature;

              return (
                <path
                  key={key}
                  d={d}
                  onClick={() => onSelect?.(name)}
                  onPointerEnter={() => setHovered(feature)}
                  onPointerLeave={() => setHovered(null)}
                  onPointerCancel={() => setHovered(null)}
                  className={`transition-[fill,stroke] duration-200 outline-none stroke-foreground/25 hover:stroke-foreground/70 ${
                    onSelect ? "cursor-pointer" : "cursor-default"
                  }`}
                  style={{
                    fill: isHovered ? "rgba(11, 43, 95, 0.14)" : colorForValue(value),
                    strokeWidth: isHovered ? "1.6px" : "0.9px",
                  }}
                />
              );
            })}
          </g>
        </svg>

        {/* Kept mounted so the pointer handler always has a node to position. */}
        <div
          ref={tooltipRef}
          aria-hidden={!hoveredName}
          className={`absolute left-0 top-0 pointer-events-none max-w-[min(16rem,calc(100%-1rem))] px-3.5 py-2.5 bg-foreground text-white rounded-xl shadow-card-xl text-xs flex flex-col gap-0.5 z-20 border border-white/10 ${
            hovered && hoveredName ? "" : "invisible"
          }`}
        >
          <span className="text-accent font-bold text-[10px] tracking-widest uppercase">
            {levelLabel}
          </span>
          <span className="text-sm font-bold break-words">{hoveredName}</span>
          <span className="text-xs mt-1 font-medium text-white/90">
            {indicator(variable).short}:{" "}
            <span className="font-bold text-accent">{formatValue(hoveredValue)}</span>
          </span>
          {hint && (
            <span className="text-white/60 font-normal text-[10px] mt-0.5">{hint}</span>
          )}
        </div>
      </div>
    </div>
  );
}
