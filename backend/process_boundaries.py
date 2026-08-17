import os
import json
import re
import shapefile
from pyproj import Transformer
import math

# Paths
boundaries_dir = r"C:\IACI\backend\data\boundaries"
frontend_public_dir = r"C:\IACI\frontend\public\geojson"
districts_out_dir = os.path.join(frontend_public_dir, "districts")

os.makedirs(districts_out_dir, exist_ok=True)

# ----------------- Winding Order Correction (Rewind) -----------------
def signed_area(ring):
    area = 0.0
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    return area / 2.0

def rewind_ring(ring, should_be_positive):
    area = signed_area(ring)
    if (area > 0) != should_be_positive:
        return ring[::-1]
    return ring

def rewind_polygon(poly_coords):
    if not poly_coords:
        return poly_coords
    new_poly = []
    # Outer ring: must be clockwise (negative area) for D3-geo
    new_poly.append(rewind_ring(poly_coords[0], should_be_positive=False))
    # Inner rings (holes): must be counter-clockwise (positive area)
    for hole in poly_coords[1:]:
        new_poly.append(rewind_ring(hole, should_be_positive=True))
    return new_poly

# ----------------- Coordinate Precision -----------------
# The geometry below is simplified to ~110 m, and one pixel of the national map
# is several kilometres, so full float64 coordinates cost payload and parse time
# for detail that can never be drawn. 4 decimals is ~11 m. Keep this in step
# with PRECISION in backend/optimize_geojson.py.
COORD_PRECISION = 4

def round_coords(node):
    if isinstance(node, list):
        if node and isinstance(node[0], (int, float)):
            return [round(value, COORD_PRECISION) for value in node]
        return [round_coords(child) for child in node]
    return node

def round_geometry(geom):
    if "coordinates" not in geom:
        return geom
    return {**geom, "coordinates": round_coords(geom["coordinates"])}
# ---------------------------------------------------------------------

def rewind_geometry(geom):
    geom_type = geom["type"]
    coords = geom["coordinates"]
    if geom_type == "Polygon":
        return {
            "type": "Polygon",
            "coordinates": rewind_polygon(coords)
        }
    elif geom_type == "MultiPolygon":
        new_polys = []
        for poly in coords:
            new_polys.append(rewind_polygon(poly))
        return {
            "type": "MultiPolygon",
            "coordinates": new_polys
        }
    return geom
# ---------------------------------------------------------------------

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
            feature["geometry"] = round_geometry(rewind_geometry(feature["geometry"]))

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
    
    # Rewind projection coordinates so winding order is valid
    rewound_geom = rewind_geometry(projected_geom)
    
    # Simplify using RDP (epsilon=0.001 is about 110m resolution, perfect for browser maps)
    simplified_geom = simplify_geometry(rewound_geom, epsilon=0.001)
    
    # Only the two name fields are read by the frontend; the shapefile's ids,
    # areas and lengths were pure payload. See backend/optimize_geojson.py.
    feature = {
        "type": "Feature",
        "properties": {
            "state_name": state_ut,
            "district_name": district
        },
        "geometry": round_geometry(simplified_geom)
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
