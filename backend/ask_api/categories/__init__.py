"""The six categories. Each module exposes NAME, SCHEMA (slots GPT-5 nano fills), WRITER_SLOTS,
run(slots, ctx) -> Planned, assemble(planned, narrative) -> sections, and template(planned) -> narrative."""

from . import compare, event, help, rank, snapshot, trend

CATEGORIES = {m.NAME: m for m in (snapshot, compare, rank, trend, event, help)}

# Descriptions Mammoth-1 chooses between (order matters only for display).
CHOICES = [
    {"value": "snapshot", "description": "How one place did in one year, season or month (e.g. 'How was 2024 for Nellore?')"},
    {"value": "compare", "description": "Two to four places side by side (e.g. 'Chennai vs Hyderabad')"},
    {"value": "rank", "description": "Many places ordered by a hazard: worst, top, most, fastest worsening (e.g. 'worst drought districts in Odisha')"},
    {"value": "trend", "description": "Whether a hazard is rising or falling over time at one place (e.g. 'is heat increasing in Guntur?')"},
    {"value": "event", "description": "One specific month or extreme event at one place versus the same month in other years (e.g. 'Wayanad July 2024')"},
    {"value": "help", "description": "What the index, a hazard, the baseline or the data means; how it is calculated"},
]
LABELS = {"snapshot": "Snapshot", "compare": "Compare", "rank": "Ranking", "trend": "Trend", "event": "Event", "help": "Help"}
