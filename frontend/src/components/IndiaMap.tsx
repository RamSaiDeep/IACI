"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { geoMercator, geoPath } from "d3-geo";

interface GeoJsonFeature {
  type: string;
  properties: {
    state_name?: string;
    STATE?: string;
    district_name?: string;
    [key: string]: any;
  };
  geometry: any;
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
  mapValues: { [key: string]: number };
  selectedVariable: string;
  heightClassName?: string;
}

// Smooth continuous gradient: Cool Teal → Mint Cyan → Soft Cream (0) → Vibrant Coral → Crimson
// Covers symmetrical z-score range [-4.0, +4.0] centered at 0
const getColorForValue = (val: number) => {
  if (val === undefined || val === null || isNaN(val)) return "transparent";

  // Color stops: [zScore, r, g, b, alpha]
  const stops: [number, number, number, number, number][] = [
    [-4.0,  15, 118, 110, 0.95],  // Deep Teal Extreme
    [-2.0,  20, 184, 166, 0.70],  // Teal Elevated Negative
    [-0.5,  94, 234, 212, 0.45],  // Mint Cyan Mild Negative
    [ 0.0, 254, 240, 138, 0.35],  // Soft Cream Neutral Baseline (0)
    [ 0.5, 251, 146,  60, 0.45],  // Mild Amber Positive
    [ 2.0, 225,  29,  72, 0.70],  // Coral / Rose Elevated Positive
    [ 4.0, 136,  19,  55, 0.95],  // Deep Wine Crimson Extreme Positive
  ];

  // Clamp
  if (val <= stops[0][0]) {
    const [, r, g, b, a] = stops[0];
    return `rgba(${r},${g},${b},${a})`;
  }
  if (val >= stops[stops.length - 1][0]) {
    const [, r, g, b, a] = stops[stops.length - 1];
    return `rgba(${r},${g},${b},${a})`;
  }

  // Find surrounding stops and interpolate
  for (let i = 0; i < stops.length - 1; i++) {
    const [z0, r0, g0, b0, a0] = stops[i];
    const [z1, r1, g1, b1, a1] = stops[i + 1];
    if (val >= z0 && val <= z1) {
      const t = (val - z0) / (z1 - z0);
      const r = Math.round(r0 + t * (r1 - r0));
      const g = Math.round(g0 + t * (g1 - g0));
      const b = Math.round(b0 + t * (b1 - b0));
      const a = +(a0 + t * (a1 - a0)).toFixed(2);
      return `rgba(${r},${g},${b},${a})`;
    }
  }
  return "transparent";
};

