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
}

const WIDTH = 800;
const HEIGHT = 750;

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

  const paths = useMemo(() => {
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

    if (!currentData?.features?.length) return [];

    // Fit the visible features to the viewBox, leaving room so a zoomed-in
    // district doesn't touch the frame.
    const padding = selectedDistrict ? 60 : selectedState ? 40 : 25;
    const projection = geoMercator().fitSize(
      [WIDTH, HEIGHT - padding],
      currentData as never
    );
    const pathGenerator = geoPath().projection(projection);
    const level = selectedDistrict ? "only-district" : selectedState ? "district" : "state";

    return currentData.features.map((feature, idx) => ({
      feature,
      d: pathGenerator(feature as never) || "",
      key: `${level}-${idx}`,
    }));
  }, [statesGeoJson, districtGeoJson, selectedState, selectedDistrict]);

  /**
   * Position the tooltip by writing to the node directly.
   *
   * This ran through React state before, so every pointer move re-rendered the
   * whole map — up to ~700 district paths at pointer-move rate, which is what
   * made panning across a state feel heavy on a phone. The position is pure
   * presentation and nothing else reads it, so it does not need to be state.
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
    <div className="w-full h-full flex flex-col items-center" onPointerMove={handlePointerMove}>
      <div
        ref={mapContainerRef}
        className={`w-full ${
          heightClassName || "h-map min-h-[320px] max-h-[580px] sm:h-[480px] lg:h-[680px] lg:max-h-none"
        } rounded-2xl bg-gradient-to-b from-surface-muted/60 to-surface border border-foreground/8 overflow-hidden flex items-center justify-center relative`}
      >
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-surface/80 backdrop-blur-sm z-10">
            <span className="w-8 h-8 rounded-full border-[3px] border-accent border-t-transparent animate-spin" />
            <span className="text-[11px] font-semibold text-foreground/65 tracking-widest uppercase">
              Loading boundaries
            </span>
          </div>
        )}

        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
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
          className={`absolute left-0 top-0 pointer-events-none max-w-[min(15rem,calc(100%-1rem))] px-3.5 py-2.5 bg-foreground text-white rounded-xl shadow-card-xl text-xs flex flex-col gap-0.5 z-20 border border-white/10 ${
            hoveredFeature && hoveredName ? "" : "invisible"
          }`}
        >
          <span className="text-accent font-bold text-[9px] tracking-widest uppercase">
            {selectedState ? "District" : "State / UT"}
          </span>
          <span className="text-[13px] font-semibold break-words">{hoveredName}</span>
          <span className="text-[11px] mt-1 font-medium text-white/90">
            {indicator(selectedVariable).short}:{" "}
            <span className="font-bold text-accent">{formatValue(hoveredValue)}</span>
          </span>
          <span className="text-white/55 font-normal text-[9px] mt-0.5">
            {selectedState
              ? hoveredFeature && getStateName(hoveredFeature)
              : "Tap or click to inspect districts"}
          </span>
        </div>
      </div>
    </div>
  );
}
