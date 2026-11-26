"""FastAPI app. Run locally from backend/:  uvicorn ask_api.main:app --port 8000

The visitor's key arrives per request in the `x-llm-key` header, is used only for the writer
call and is never logged, stored or echoed. Errors returned are fixed, safe messages.
"""

from __future__ import annotations

import asyncio
import json

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from . import config
from .agent.providers import free_tool_models, supports_tools
from .errors import AskError
from .pipeline import run_ask
from .writer import Writer

app = FastAPI(title="Ask the Index", docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=config.ALLOWED_ORIGINS,
                   allow_origin_regex=config.ALLOWED_ORIGIN_REGEX, allow_methods=["POST", "GET"],
                   allow_headers=["content-type", "x-llm-key"], max_age=600)
NO_STORE = {"Cache-Control": "no-store"}


def _err(e: Exception) -> tuple[dict, int]:
    if isinstance(e, AskError):
        return {"code": e.code, "message": e.message}, e.status
    # Deliberately no logging of the exception: it could carry request data.
    return {"code": "internal", "message": "Something went wrong while building the answer. Please try again."}, 500


@app.get("/health")
async def health():
    return {"ok": True, "gateway_key": bool(config.gateway_key()), "agent": config.AGENT_ENABLED}


@app.get("/models/free")
async def models_free():
    """Free OpenRouter models that can use tools, for the key panel's suggestions (default first)."""
    async with httpx.AsyncClient() as client:
        ids = await free_tool_models(client)
    return JSONResponse({"models": ids, "default": ids[0] if ids else None}, headers={"Cache-Control": "public, max-age=3600"})


@app.post("/test-key")
async def test_key(req: Request):
    try:
        body = await req.json()
        w = Writer(body.get("provider") or "anthropic", body.get("model"), req.headers.get("x-llm-key"))
        async with httpx.AsyncClient() as client:
            await w.test(client)
            if config.AGENT_ENABLED and w.provider == "openrouter" and await supports_tools(client, w.model) is False:
                raise AskError("bad_request", f"{w.model} works, but it can't use tools, which answers need. "
                                              "Pick a model from the suggestions.")
        return JSONResponse({"ok": True, "model": w.model}, headers=NO_STORE)
    except Exception as e:  # noqa: BLE001
        err, status = _err(e)
        return JSONResponse({"error": err}, status_code=status, headers=NO_STORE)


@app.post("/ask")
async def ask(req: Request):
    """NDJSON stream: {"progress": "..."} lines while working, then one {"result": ...} or {"error": ...}."""
    try:
        body = await req.json()
    except json.JSONDecodeError:
        return JSONResponse({"error": {"code": "bad_request", "message": "That request was not understood."}}, 400)
    key = req.headers.get("x-llm-key")
    q: asyncio.Queue = asyncio.Queue()

    async def work():
        try:
            out = await run_ask(body, key, lambda t: q.put_nowait({"progress": t}))
            q.put_nowait({"result": out})
        except Exception as e:  # noqa: BLE001
            q.put_nowait({"error": _err(e)[0]})
        finally:
            q.put_nowait(None)

    async def stream():
        task = asyncio.create_task(work())
        yield json.dumps({"progress": "Request received"}) + "\n"
        try:
            while (item := await q.get()) is not None:
                yield json.dumps(item, ensure_ascii=False) + "\n"
        finally:
            task.cancel()  # client went away: stop spending tokens

    return StreamingResponse(stream(), media_type="application/x-ndjson", headers=NO_STORE)
