---
title: Adding a country to the ACI website
tags: [aci, website, guide, vscode]
worked-example: United Kingdom (UKACI)
---

# Adding a country to the ACI website

This guide shows how to put a country's climate index on the website. The worked example is the **UK Actuaries Climate Index (UKACI)**.

The guide has three parts:

- **Part A** explains how the site works. Read it once.
- **Part B** is the VS Code walkthrough. Follow it with VS Code open.
- **Part C** is the checklist for the next country.

> [!info] Who this is for
> You do not need to know web development. You need to open a folder in VS Code, type commands into its terminal, and edit text files. Every step says what to do, why, and how to check it worked.

---

# Part A: How the site works

## A1. The big picture

The website never computes the index. It only **shows** numbers that were computed somewhere else.

```
IACI-data_transformation  (the pipeline)
   computes the index → zarr stores + crosswalks
                │
                ▼
IACI  backend/  (Python scripts in this repo)
   converts them → small JSON files the browser can read
                │
                ▼
IACI  frontend/  (the website, built with Next.js)
   draws maps, charts and tables from those JSON files
```

There are two kinds of input:

- **Numbers.** The index values for every region and month. They come from the pipeline.
- **Shapes.** The outline of every region, so the map can draw it. They come from shapefiles.

The backend turns both into JSON. The frontend reads that JSON. That is the whole system.

> [!tip] The one rule to remember
> The pipeline and the website must use **the same boundary files**. The website matches numbers to shapes by region name. If the two use different files, regions show up empty on the map.

## A2. The UK at a glance

| | |
|---|---|
| Levels | United Kingdom → 4 nations → 218 counties and unitary authorities |
| From the pipeline | Country and county values only. Nation values are built by the website script from counties (area-weighted). |
| Nations | England (153), Scotland (32), Wales (22), Northern Ireland (11 council areas) |
| Components | T90S, T10S, PS, W, DS, and **SS (sea level)** |
| Sea level | Only regions that touch the coast have it. Inland regions show "No Data" for SS, and their composite averages the other five. India works the same way. |
| URL | `/uk` (unlisted: hidden from search engines, not linked from the site) |

## A3. Where the country-specific parts live

Almost nothing in this repo is specific to one country. These are the only places you touch:

| File | What it holds | Per country |
|---|---|---|
| `backend/countries.py` | Index code, store names, levels, fields (incl. SS), shapefile column names | Add one entry |
| `backend/prepare_uk_boundaries.py` | Fixes the raw shapefile (the UK one had no nation column) | Only if needed |
| `frontend/src/lib/countries/uk.ts` | Everything the pages display: name, labels, facts, credits, notes | One new file |
| `frontend/src/app/uk/` | The four pages: home, explore, analyze, about | Copy the folder, change one line per page |
| `frontend/src/components/Header.tsx` | Title and menu for the portal | Add one entry to `PORTALS` |

Everything else is shared: the map, charts, colours and the data loaders in `lib/countryPortal.ts`.

> [!note] Why "copy the folder"
> India and Nepal were each built as separate copies, and we kept that style. To make copying painless, the UK pages contain **no UK-specific text**. They read it all from `lib/countries/uk.ts`. So a new country is: copy the folder, write one config, and change one import line per page.
>
> This template handles **three levels** (country → top level → child level). Nepal has four, so a four-level country should copy `app/nepal/` instead.

## A4. How a page works, in plain words

Take the Explore page (`/uk/explore`):

1. When it opens, it downloads the national series (`country.json`) and the nations (`nation.json`).
2. It finds the latest year and month in the data and selects them.
3. The map draws the four nations and colours each by its value.
4. You click a nation. The page downloads that nation's counties and redraws the map.
5. You click a county. The map zooms to it.
6. The right panel and the trend chart always show whatever is selected.

When you shade by **Sea Level**, inland counties stay uncoloured. That is correct: they have no sea-level value.

---

# Part B: Doing it in VS Code, step by step

> [!abstract] The plan
> You have two copies of the project:
> - **Your repo**: the original IACI project, without the UK.
> - **The reference**: `IACI-uk-portal.zip`, with the UK finished.
>
> You rebuild the UK in your repo. The **shared machinery** (the files that work for any country) you copy from the reference. The **UK-specific parts** you write yourself, because those are what you will repeat for every future country. If you run out of time, the reference already works as it is.

## B1. Install the tools (once)

Install these four programs. Accept the default options, with one exception noted for Python.

