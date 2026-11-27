# ClimateIQ Agent: historical disaster events (plan)

Status: built with **open sources only** (decided): GDACS, Nepal's BIPAD portal and the Met Office. EM-DAT and
DesInventar are not used. Event types and hazard mapping as in section 1 (agreed). Code: `backend/build_events.py`,
`backend/ask_api/tools/events.py`.

Known limits: UK storms are read from Met Office season pages and only storms with a date stated in a sentence of
their own are kept (accurate, but some storms are missing); GDACS covers India from 2000 and gives areas, not
official district lists; no deaths for GDACS events.

Goal: when a visitor asks about a flood, cyclone, heatwave or drought, the agent can name the event,
say which states (and, where only one or two states were hit, which districts) it affected, and show
what the climate index recorded there at the time ("Assam's heavy-rainfall score in June 2022 was the
highest June on record").

## 1. What counts as an event

Only weather- and climate-related disasters, the ones the index can say something about. Earthquakes,
tsunamis and volcanic events are left out: no index hazard measures them.

| Event type | Includes | Index hazards shown | Why |
|---|---|---|---|
| Flood | River floods, flash floods, urban flooding, cloudbursts | Heavy rainfall (main); overall index | The index measures the largest 5-day rainfall total; it does not measure river levels |
| Landslide (rain-triggered) | Landslides and mudslides after heavy rain | Heavy rainfall | Landslides themselves aren't measured, only the rain behind them |
| Cyclone / storm | Tropical cyclones, severe storms, UK named storms | Strong wind and heavy rainfall; sea level on coasts | Wind, rain and storm surge are the three ways storms do damage |
| Coastal flood / storm surge | Tidal and surge flooding | Sea level; strong wind | Sea level is measured only for coastal places |
| Heatwave | Heatwaves, extreme heat | Extreme heat | Days hotter than that place's own 90th percentile |
| Cold wave | Cold waves, severe winter, frost | Extreme cold | Days colder than that place's own 10th percentile |
| Drought | Drought, prolonged dry spells | Drought (longest dry run) | Long runs of dry days against that place's normal |
| Wildfire | Forest fires | Extreme heat and drought (context only) | Fire isn't measured; heat and dryness set the conditions |

Every event answer also shows the overall index for the same month and place.

What the agent shows for one event:
1. The event: name, type, dates, source, and the reported deaths, people affected and damage (when the source gives them).
2. **Where:** the states affected. If the event affected one or two states, it also names the affected districts.
3. **What the index recorded:** for the event's months, at each affected state (or district), the score of the
   matching hazards above, and how it compares with the same months in every other year
   (e.g. "heavy rainfall +2.4, the highest June since 1991"). If the index showed nothing unusual, it says so.
4. The usual rule: describe, don't explain causes.

## 2. Sources

| Source | Countries | Location detail | Access | Licence / use | Verdict |
|---|---|---|---|---|---|
| **EM-DAT** (CRED, UCLouvain) | All | Country, plus a free-text list of admin areas (often states, sometimes districts) | Free account needed; download a spreadsheet from public.emdat.be | Non-commercial use with citation; **no redistribution** of the data | The best global list (1900–today). You download it; it must not be committed to the public repo |
| **GDACS** (UN / EU) | All | A point and a bounding box per event | Open API, checked working | Open, cite GDACS | Good for floods, cyclones, droughts since about 2000; needs location filtering |
| **BIPAD portal** (Govt. of Nepal) | Nepal | Exact point and ward for every incident | Open API, checked working | Government open data | Excellent for Nepal: maps straight to districts and local levels. Many small incidents, so they are grouped into events |
| **DesInventar** (UNDRR archive) | Nepal; some Indian states (e.g. Odisha, Tamil Nadu) | District-level records | Website up; bulk files to be checked | Open, cite DesInventar | Useful history for Nepal and parts of India; patchy for India overall |
| **Met Office named storms** | UK | Named storms with dates; affected areas in text | Public web pages (checked) | Open Government Licence | Good for UK storms since 2015 |
| **India: IMD / NDMA** | India | State-level, in annual PDF reports ("Disastrous Weather Events") | No API: PDFs | Government publications | Possible later; needs PDF extraction and checking |
| ReliefWeb | All | Country | Needs an approved app name (request form) | Open | Not now |

Recommendation: **EM-DAT as the backbone** (you download the file under your account), **GDACS** to add locations for
recent floods, cyclones and droughts, **BIPAD** for Nepal, **Met Office** for UK storms. IMD/NDMA PDFs later if needed.

### The EM-DAT licence and where the data can live
The repo is public on GitHub. EM-DAT's terms don't allow redistributing their data, so the EM-DAT file can't be
committed. Options:
- **A. Keep it off GitHub:** the API reads it from a private file on Render (uploaded as a secret file). The website
  shows only short facts about an event with a citation, which the terms allow.
- **B. Open sources only in the repo:** GDACS, BIPAD, DesInventar and Met Office data are open, so they can be committed.
  EM-DAT is skipped.
- **C. Make the repo private,** then commit everything.

## 3. The database

One small SQLite file (or CSVs) built by a script, `backend/build_events.py`, the same way the LGD table is built:

```
events
  event_id      e.g. "emdat:2022-0346-IND", "gdacs:FL-1001234", "bipad:2024-flood-koshi"
  source        emdat | gdacs | bipad | desinventar | metoffice
  source_ref    the source's own id, and GLIDE number when there is one (used to merge duplicates)
  country       india | nepal | uk
  type          flood | landslide | cyclone_storm | coastal_flood | heatwave | cold_wave | drought | wildfire
  name          e.g. "Cyclone Fani", "Assam floods 2022"
  start_date, end_date
  deaths, affected, damage_usd   (blank when the source has none)
  summary       one or two sentences
  source_url

event_places
  event_id
  place_id      our id: a state, district or local level (matched with find_place, Bharatlas and the LGD table)
  role          state | district
```

The same event in two sources (EM-DAT and GDACS) is merged by GLIDE number or by type, country and dates.

## 4. New tools

| Tool | Purpose | Example |
|---|---|---|
| `find_events(place?, type?, period?, name?)` | Find events by place, type, time or name; returns a short list with ids | "floods in Assam", "Cyclone Fani", "heatwaves in 2024" |
| `get_event(event_id)` | One event in full: dates, impacts, affected states (districts when one or two states), source | |
| `event_signal(event_id)` | What the index recorded at the affected places in the event's months, for the hazards matching its type (section 1), compared with every other year | "Was Cyclone Fani's rainfall unusual for Odisha?" |

All three follow the same purpose / use when / inputs / returns / example format as the other tools.

## 5. Decisions needed

1. Sources: the recommendation above, or a different mix?
2. EM-DAT: will you create the account and download the file (public.emdat.be → "Access data", India, Nepal and
   United Kingdom, natural hazards, 1991 onwards)? I can't create accounts or sign in for you.
3. Where the EM-DAT data lives: option A, B or C above.
4. The event types and hazard mapping in section 1: any changes?
