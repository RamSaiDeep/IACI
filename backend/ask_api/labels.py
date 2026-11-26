"""Plain-language names, per-country facts and constants. User-facing text never shows bare codes."""

COUNTRY_SLUGS = ["india", "uk", "nepal"]
COMPONENT_CODES = ["T90S", "T10S", "PS", "W", "DS", "SS"]

COMPONENT_LABEL = {
    "T90S": "Extreme heat",
    "T10S": "Extreme cold",
    "PS": "Heavy rainfall",
    "W": "Strong wind",
    "DS": "Drought",
    "SS": "Sea level",
}
# Extreme cold enters the composite negatively (verified on the stored values).
COMPONENT_SIGN = {"T90S": 1, "T10S": -1, "PS": 1, "W": 1, "DS": 1, "SS": 1}

HAZARD_TO_CODE = {
    "composite": "COMPOSITE", "overall": "COMPOSITE", "index": "COMPOSITE", "overall index": "COMPOSITE",
    "heat": "T90S", "extreme heat": "T90S", "hot": "T90S", "t90s": "T90S",
    "cold": "T10S", "extreme cold": "T10S", "t10s": "T10S",
    "rainfall": "PS", "rain": "PS", "heavy rainfall": "PS", "precipitation": "PS", "ps": "PS",
    "drought": "DS", "dry": "DS", "dry spell": "DS", "ds": "DS",
    "wind": "W", "strong wind": "W", "w": "W",
    "sea level": "SS", "sea": "SS", "ss": "SS",
}
HAZARD_CHOICES = ["composite", "heat", "cold", "rainfall", "wind", "drought", "sea level"]

COUNTRY_INFO = {
    "india": dict(name="India", index_code="IACI", index_name="Indian Actuaries Climate Index", version="Version 1.0",
                  top_id="state", top_label="State", child_id="district", child_label="District",
                  components=["T90S", "T10S", "PS", "W", "DS", "SS"], example="Guntur"),
    "uk": dict(name="United Kingdom", index_code="UKACI", index_name="UK Actuaries Climate Index", version="Draft Version 1.0",
               top_id="nation", top_label="Nation", child_id="county_ua", child_label="County",
               components=["T90S", "T10S", "PS", "W", "DS", "SS"], example="Kent"),
    # Nepal is landlocked: sea level is not part of its index.
    "nepal": dict(name="Nepal", index_code="NACI", index_name="Nepal Actuaries Climate Index", version="Version 1.0",
                  top_id="province", top_label="Province", child_id="district", child_label="District",
                  components=["T90S", "T10S", "PS", "W", "DS"], example="Kathmandu"),
}

BASELINE = "1991–2020"
DATA_SOURCE = "Copernicus (C3S) ERA5-Land and ORAS5 reanalysis"
COMPOSITE_FORMULA = {
    "coastal": "(T90S − T10S + PS + W + DS + SS) / 6",
    "inland": "(T90S − T10S + PS + W + DS) / 5",
}

# One example per starting point on the Ask page (Snapshot, Compare, Ranking, Trend); shown when a
# question is out of scope. Keep in step with CARDS in frontend/src/components/ask/AskClient.tsx.
EXAMPLE_QUESTIONS = ["How was 2024 for Mumbai?", "Chennai vs Kolkata, 2015–2025",
                     "Worst drought districts in Rajasthan", "Is heat increasing in Delhi?"]

STANDARD_CAVEATS = [
    "Values are standardized anomalies (z-scores) against the 1991–2020 baseline, not raw weather measurements.",
    "Figures are monthly averages over each district's area, so very local or short-lived events are smoothed out.",
    "Ranks run from 1 (highest value) among the years or months in the record.",
]

