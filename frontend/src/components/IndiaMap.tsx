"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { normalizeName, slugifyState } from "../lib/climate";
import { colorForValue, formatValue, indicator } from "../lib/indicators";
import type { Field } from "../lib/climate";

interface GeoJsonFeature {
  type: string;
  properties: {
    state_name?: string;
    STATE?: string;
    district_name?: string;
    [key: string]: unknown;
  };
  geometry: unknown;
}

interface GeoJsonCollection {
  type: string;
  features: GeoJsonFeature[];
}

interface IndiaMapProps {
  selectedState: string | null;
  setSelectedState: (state: string | null) => void;
  selectedDistrict: string | null;
  setSelectedDistrict: (district: string | null) => void;
  mapValues: Record<string, number>;
  selectedVariable: Field;
  heightClassName?: string;
  className?: string;
}

// Boundary files are static and shared between Explore and Analyze, so they are
// fetched once per tab rather than once per mounted map.
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

function getStateName(feature: GeoJsonFeature): string {
  return feature.properties.state_name || feature.properties.STATE || "Unknown State";
}

export default function IndiaMap({
  selectedState,
  setSelectedState,
  selectedDistrict,
  setSelectedDistrict,
  mapValues,
  selectedVariable,
  heightClassName,
  className,
}: IndiaMapProps) {
  const [statesGeoJson, setStatesGeoJson] = useState<GeoJsonCollection | null>(null);
  // Tagged with the state it belongs to, so switching states derives an empty
  // map immediately instead of clearing it through an effect.
  const [districts, setDistricts] = useState<{
    state: string;
    data: GeoJsonCollection;
  } | null>(null);
  const [hoveredFeature, setHoveredFeature] = useState<GeoJsonFeature | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const districtGeoJson =
    selectedState && districts?.state === selectedState ? districts.data : null;
  const loadingDistricts = Boolean(selectedState) && districtGeoJson === null;

  useEffect(() => {
    let active = true;
    loadGeoJson("/geojson/state_boundary.json")
      .then((data) => {
        if (active) setStatesGeoJson(data);
      })
      .catch((err) => console.error("Error loading state boundary:", err));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedState) return;

    let active = true;
    loadGeoJson(`/geojson/districts/${slugifyState(selectedState)}.json`)
      .then((data) => {
        if (active) setDistricts({ state: selectedState, data });
      })
      .catch((err) => console.error(err));

    // Ignore a slow response for a state the user has already navigated away from.
    return () => {
      active = false;
    };
  }, [selectedState]);

  const handleFeatureClick = (feature: GeoJsonFeature) => {
    if (!selectedState) {
      setSelectedState(getStateName(feature));
      setHoveredFeature(null);
    } else if (!selectedDistrict) {
      const districtName = feature.properties.district_name;
      if (districtName) {
        setSelectedDistrict(districtName);
        setHoveredFeature(null);
      }
    }
  };

  const { paths, viewBox } = useMemo(() => {
    let currentData: GeoJsonCollection | null;

    if (selectedState) {
      if (selectedDistrict && districtGeoJson) {
        currentData = {
          type: "FeatureCollection",
          features: districtGeoJson.features.filter(
            (f) => f.properties.district_name === selectedDistrict
          ),
        };
      } else {
        currentData = districtGeoJson;
      }
    } else {
      currentData = statesGeoJson;
    }

    if (!currentData?.features?.length) {
      return { paths: [], viewBox: "0 0 800 750" };
    }

    // Fit into a normalized coordinate box, then compute tight geometric bounds
    const projection = geoMercator().fitSize([1000, 1000], currentData as never);
    const pathGenerator = geoPath().projection(projection);
    const level = selectedDistrict ? "only-district" : selectedState ? "district" : "state";

    const pathList = currentData.features.map((feature, idx) => ({
      feature,
      d: pathGenerator(feature as never) || "",
      key: `${level}-${idx}`,
    }));

    const bounds = pathGenerator.bounds(currentData as never);
    const x0 = bounds[0][0];
    const y0 = bounds[0][1];
    const x1 = bounds[1][0];
    const y1 = bounds[1][1];
    const bw = Math.max(1, x1 - x0);
    const bh = Math.max(1, y1 - y0);

    // 3.5% padding so strokes and edge details do not touch the border
    const pad = Math.max(bw, bh) * 0.035;
    const computedViewBox = `${(x0 - pad).toFixed(1)} ${(y0 - pad).toFixed(1)} ${(bw + pad * 2).toFixed(1)} ${(bh + pad * 2).toFixed(1)}`;

    return {
      paths: pathList,
      viewBox: computedViewBox,
    };
  }, [statesGeoJson, districtGeoJson, selectedState, selectedDistrict]);

  /**
   * Position the tooltip by writing to the node directly.
   */
  const handlePointerMove = (e: React.PointerEvent) => {
    const container = mapContainerRef.current;
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

  const isLoading = !statesGeoJson || (selectedState && loadingDistricts);
  const hoveredName = hoveredFeature
    ? selectedState
      ? hoveredFeature.properties.district_name
      : getStateName(hoveredFeature)
    : null;
  const hoveredValue = hoveredName ? mapValues[normalizeName(hoveredName)] : undefined;

  return (
    <div className={`w-full h-full flex flex-col items-center min-h-0 ${className || ""}`} onPointerMove={handlePointerMove}>
      <div
        ref={mapContainerRef}
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
          aria-label={
            selectedState
              ? `Districts of ${selectedState} shaded by ${selectedVariable}`
              : `States of India shaded by ${selectedVariable}`
          }
        >
          <g>
            {paths.map(({ feature, d, key }) => {
              const name = selectedState
                ? feature.properties.district_name
                : getStateName(feature);
              const value = mapValues[normalizeName(name)];
              const isHovered = hoveredFeature === feature;

              return (
                <path
                  key={key}
                  d={d}
                  onClick={() => handleFeatureClick(feature)}
                  onPointerEnter={() => setHoveredFeature(feature)}
                  onPointerLeave={() => setHoveredFeature(null)}
                  onPointerCancel={() => setHoveredFeature(null)}
                  className={`transition-[fill,stroke] duration-200 cursor-pointer outline-none ${
                    selectedState
                      ? "stroke-foreground/20 hover:stroke-foreground/60"
                      : "stroke-foreground/25 hover:stroke-foreground/70"
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

        {/* Kept mounted so the pointer handler always has a node to position;
            only its contents and visibility follow the hover. */}
        <div
          ref={tooltipRef}
          aria-hidden={!hoveredName}
          className={`absolute left-0 top-0 pointer-events-none max-w-[min(16rem,calc(100%-1rem))] px-3.5 py-2.5 bg-foreground text-white rounded-xl shadow-card-xl text-xs flex flex-col gap-0.5 z-20 border border-white/10 ${
            hoveredFeature && hoveredName ? "" : "invisible"
          }`}
        >
          <span className="text-accent font-bold text-[10px] tracking-widest uppercase">
            {selectedState ? "District" : "State / UT"}
          </span>
          <span className="text-sm font-bold break-words">{hoveredName}</span>
          <span className="text-xs mt-1 font-medium text-white/90">
            {indicator(selectedVariable).short}:{" "}
            <span className="font-bold text-accent">{formatValue(hoveredValue)}</span>
          </span>
          <span className="text-white/60 font-normal text-[10px] mt-0.5">
            {selectedState
              ? hoveredFeature && getStateName(hoveredFeature)
              : "Tap or click to inspect districts"}
          </span>
        </div>
      </div>
    </div>
  );
}