export default function IndiaMap({ 
  selectedState, 
  setSelectedState,
  selectedDistrict,
  setSelectedDistrict,
  mapValues,
  selectedVariable,
  heightClassName
}: IndiaMapProps) {
  const [statesGeoJson, setStatesGeoJson] = useState<GeoJsonCollection | null>(null);
  const [districtGeoJson, setDistrictGeoJson] = useState<GeoJsonCollection | null>(null);
  const [hoveredFeature, setHoveredFeature] = useState<GeoJsonFeature | null>(null);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const width = 800;
  const height = 750;

  // Fetch full India state boundaries on load
  useEffect(() => {
    fetch("/geojson/state_boundary.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch state boundary");
        return res.json();
      })
      .then((data) => {
        setStatesGeoJson(data);
      })
      .catch((err) => {
        console.error("Error loading state boundary:", err);
      });
  }, []);

  // Fetch district boundaries when a state is selected
  useEffect(() => {
    if (!selectedState) {
      setDistrictGeoJson(null);
      return;
    }

    setLoadingDistricts(true);
    
    // Normalize state name to match file name: lowercase with underscores
    const safeName = selectedState
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
      
    fetch(`/geojson/districts/${safeName}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load districts for ${selectedState}`);
        return res.json();
      })
      .then((data) => {
        setDistrictGeoJson(data);
        setLoadingDistricts(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadingDistricts(false);
      });
  }, [selectedState]);

  // Normalize state name extraction since keys might vary
  const getStateName = (feature: GeoJsonFeature) => {
    return feature.properties.state_name || feature.properties.STATE || "Unknown State";
  };

  // Convert map click handler to zoom into selected state or district
  const handleFeatureClick = (feature: GeoJsonFeature) => {
    if (!selectedState) {
      const stateName = getStateName(feature);
      setSelectedState(stateName);
      setHoveredFeature(null);
    } else if (!selectedDistrict) {
      const districtName = feature.properties.district_name;
      if (districtName) {
        setSelectedDistrict(districtName);
        setHoveredFeature(null);
      }
    }
  };



  // Memoized Projection and Path calculations using D3-geo
  const { paths, bounds } = useMemo(() => {
    let currentData: GeoJsonCollection | null = null;
    
    if (selectedState) {
      if (selectedDistrict && districtGeoJson) {
        const filteredFeatures = districtGeoJson.features.filter(
          (f) => f.properties.district_name === selectedDistrict
        );
        currentData = {
          type: "FeatureCollection",
          features: filteredFeatures
        };
      } else {
        currentData = districtGeoJson;
      }
    } else {
      currentData = statesGeoJson;
    }
    
    if (!currentData || !currentData.features || currentData.features.length === 0) {
      return { paths: [], bounds: null };
    }

    const projection = geoMercator();
    
    // Auto-fit coordinates to the SVG dimension box
    // Add padding so the map doesn't clip at edges
    const padding = selectedDistrict ? 60 : selectedState ? 40 : 25;
    projection.fitSize([width, height - padding], currentData as any);
    
    const pathGenerator = geoPath().projection(projection);
    
    const calculatedPaths = currentData.features.map((feature, idx) => {
      const dPath = pathGenerator(feature as any);
      return {
        feature,
        d: dPath || "",
        key: `${selectedDistrict ? "only-district" : selectedState ? "district" : "state"}-${idx}`
      };
    });

    return { paths: calculatedPaths, bounds: null };
  }, [statesGeoJson, districtGeoJson, selectedState, selectedDistrict]);

  // Handle tooltip positioning
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!mapContainerRef.current) return;
    const rect = mapContainerRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left + 12;
    const rawY = e.clientY - rect.top + 12;
    // Keep tooltip inside container horizontally & vertically
    const clampedX = Math.min(Math.max(8, rawX), Math.max(10, rect.width - 190));
    const clampedY = Math.max(20, rawY);
    setTooltipPos({
      x: clampedX,
      y: clampedY
    });
  };

  return (
    <div className="w-full h-full flex flex-col items-center" onMouseMove={handleMouseMove}>
      
      {/* Map Rendering Container */}
      <div 
        ref={mapContainerRef} 
        className={`w-full ${heightClassName || "h-[45vh] min-h-[320px] max-h-[580px] sm:h-[480px] lg:h-[680px] lg:max-h-none"} border border-foreground/10 rounded-xl bg-foreground/2 shadow-inner overflow-hidden flex items-center justify-center relative`}
      >
        {(!statesGeoJson || (selectedState && loadingDistricts)) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm z-10">
            <span className="w-8 h-8 rounded-full border-4 border-accent border-t-transparent animate-spin"></span>
            <span className="text-xs font-medium text-foreground/75 tracking-wider uppercase">
              Loading boundary maps...
            </span>
          </div>
        )}

        <svg 
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full max-w-full max-h-full select-none p-1 sm:p-2"
        >
          <g>
            {paths.map(({ feature, d, key }) => {
              const stateName = getStateName(feature);
              const districtName = feature.properties.district_name;
              const normName = (selectedState ? districtName : stateName)
                ? (selectedState ? districtName : stateName)!.trim().toUpperCase()
                : "";
              const val = mapValues[normName];
              const fillColor = getColorForValue(val);
              
              const isHovered = hoveredFeature && (
                selectedState 
                  ? hoveredFeature.properties.district_name === districtName
                  : getStateName(hoveredFeature) === stateName
              );

              return (
                <path
                  key={key}
                  d={d}
                  onClick={() => handleFeatureClick(feature)}
                  onMouseEnter={() => setHoveredFeature(feature)}
                  onMouseLeave={() => setHoveredFeature(null)}
                  className={`
                    transition-all duration-200 cursor-pointer outline-none
                    ${selectedState 
                      ? 'stroke-foreground/20 hover:stroke-foreground/60' 
                      : 'stroke-foreground/30 hover:stroke-foreground/80'
                    }
                  `}
                  style={{
                    fill: isHovered 
                      ? "rgba(15, 23, 42, 0.12)" // Subtle darken on hover over the choropleth
                      : fillColor,
                    strokeWidth: isHovered ? "1.5px" : "1.0px",
                  }}
                />
              );
            })}
          </g>
        </svg>

        {/* Premium Tooltip overlay */}
        {hoveredFeature && (() => {
          const name = selectedState 
            ? hoveredFeature.properties.district_name 
            : getStateName(hoveredFeature);
          const normName = name ? name.trim().toUpperCase() : "";
          const val = mapValues[normName];
          const hasVal = val !== undefined && val !== null;

          return (
            <div
              className="absolute pointer-events-none px-4 py-2.5 bg-foreground text-background rounded-md shadow-xl text-xs font-semibold tracking-wider uppercase flex flex-col gap-0.5 z-20 border border-white/10"
              style={{
                left: tooltipPos.x,
                top: tooltipPos.y,
                transform: "translate(0, -100%)",
                transition: "left 0.05s ease-out, top 0.05s ease-out"
              }}
            >
              {selectedState ? (
                <>
                  <span className="text-[#f26a21] font-bold text-[10px]">District</span>
                  <span className="text-white text-[13px]">{hoveredFeature.properties.district_name}</span>
                  {hasVal && (
                    <span className="text-white text-[11px] mt-1 normal-case font-medium">
                      {selectedVariable}: <span className="font-bold text-[#f26a21]">{val.toFixed(2)}</span>
                    </span>
                  )}
                  <span className="text-white/60 font-normal text-[9px] mt-0.5 normal-case">
                    State: {getStateName(hoveredFeature)}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[#f26a21] font-bold text-[10px]">State / UT</span>
                  <span className="text-white text-[13px]">{getStateName(hoveredFeature)}</span>
                  {hasVal && (
                    <span className="text-white text-[11px] mt-1 normal-case font-medium">
                      {selectedVariable}: <span className="font-bold text-[#f26a21]">{val.toFixed(2)}</span>
                    </span>
                  )}
                  <span className="text-white/60 font-normal text-[9px] mt-0.5 normal-case">
                    Click to inspect districts
                  </span>
                </>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