1. **VS Code**: <https://code.visualstudio.com>
2. **Node.js**, the "LTS" version: <https://nodejs.org>. It runs the website.
3. **Python 3.12**: <https://www.python.org/downloads/>. On Windows, tick **"Add python.exe to PATH"** on the first installer screen.
4. **Git**: <https://git-scm.com/downloads>

Then open VS Code and install three extensions. Click the **Extensions** icon in the left bar (four squares, or `Ctrl+Shift+X`), search for each, and click *Install*:

- **Python** (by Microsoft)
- **ESLint** (by Microsoft)
- **Tailwind CSS IntelliSense** (by Tailwind Labs)

## B2. Open the project

1. Unzip the reference to a folder you can find, for example `Documents/IACI-uk-portal`.
2. In VS Code, go to *File → Open Folder…* and pick **your repo** folder. If VS Code asks "Do you trust the authors?", click *Yes*.
3. Open a second window with *File → New Window*, then *File → Open Folder…* and pick the **reference** folder. Keep it beside the first window to look things up.
4. In your repo's window, open the terminal with *View → Terminal* (``Ctrl+` ``). It opens inside the project folder.

Check the tools are found. Type each line and press Enter:

```bash
node -v
python --version
git --version
```

Each should print a version number. If one says "not recognised", reinstall that tool and restart VS Code.

> [!tip] Mac users
> Use `Cmd` wherever this guide says `Ctrl`. Use `python3` and `pip3` if `python` is not found.

## B3. Make a branch

A branch is a safe copy of the project's history to work on. If anything goes wrong, the main version is untouched.

```bash
git checkout -b uk-portal
```

The branch name now shows at the bottom-left of VS Code.

## B4. Set up Python and the website (once)

**Python libraries.** These go into a private folder called `.venv`, so they do not mix with other projects:

```bash
python -m venv .venv
```

Activate it. You must do this every time you open a new terminal:

```bash
# Windows (PowerShell)
.venv\Scripts\Activate.ps1
# Mac / Linux
source .venv/bin/activate
```

The prompt now starts with `(.venv)`. Then install:

```bash
pip install geopandas pyogrio zarr pandas numpy pyarrow shapely
```

Tell VS Code to use this Python: press `Ctrl+Shift+P`, type **Python: Select Interpreter**, and pick the one with `.venv` in its path.

> [!warning] Windows: "running scripts is disabled"
> If activation fails with this message, run this once, then try again:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

**Website libraries:**

```bash
npm --prefix frontend install
```

This takes a minute and creates `frontend/node_modules`. Never edit or commit that folder.

## B5. Run the site and learn the edit → save → look loop

```bash
npm --prefix frontend run dev
```

When it prints `Local: http://localhost:3000`, hold `Ctrl` and click the link. Then add `/nepal` to the address. You should see the Nepal portal.

> [!important] This is how you will work all the time
> The dev server watches your files. **When you save a file, the browser updates by itself.** Leave this terminal running.
>
> For other commands, open a second terminal with the **+** button in the terminal panel, and activate `.venv` in it. Press `Ctrl+C` in the first terminal to stop the server.

## B6. Copy in the shared machinery

These files work for any country. Copy them from the reference into your repo, at the same paths. Drag them between the two VS Code windows' Explorer panels, or copy them in your file manager.

**New files (copy as they are):**

| File | What it does |
|---|---|
| `backend/prepare_uk_boundaries.py` | Adds the nation column and builds the nation layer |
| `backend/make_demo_data.py` | Writes fake data so pages can be built before real data exists |
| `backend/check_pipeline_output.py` | Checks the pipeline output matches `countries.py` |
| `frontend/src/lib/countryPortal.ts` | Loads any three-level country's files |
| `frontend/src/components/CountryComparePanel.tsx` | One side of the Analyze page |
| `frontend/src/components/DemoBanner.tsx` | The yellow "demo data" warning |
| `docs/ADD_A_COUNTRY.md` | This guide |

**Changed files (look at the change, then copy):**

| File | What changed |
|---|---|
| `frontend/src/lib/climate.ts` | The `Field` type accepts any `…ACI` code |
| `frontend/src/lib/indicators.ts` | Builds a composite label for any country |
| `frontend/src/components/RegionMap.tsx` | Fixes a stale tooltip after clicking into a region |
| `frontend/src/components/Header.tsx` | Portals are now one table (you add the UK entry in B10) |
| `backend/process_country_data.py` | Can build a missing level from its children, and read parents from the map files |
| `.gitignore` | Ignores `.venv/` |

> [!tip] See exactly what changed
> In the Explorer, right-click your copy of a file and choose **Select for Compare**. Right-click the reference copy and choose **Compare with Selected**. VS Code shows the two side by side with changes highlighted. This is the best way to understand an edit before you copy it.

