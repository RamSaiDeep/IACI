"""Paths and settings. Secrets come from backend/.env (gitignored) or the environment."""

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
DATA_ROOT = Path(os.environ.get("ASK_DATA_ROOT", REPO_DIR / "frontend" / "public" / "data"))
GEO_ROOT = Path(os.environ.get("ASK_GEO_ROOT", REPO_DIR / "frontend" / "public" / "geojson"))


def _load_env_file(path: Path) -> None:
    """Minimal KEY=VALUE reader so we don't need python-dotenv. Never logs values."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env_file(BACKEND_DIR / ".env")


def gateway_key() -> str | None:
    # The .env in this repo spells it VERCEL_AI_GATEWAY_kEY; accept the usual spellings too.
    for name in ("VERCEL_AI_GATEWAY_kEY", "VERCEL_AI_GATEWAY_KEY", "AI_GATEWAY_API_KEY"):
        if os.environ.get(name):
            return os.environ[name]
    return None


GATEWAY_URL = os.environ.get("ASK_GATEWAY_URL", "https://ai-gateway.vercel.sh/v1")
ROUTER_MODEL = os.environ.get("ASK_ROUTER_MODEL", "baseten/mammoth-1")
EXTRACT_MODEL = os.environ.get("ASK_EXTRACT_MODEL", "openai/gpt-5-nano")

# Thresholds chosen with the product owner (Nov 2026).
RELATED_MIN = float(os.environ.get("ASK_RELATED_MIN", "0.5"))
CATEGORY_MIN = float(os.environ.get("ASK_CATEGORY_MIN", "0.6"))

# Comma-separated origins allowed to call the API from a browser.
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get(
    "ASK_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",") if o.strip()]
# Optional regex for origins that change per deploy (Vercel preview URLs), e.g. https://iaci(-.+-ramsaideeps-projects)?\.vercel\.app
ALLOWED_ORIGIN_REGEX = os.environ.get("ASK_ALLOWED_ORIGIN_REGEX") or None
