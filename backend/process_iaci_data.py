import os
import json
import zarr
import pandas as pd
import numpy as np

backend_dir = r"c:\IACI\backend"
spatial_dir = os.path.join(backend_dir, "data", "spatial")
crosswalks_dir = os.path.join(spatial_dir, "crosswalks")
frontend_public_dir = r"c:\IACI\frontend\public"
output_data_dir = os.path.join(frontend_public_dir, "data")
output_districts_dir = os.path.join(output_data_dir, "districts")

os.makedirs(output_data_dir, exist_ok=True)
os.makedirs(output_districts_dir, exist_ok=True)

def safe(v):
    """Return float or None for NaN — stored as JSON null, never as 0."""
    return float(v) if not np.isnan(v) else None

def normalize_name(name):
    if not name:
        return ""
    return name.strip().upper()

def make_row(year, month, aci, ds, ps, t10, t90, w):
    return {
        "year": int(year),
        "month": int(month),
        "ACI":  safe(aci),
        "DS":   safe(ds),
        "PS":   safe(ps),
        "T10S": safe(t10),
        "T90S": safe(t90),
        "W":    safe(w),
    }

def all_null(row):
    """True when every data field is null — skip these rows entirely."""
    return all(row[k] is None for k in ("ACI", "DS", "PS", "T10S", "T90S", "W"))


# ─── 1. India Level ───────────────────────────────────────────────────────────
print("Processing India level data...")
g = zarr.open(os.path.join(spatial_dir, "iaci_india.zarr"))

years  = list(g["year"][:])
months = list(g["month"][:])

iaci_a = g["IACI"][:]
ds_a   = g["DS"][:]
ps_a   = g["PS"][:]
t10_a  = g["T10S"][:]
t90_a  = g["T90S"][:]
w_a    = g["W"][:]

india_data = []
for y_idx, year in enumerate(years):
    for m_idx, month in enumerate(months):
        row = make_row(year, month,
                       iaci_a[y_idx, m_idx, 0], ds_a[y_idx, m_idx, 0],
                       ps_a[y_idx, m_idx, 0],   t10_a[y_idx, m_idx, 0],
                       t90_a[y_idx, m_idx, 0],   w_a[y_idx, m_idx, 0])
        if not all_null(row):
            india_data.append(row)

with open(os.path.join(output_data_dir, "india_data.json"), "w") as f:
    json.dump(india_data, f, indent=2)
print(f"India data saved ({len(india_data)} rows).")


# ─── 2. State Level ───────────────────────────────────────────────────────────
print("Processing State level data...")
sg = zarr.open(os.path.join(spatial_dir, "iaci_state.zarr"))

state_names = [normalize_name(n) for n in sg["region_name"][:]]
si = sg["IACI"][:]; sd = sg["DS"][:]; sp = sg["PS"][:]
st10 = sg["T10S"][:]; st90 = sg["T90S"][:]; sw = sg["W"][:]

state_data = {}
for s_idx, sname in enumerate(state_names):
    rows = []
    for y_idx, year in enumerate(years):
        for m_idx, month in enumerate(months):
            row = make_row(year, month,
                           si[y_idx, m_idx, s_idx], sd[y_idx, m_idx, s_idx],
                           sp[y_idx, m_idx, s_idx], st10[y_idx, m_idx, s_idx],
                           st90[y_idx, m_idx, s_idx], sw[y_idx, m_idx, s_idx])
            if not all_null(row):
                rows.append(row)
    state_data[sname] = rows

with open(os.path.join(output_data_dir, "state_data.json"), "w") as f:
    json.dump(state_data, f, indent=2)
print(f"State data saved ({len(state_data)} states).")


# ─── 3. District Level ────────────────────────────────────────────────────────
print("Processing District level data...")
dg = zarr.open(os.path.join(spatial_dir, "iaci_district.zarr"))

district_ids   = [str(r) for r in dg["region_id"][:]]
district_names = [normalize_name(n) for n in dg["region_name"][:]]

di = dg["IACI"][:]; dd = dg["DS"][:]; dp = dg["PS"][:]
dt10 = dg["T10S"][:]; dt90 = dg["T90S"][:]; dw = dg["W"][:]

df_cw = pd.read_parquet(os.path.join(crosswalks_dir, "district_crosswalk.parquet"))
df_uniq = df_cw[["region_id", "STATE_UT"]].drop_duplicates()
id_to_state = dict(zip(df_uniq["region_id"].astype(str), df_uniq["STATE_UT"]))

grouped = {}
for d_idx, rid in enumerate(district_ids):
    d_name = district_names[d_idx]
    state_name = id_to_state.get(rid)
    if not state_name:
        row_fb = df_cw[df_cw["region_name"] == d_name]
        state_name = row_fb.iloc[0]["STATE_UT"] if not row_fb.empty else "UNKNOWN"
    state_name = normalize_name(state_name)

    if state_name not in grouped:
        grouped[state_name] = {}

    rows = []
    for y_idx, year in enumerate(years):
        for m_idx, month in enumerate(months):
            row = make_row(year, month,
                           di[y_idx, m_idx, d_idx], dd[y_idx, m_idx, d_idx],
                           dp[y_idx, m_idx, d_idx], dt10[y_idx, m_idx, d_idx],
                           dt90[y_idx, m_idx, d_idx], dw[y_idx, m_idx, d_idx])
            if not all_null(row):
                rows.append(row)
    grouped[state_name][d_name] = rows

for state_name, dist_dict in grouped.items():
    safe_name = state_name.lower()
    safe_name = "".join(c if c.isalnum() else "_" for c in safe_name)
    safe_name = "_".join(filter(None, safe_name.split("_")))
    out_path = os.path.join(output_districts_dir, f"{safe_name}.json")
    with open(out_path, "w") as f:
        json.dump(dist_dict, f, indent=2)
    total = sum(len(v) for v in dist_dict.values())
    print(f"  {state_name}: {len(dist_dict)} districts, {total} total rows -> {safe_name}.json")

print("All done!")