**Check:** the browser still shows `/nepal` and `/india` normally.

## B7. Prepare the UK boundaries

**Why:** the ONS file has 218 counties and unitary authorities, but no column saying which nation each belongs to, and no nation layer. Every ONS code starts with a letter for its nation (E = England, S = Scotland, W = Wales, N = Northern Ireland). The script reads that letter, then merges counties into nations.

Put the unzipped ONS files in a folder, for example `C:\data\boundaries\`. Then, in the second terminal:

```bash
python backend/prepare_uk_boundaries.py "C:\data\boundaries\CTYUA_DEC_2025_UK_BFE.shp"
```

**Check:** it prints 153 England, 11 Northern Ireland, 32 Scotland, 22 Wales, and writes `backend/data/boundaries/uk/county.shp` and `nation.shp`.

> [!warning] Give these two files to the pipeline too
> The pipeline's UK project must group its grid cells using **these** `county.shp` and `nation.shp`. Its county crosswalk must keep the `NATION` column.

## B8. Declare the UK in `backend/countries.py` (by hand)

**Why:** this file tells both backend scripts what to read and what to expect.

Open `backend/countries.py` (`Ctrl+P`, then type the file name). Scroll to the end of the `COUNTRIES` dictionary, just before its closing `}`. Type the UK entry. You can look at the reference while typing, but **type it**: this is the part you will write for every country.

```python
    "uk": {
        "name": "United Kingdom",
        "project": "uk",              # pipeline folder: projects/uk/derived
        "store_prefix": "ukaci",      # the pipeline writes ukaci_country.zarr and ukaci_county_ua.zarr
        "index_code": "UKACI",
        "index_variable": "UKACI",    # array name inside the stores
        "index_name": "UK Actuaries Climate Index",
        "fields": ["UKACI", "DS", "PS", "SS", "T10S", "T90S", "W"],
        "levels": [
            {"id": "country", "label": "United Kingdom", "plural": "Country"},
            {
                "id": "nation", "label": "Nation", "plural": "Nations",
                "parent": "country",
                "derive_from": "county_ua",     # no nation store: build it from counties
                "layer": "nation", "layer_name_field": "NATION",
            },
            {
                "id": "county_ua", "label": "County", "plural": "Counties",   # id = the pipeline's name
                "parent": "nation", "parent_field": "NATION",
                "parent_from_geojson": True,    # nation comes from the map files
                "layer": "county", "layer_name_field": "NAME",
                "layer_parent_field": "NATION",
            },
        ],
        "geojson": {"top": "nation.json", "children": "county_ua"},
    },
```

What each part means:

- `project` and `store_prefix` must match the pipeline's folder and file names.
- `fields` lists every array the stores contain. **SS is included**, so all three stores must have an `SS` array. It holds values for coastal regions and empty (NaN) values for inland ones.
- `layer` is the shapefile name (without `.shp`), and `layer_name_field` is the column holding the region name.
- Each level's `id` **must be the pipeline's name for that level**, because it decides which files are read: `ukaci_<id>.zarr` and `<id>_crosswalk.parquet`. The UK pipeline calls the county level `county_ua`, so that is the id here and in `lib/countries/uk.ts`. The label shown on the site is still "County".
- `parent_field` is the crosswalk column naming the parent. `layer_parent_field` is the same thing in the shapefile.
- `derive_from` and `parent_from_geojson` are there because **the UK pipeline only produces country and county values**. It has no nation store and no nation column. So:
  - `parent_from_geojson`: each county's nation is read from the map files made in step B9.
  - `derive_from`: each nation's values are built from its counties. Every component is an **area-weighted average** of the counties that have it, so sea level averages only the coastal counties. The composite is then the mean of those components. The About page says so.
  - If the pipeline ever produces `ukaci_nation.zarr` and a `NATION` column, delete these two lines.

> [!important] Check against the pipeline
> Run the checker. Point it at the pipeline's `derived` folder: in the pipeline's VS Code window, right-click `projects/uk/derived` → **Copy Path**.
> ```bash
> python backend/check_pipeline_output.py uk "PASTE-THE-PATH-HERE"
> ```
> Every line should say `OK` or `(skip)`. If something says `MISSING`, the line below it shows what *is* there. Change this entry to match. Do not rename the pipeline's files.

## B9. Make the map files and the data files

**Map files.** This simplifies the 100+ MB shapefile down to about 1.5 MB that a browser can load quickly:

```bash
python backend/process_country_boundaries.py uk
```

**Check:** `frontend/public/geojson/uk/` has `nation.json` and a `county_ua/` folder with four files.

**Data files.** Choose one.

*Real data (when the pipeline has run).* Make the map files **first** (above): the data script reads each county's nation from them.

Tell the script where the pipeline's `derived` folder is. Paste the same path you used for the checker:

```bash
# Windows (PowerShell)
$env:UK_DERIVED_DIR = "C:\path\to\IACI-data_transformation\projects\uk\derived"
# Mac / Linux
export UK_DERIVED_DIR="/path/to/IACI-data_transformation/projects/uk/derived"