# Calendar months per season, with the year offset of each month (winter Y = Dec Y-1, Jan Y, Feb Y).
SEASONS = {
    "monsoon": {"months": [(0, 6), (0, 7), (0, 8), (0, 9)], "label": "Monsoon (Jun–Sep)"},
    "summer": {"months": [(0, 3), (0, 4), (0, 5)], "label": "Summer / pre-monsoon (Mar–May)"},
    "post_monsoon": {"months": [(0, 10), (0, 11)], "label": "Post-monsoon (Oct–Nov)"},
    "winter": {"months": [(-1, 12), (0, 1), (0, 2)], "label": "Winter (Dec–Feb)"},
}

MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]

# Old / alternative names -> one or more normalised names used in the data.
# "nepal:x" limits a target to one country. Several targets = genuinely ambiguous (e.g. Aurangabad is still a Bihar district).
PLACE_ALIASES: dict[str, list[str]] = {
    # India: renamed cities and districts
    "gurgaon": ["gurugram"], "bombay": ["mumbai"], "madras": ["chennai"], "calcutta": ["kolkata"],
    "bangalore": ["bengaluru"], "bangalore urban": ["bengaluru urban"], "bangalore rural": ["bengaluru rural"],
    "allahabad": ["prayagraj"], "trivandrum": ["thiruvananthapuram"], "vizag": ["visakhapatnam"],
    "waltair": ["visakhapatnam"], "khurda": ["khordha"], "pondicherry": ["puducherry"],
    "orissa": ["odisha"], "uttaranchal": ["uttarakhand"], "jammu kashmir": ["jammu and kashmir"],
    "j and k": ["jammu and kashmir"], "andaman nicobar": ["andaman and nicobar"],
    "andaman and nicobar islands": ["andaman and nicobar"],
    "sambhaji nagar": ["chhatrapati sambhaji nagar"], "chhatrapati sambhajinagar": ["chhatrapati sambhaji nagar"],
    "aurangabad": ["aurangabad", "chhatrapati sambhaji nagar"],
    "coorg": ["kodagu"], "cochin": ["ernakulam"], "kochi": ["ernakulam"], "poona": ["pune"],
    "benares": ["varanasi"], "banaras": ["varanasi"], "kashi": ["varanasi"],
    "belgaum": ["belagavi"], "mangalore": ["dakshina kannada"], "mangaluru": ["dakshina kannada"],
    "gulbarga": ["kalaburagi"], "tuticorin": ["thoothukudi"], "calicut": ["kozhikode"],
    "hoshangabad": ["narmadapuram"], "ahmednagar": ["ahilyanagar"], "ahmadnagar": ["ahilyanagar"],
    "osmanabad": ["dharashiv"], "faizabad": ["ayodhya"], "baroda": ["vadodara"], "mysore": ["mysuru"],
    "simla": ["shimla"], "nasik": ["nashik"], "trichy": ["tiruchirappalli"], "tiruchi": ["tiruchirappalli"],
    "trichinopoly": ["tiruchirappalli"], "ooty": ["the nilgiris"], "nilgiris": ["the nilgiris"],
    "palghat": ["palakkad"], "trichur": ["thrissur"], "alleppey": ["alappuzha"], "quilon": ["kollam"],
    "cannanore": ["kannur"], "tumkur": ["tumakuru"], "shimoga": ["shivamogga"],
    "chikmagalur": ["chikkamagaluru"], "bijapur": ["vijayapura", "bijapur"], "mohali": ["sas nagar sahibzada ajit singh nagar"],
    "nawanshahr": ["shahid bhagat singh nagar"], "ropar": ["rupnagar"], "muktsar": ["sri muktsar sahib"],
    "mewat": ["nuh"], "noida": ["gautam buddha nagar"], "greater noida": ["gautam buddha nagar"],
    # Official (LGD) spellings that differ from ours
    "south salmara mancachar": ["south salmara"], "dinajpur uttar": ["uttar dinajpur"],
    "dinajpur dakshin": ["dakshin dinajpur"], "east nimar": ["khandwa"], "karimganj": ["sribhumi"],
    "cooch behar": ["koch bihar"], "coochbehar": ["koch bihar"], "purnea": ["purnia"],
    "kanchipuram": ["kancheepuram"], "bhadohi": ["bhadohi"], "sant ravidas nagar": ["bhadohi"],
    "lakhimpur kheri": ["kheri"], "kadapa": ["y s r"], "cuddapah": ["y s r"], "ysr": ["y s r"],
    "ysr kadapa": ["y s r"], "y s r kadapa": ["y s r"], "darjeeling": ["darjiling"], "howrah": ["haora"],
    "hooghly": ["hugli"], "midnapore": ["paschim medinipur", "purba medinipur"], "medinipur": ["paschim medinipur", "purba medinipur"],
    "burdwan": ["purba barddhaman", "paschim barddhaman"], "bardhaman": ["purba barddhaman", "paschim barddhaman"],
    "birbhum": ["birbhum"], "malda": ["maldah"], "purulia": ["puruliya"], "alipurduar": ["alipur duar"],
    "hubli": ["dharwad"], "dharwar": ["dharwad"], "bellary": ["ballari"], "bidar": ["bidar"],
    "dehradun": ["dehradun"], "nainital": ["nainital"], "haridwar": ["haridwar"], "dantewada": ["dakshin bastar dantewara"],
    # Nepal: well-known cities -> their districts
    "pokhara": ["nepal:kaski"], "biratnagar": ["nepal:morang"], "birgunj": ["nepal:parsa"], "bharatpur": ["nepal:chitawan"], "chitwan": ["nepal:chitawan"],
    "dharan": ["nepal:sunsari"], "butwal": ["nepal:rupandehi"], "nepalgunj": ["nepal:banke"], "patan": ["nepal:lalitpur"],
}

