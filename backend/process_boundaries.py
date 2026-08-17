import os
import json
import re
import shapefile
from pyproj import Transformer
import math

# Rounding, dropping degenerate rings and winding for d3-geo all live in one
# place, because they only work in that order and only as the last step: both
# the simplification and the rounding below can flip or flatten a sliver ring.
from optimize_geojson import clean_geometry

# Paths
boundaries_dir = r"C:\IACI\backend\data\boundaries"
frontend_public_dir = r"C:\IACI\frontend\public\geojson"
districts_out_dir = os.path.join(frontend_public_dir, "districts")

os.makedirs(districts_out_dir, exist_ok=True)

# 1. Process and format state_boundary.json
state_boundary_src = os.path.join(boundaries_dir, "state_boundary.json")
state_boundary_dst = os.path.join(frontend_public_dir, "state_boundary.json")

print("Processing and rewinding state boundaries...")
if os.path.exists(state_boundary_src):
    with open(state_boundary_src, "r") as f:
        states_data = json.load(f)
    
    # Normalize state names, rewind geometries, and drop the shapefile's
    # object ids, areas and lengths — the map only ever reads the name.
    for feature in states_data.get("features", []):
        props = feature.get("properties", {})
        state_name = props["STATE"].strip() if "STATE" in props else props.get("state_name")
        feature["properties"] = {"STATE": state_name, "state_name": state_name}
        if "geometry" in feature:
            feature["geometry"] = clean_geometry(feature["geometry"])

    # Minified, not indented: this file is fetched before the first map paints,
    # and the indentation alone was most of its 2.5 MB.
    with open(state_boundary_dst, "w") as f:
        json.dump(states_data, f, separators=(",", ":"))
    print("State boundaries processed, rewound, and saved.")
else:
    print("WARNING: state_boundary.json not found in boundaries directory!")

# Ramer-Douglas-Peucker simplification algorithm
def distance_point_to_line(p, p1, p2):
    x, y = p
    x1, y1 = p1
    x2, y2 = p2
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)
    
    t = ((x - x1) * dx + (y - y1) * dy) / (dx*dx + dy*dy)
    t = max(0, min(1, t))
    px = x1 + t * dx
    py = y1 + t * dy
    return math.hypot(x - px, y - py)

def rdp(points, epsilon):
    if len(points) < 3:
        return points
    
    dmax = 0.0
    index = 0
    end = len(points) - 1
    for i in range(1, end):
        d = distance_point_to_line(points[i], points[0], points[end])
        if d > dmax:
            index = i
            dmax = d
            
    if dmax > epsilon:
        rec_results1 = rdp(points[:index+1], epsilon)
        rec_results2 = rdp(points[index:], epsilon)
        return rec_results1[:-1] + rec_results2
    else:
        return [points[0], points[end]]

def simplify_geometry(geom, epsilon=0.001):
    geom_type = geom["type"]
    coords = geom["coordinates"]
    
    if geom_type == "Polygon":
        new_rings = []
        for ring in coords:
            simplified = rdp(ring, epsilon)
            if len(simplified) >= 4:  # Polygons need at least 4 points (closed ring)
                new_rings.append(simplified)
            else:
                new_rings.append(ring) # keep original if simplified is too small
        return {"type": "Polygon", "coordinates": new_rings}
        
    elif geom_type == "MultiPolygon":
        new_polys = []
        for poly in coords:
            new_rings = []
            for ring in poly:
                simplified = rdp(ring, epsilon)
                if len(simplified) >= 4:
                    new_rings.append(simplified)
                else:
                    new_rings.append(ring)
            if new_rings:
                new_polys.append(new_rings)
        return {"type": "MultiPolygon", "coordinates": new_polys}
        
    return geom

# Projection setup: LCC to WGS84
# LCC params from DISTRICT_BOUNDARY.prj
proj_string = "+proj=lcc +lat_0=24.0 +lon_0=80.0 +lat_1=12.472944 +lat_2=35.172806 +x_0=4000000.0 +y_0=4000000.0 +ellps=WGS84 +units=m +no_defs"
transformer = Transformer.from_proj(proj_string, "epsg:4326", always_xy=True)

def project_geometry(geom):
    geom_type = geom["type"]
    coords = geom["coordinates"]
    
    if geom_type == "Polygon":
        projected_rings = []
        for ring in coords:
            projected_ring = [transformer.transform(x, y) for x, y in ring]
            projected_rings.append(projected_ring)
        return {"type": "Polygon", "coordinates": projected_rings}
        
    elif geom_type == "MultiPolygon":
        projected_polys = []
        for poly in coords:
            projected_rings = []
            for ring in poly:
                projected_ring = [transformer.transform(x, y) for x, y in ring]
                projected_rings.append(projected_ring)
            projected_polys.append(projected_rings)
        return {"type": "MultiPolygon", "coordinates": projected_polys}
        
    return geom

# 2. Process DISTRICT_BOUNDARY shapefile
shp_path = os.path.join(boundaries_dir, "DISTRICT_BOUNDARY.shp")
print(f"Reading district boundaries from {shp_path}...")

reader = shapefile.Reader(shp_path)
records = reader.records()
shapes = reader.shapes()

# Group features by state
state_groups = {}

print("Reprojecting, rewinding, simplifying, and grouping districts by state...")
for idx, (rec, shape) in enumerate(zip(records, shapes)):
    state_ut = rec["STATE_UT"]
    district = rec["DISTRICT"]
    
    if not state_ut or state_ut.strip() == "":
        # Skip empty state names (often boundary anomalies)
        continue
        
    state_ut = state_ut.strip()
    district = district.strip()
    
    if state_ut == "ANDAMAN AND NICOBAR ISLANDS":
        state_ut = "ANDAMAN & NICOBAR"
    
    # Convert shape to geojson geometry dict
    geom = shape.__geo_interface__
    
    # Project to WGS84
    projected_geom = project_geometry(geom)

    # Simplify using RDP (epsilon=0.001 is about 110m resolution, perfect for browser maps)
    simplified_geom = simplify_geometry(projected_geom, epsilon=0.001)

    # Round, discard rings that simplification flattened, and wind for d3-geo —
    # in that order, since each step can undo the winding of the one before.
    cleaned_geom = clean_geometry(simplified_geom)
    if cleaned_geom is None:
        print(f"  ! skipping {district} ({state_ut}): no geometry left after simplification")
        continue

    # Only the two name fields are read by the frontend; the shapefile's ids,
    # areas and lengths were pure payload. See backend/optimize_geojson.py.
    feature = {
        "type": "Feature",
        "properties": {
            "state_name": state_ut,
            "district_name": district
        },
        "geometry": cleaned_geom
    }

    if state_ut not in state_groups:
        state_groups[state_ut] = []
    state_groups[state_ut].append(feature)

print(f"Loaded districts for {len(state_groups)} states/UTs.")

# Save each state's districts to a separate GeoJSON file
for state, features in state_groups.items():
    # Make filename safe
    safe_state_name = re.sub(r"[^a-z0-9]+", "_", state.lower()).strip("_")
    filename = f"{safe_state_name}.json"
    file_path = os.path.join(districts_out_dir, filename)
    
    geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    
    with open(file_path, "w") as f:
        json.dump(geojson, f, separators=(",", ":"))
        
    print(f"Saved {state} districts ({len(features)} districts) to {filename} (Size: {os.path.getsize(file_path)/1024:.1f} KB)")

print("All boundaries processed and rewound successfully!")