python backend/process_country_data.py uk
```

A good run prints:

```
  county: parent nation read from the boundary files
  country      426 periods (199101-202606) -> ...
  county       218 regions across 4 nation files -> ...
  nation       4 regions DERIVED from county (area-weighted) -> ...
```

> [!note] The variable lasts only for that terminal
> If you open a new terminal, set `UK_DERIVED_DIR` again before running the script.

*Demo data (to build the pages now):*

```bash
python backend/make_demo_data.py uk
```

The demo script writes **random** numbers in exactly the right format. For sea level, it gives values only to counties that touch the coast (it finds 89 of the 218) and leaves inland ones empty, just like the real data. Every UK page shows a yellow "DEMO DATA" banner until you run the real-data command.

> [!warning] Read what the script prints
> `! N county rows have no canonical nation` means some county names in the pipeline differ from the names in the map files, so the script cannot tell which nation they are in. The pipeline and the website must use the same county boundary file.
> `has no ['SS']` means the pipeline stores have no sea-level array. Check the pipeline run.

## B10. Write the country config and add the pages

**1. The config (by hand).** Create the folder `frontend/src/lib/countries/`. In the Explorer, right-click `lib`, choose *New Folder*, and name it `countries`. In it, create `uk.ts`. Type the config, using the reference's `uk.ts` as your guide. It holds:

- `slug: "uk"`: the URL and the data folder name
- `indexCode`, `components` and the level `id`s: these **must match** `countries.py`. `components` includes `"SS"`.
- `tagline`, `facts`, `boundarySource`, `notes`: display text

**2. The pages (copy).** Copy the whole folder `frontend/src/app/uk/` from the reference into your `frontend/src/app/`. Open each file and find the line:

```ts
// THE ONLY COUNTRY-SPECIFIC LINE. Point it at another config to reuse this page.
import { COUNTRY } from "../../lib/countries/uk";
```

For the UK it is already correct. For a future country, this is the only line you change in each page.

**3. The header (by hand).** Open `frontend/src/components/Header.tsx` and find `const PORTALS`. Add the UK entry after Nepal's:

```ts
  uk: {
    home: "/uk",
    brandMobile: "UKACI v1",
    brandDesktop: "UK Actuaries Climate Index v1",
    subtitle: "UK Actuaries Climate Index (UKACI)",
    nav: countryNav("uk"),
  },
```

Save everything (`Ctrl+K S` saves all files).

## B11. Look at it and check it

Open <http://localhost:3000/uk> in your browser. If the server stopped, restart it with `npm --prefix frontend run dev`.

> [!check] Checklist
> - [ ] Home shows 4 nations, 218 counties, 6 hazards.
> - [ ] Explore: every nation is coloured. Click England, then every county is coloured.
> - [ ] Choose **Sea Level** under "Shade map by". Coastal counties are coloured and inland ones (Birmingham, Leicester, Herefordshire…) are blank.
> - [ ] Click an inland county. In the right panel, Sea Level says "Not applicable for inland region".
> - [ ] Analyze: both panels work, and the table shows a Sea Level row.
> - [ ] Press `F12` → *Console*. There are no red errors except `/api/visitors` and `/_vercel/...`, which only work on the live site.

**Practise the loop:** open `lib/countries/uk.ts`, change a word in `tagline`, and save. The home page changes straight away. Change it back.

**Final check:** stop the server (`Ctrl+C`) and run

```bash
npm --prefix frontend run build
```

If it ends without errors, the site is ready to publish.

## B12. Save your work and publish

Use the **Source Control** panel (the branch icon in the left bar, `Ctrl+Shift+G`):

1. You see the list of changed files. Click **+** next to *Changes* to stage them all.
2. Type a message, such as `Add unlisted UK portal`, and click **Commit**.
3. Click **Publish Branch** (or **Sync**) to push it to GitHub.

If the repo is connected to Vercel, Vercel builds the branch and gives it a **preview URL**. Check that URL. To make it live, open a pull request on GitHub and merge it into the main branch.

> [!danger] Before merging
> - The data must be **real**: run `process_country_data.py uk`. The yellow banner must be gone.
> - The portal is **unlisted**. `noindex` keeps it out of search results and nothing on the site links to it, but anyone with the URL can open it.
> - `backend/data/` (the big shapefiles) and `.venv/` are git-ignored on purpose. Do not force-add them.

## B13. Useful VS Code keys

| Keys | Does |
|---|---|
| `Ctrl+P` | Open a file by typing its name |
| `Ctrl+Shift+F` | Search across all files |
| `Ctrl+Shift+H` | Replace across files (useful for changing `countries/uk` in a copied folder) |
| ``Ctrl+` `` | Show or hide the terminal |
| `Ctrl+Shift+P` | Command palette: find any VS Code command |
| `Ctrl+C` (in terminal) | Stop the running command |
| `F12` (in the browser) | Developer tools: Console shows errors |