# Fixed help answers, picked by the router (no writer model needed).
HELP_TOPICS = {
    "index": ("What the index is",
              "The Actuaries Climate Index tracks how often climate extremes happen compared with normal. "
              "Each month, each place gets a score for six hazards: extreme heat, extreme cold, heavy rainfall, "
              "strong wind, drought and (on coasts) sea level. The overall index combines them with equal weight, "
              "and extreme cold counts negatively because fewer cold extremes are part of a warming signal. "
              "Positive values mean more extremes than the 1991–2020 normal."),
    "heat": ("Extreme heat", "How often days and nights were unusually warm: above the 90th percentile of the "
             "1991–2020 baseline for that place and time of year, shown as a standardized anomaly."),
    "cold": ("Extreme cold", "How often days and nights were unusually cold: below the 10th percentile of the baseline. "
             "A higher value means more cold extremes; it enters the overall index with a minus sign."),
    "rainfall": ("Heavy rainfall", "The maximum consecutive five-day rainfall in the month compared with the baseline: "
                 "a measure of flood and deluge potential."),
    "wind": ("Strong wind", "How often wind speed was unusually high: days above the 90th percentile of the record."),
    "drought": ("Drought", "The longest run of consecutive dry days in the month compared with the baseline: "
                "a measure of moisture deficit and drought stress."),
    "sea level": ("Sea level", "Monthly mean sea level at coastal grid cells (ocean reanalysis) compared with the "
                  "baseline. Inland places leave it out so they are not penalised for lacking a coast; Nepal's index "
                  "has no sea level at all."),
    "baseline": ("Baseline and anomalies", "Every value is a standardized anomaly (z-score): the difference from the 1991–2020 "
                 "average for that place and calendar month, divided by its usual variability. 0 is normal, +1 is one "
                 "standard deviation above normal."),
    "ranks": ("How ranks work", "Ranks compare a year, season or month with the same period in every other year of the "
              "record. Rank 1 is the highest value. For an incomplete year, only the months available are compared."),
    "data": ("Data and coverage", "Built from Copernicus ERA5-Land (land weather) and ORAS5 (ocean) reanalysis. "
             "India: 36 states and union territories and their districts. UK: 4 nations and their counties and "
             "unitary authorities (draft). Nepal: 7 provinces and 77 districts. Monthly values from 1991."),
}