---

# Part C: Checklist for the next country

Example: a three-level country with slug `xyz` and index code `XYZACI`.

**Pipeline**
- [ ] `projects/xyz/derived/composite/regional/xyzaci_<level>.zarr` exists for every level.
- [ ] `spatial/crosswalks/<level>_crosswalk.parquet` exists, and each child crosswalk has a parent-name column.
- [ ] The pipeline used the same shapefiles you give the website.

**Backend**
- [ ] Shapefiles in `backend/data/boundaries/xyz/`, one per level. If a parent column or a level is missing, copy `prepare_uk_boundaries.py` and adapt it.
- [ ] Add an `"xyz"` entry to `countries.py`. Include `"SS"` in `fields` only if the stores have it.
- [ ] `python backend/process_country_boundaries.py xyz`
- [ ] `python backend/process_country_data.py xyz` (or `make_demo_data.py xyz` while waiting).

**Frontend**
- [ ] Copy `lib/countries/uk.ts` to `xyz.ts` and change every value. Add `"SS"` to `components` only if the data has it.
- [ ] Copy the folder `app/uk/` to `app/xyz/`.
- [ ] In `app/xyz`, replace `countries/uk` with `countries/xyz`. Right-click the folder, choose *Find in Folder…*, and use the replace box (5 files).
- [ ] Add an `xyz` entry to `PORTALS` in `Header.tsx`.
- [ ] Run `npm --prefix frontend run dev` and work through the [[#B11. Look at it and check it]] checklist.
- [ ] Run `npm --prefix frontend run build`.

**Four levels?** Copy `app/nepal/` and `lib/nepal.ts` instead of the UK template.

**Going public later:** delete the `robots` block in `app/<slug>/layout.tsx`, and add a card for the country in `components/GeneralHero.tsx` (copy India's card).

---

# When something goes wrong

| What you see | Likely cause | Fix |
|---|---|---|
| A region is white or grey with the composite selected | Its name differs between the data and the boundary files | Use the same shapefile in the pipeline and here |
| Inland counties blank under Sea Level | Nothing wrong: they have no sea level | — |
| A coastal county blank under Sea Level | The pipeline gave it no SS value | Check the pipeline's sea-level step |
| `No derived directory found` | The script cannot find the pipeline output | Set `UK_DERIVED_DIR` to the pipeline's `projects/uk/derived` folder, in the same terminal (step B9) |
| `MISSING ukaci_county.zarr`, with `ukaci_county_ua.zarr` listed as there | The level `id` differs from the pipeline's name | Set the level `id` to the pipeline's name in `countries.py` and `lib/countries/uk.ts`, then rerun step B9 |
| `missing store …ukaci_nation.zarr` | The `derive_from` line is missing from `countries.py` | Add it (step B8) |
| `county_ua_crosswalk.parquet has no 'NATION'` | The `parent_from_geojson` line is missing | Add it (step B8) |
| `no boundary files in …geojson/uk/county_ua` | Map files not made yet | Run `process_country_boundaries.py uk` first (step B9) |
| `has no ['SS']` | The stores lack a sea-level array | Rerun the pipeline's sea-level component |
| `has no 'CTYUA25NM'` | ONS renamed the columns in a newer release | Update the two names at the top of `prepare_uk_boundaries.py` |
| `python` / `node` "not recognised" | Not on PATH | Reinstall (tick "Add to PATH") and restart VS Code |
| Build fails: `Failed to fetch Poppins from Google Fonts` | No internet during the build | Build when connected. Vercel is fine. |
| Yellow banner on the live site | Demo data was deployed | Run `process_country_data.py <slug>` and redeploy |
