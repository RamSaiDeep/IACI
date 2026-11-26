"""Run the Ask agent's test set (ask_api/evals/agent_questions.json) through the real loop and a real model.

    python backend/run_agent_eval.py                          # Vercel AI Gateway, openai/gpt-5-nano (site key in backend/.env)
    python backend/run_agent_eval.py --provider openrouter    # OPENROUTER_API_KEY, free Gemma default
    python backend/run_agent_eval.py --only A1,L5 --model google/gemma-4-31b-it:free --provider openrouter

Keys come from the environment (OPENROUTER_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY) or, for the
gateway, backend/.env. Writes <out>.json (every answer in full) and <out>.md (one line per question),
and prints the summary. Automatic checks: the kind of reply, that an expected tool was called, that no
forbidden phrase appears, and that no tool call failed. Read the answers too: the checks can't judge wording.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent))
from ask_api import config  # noqa: E402
from ask_api.agent.loop import run_agent  # noqa: E402
from ask_api.agent.providers import OpenAIStyleModel, make_model  # noqa: E402
from ask_api.errors import AskError  # noqa: E402
from ask_api.tools.context import ToolContext  # noqa: E402

QUESTIONS = Path(__file__).parent / "ask_api" / "evals" / "agent_questions.json"
KEY_ENV = {"openrouter": "OPENROUTER_API_KEY", "anthropic": "ANTHROPIC_API_KEY", "gemini": "GEMINI_API_KEY"}


def build_model(provider: str, model: str | None, client: httpx.AsyncClient):
    if provider == "gateway":  # the site's own key: for testing only, the website never uses it for the agent
        return OpenAIStyleModel(model or "openai/gpt-5-nano", config.gateway_key(), client,
                                config.GATEWAY_URL + "/chat/completions", "Vercel AI Gateway")
    return make_model(provider, model, os.environ.get(KEY_ENV[provider]), client)


def check(q: dict, out: dict | None, error: str | None) -> list[str]:
    exp = q["expect"]
    if error:
        return [f"error: {error}"]
    problems = []
    kinds = exp["kind"] if isinstance(exp["kind"], list) else [exp["kind"]]
    if out["kind"] not in kinds:
        problems.append(f"kind {out['kind']} (expected {'/'.join(kinds)})")
    used = [t["name"] for t in out["trace"]]
    if exp["tools"] and out["kind"] == "answer" and not set(exp["tools"]) & set(used):
        problems.append(f"none of {exp['tools']} called")
    text = json.dumps({k: out.get(k) for k in ("headline", "sections", "message", "question")}, ensure_ascii=False)
    problems += [f'says "{p}"' for p in exp.get("no_text", []) if p.lower() in text.lower()]
    failed = [t["name"] for t in out["trace"] if not t["ok"]]
    if failed:
        problems.append(f"tool errors: {', '.join(failed)}")
    return problems


async def run_one(q: dict, args, client, sem) -> dict:
    async with sem:
        t0 = time.time()
        out, error = None, None
        for attempt in range(4):  # a rate limit is about the test run, not the agent: wait and retry
            try:
                model = build_model(args.provider, args.model, client)
                ctx = ToolContext(q.get("country", "india"), client=client)
                out, error = await run_agent(q["question"], ctx, model, lambda _s: None), None
                break
            except AskError as e:
                error = f"{e.code}: {e.message}"
                if e.code != "rate_limited" or attempt == 3:
                    break
                await asyncio.sleep(30 * (attempt + 1))
            except Exception as e:  # noqa: BLE001 - a crash in one question must not stop the run
                error = f"{type(e).__name__}: {e}"
                break
        secs = time.time() - t0
        problems = check(q, out, error)
        print(f"{'PASS' if not problems else 'FAIL'} {q['id']:3} {secs:5.0f}s  {q['question'][:60]}"
              + (f"  -> {'; '.join(problems)}" if problems else ""), flush=True)
        return {"id": q["id"], "group": q["group"], "question": q["question"], "seconds": round(secs, 1),
                "problems": problems, "result": out, "error": error}


def summary_md(rows: list[dict], args) -> str:
    passed = sum(1 for r in rows if not r["problems"])
    lines = [f"# Agent test set: {passed} of {len(rows)} passed",
             f"Provider {args.provider}, model {args.model or 'default'}.", "",
             "| ID | Question | Result | Reply | Tools | Seconds |", "|---|---|---|---|---|---|"]
    for r in rows:
        out = r["result"] or {}
        reply = (out.get("headline") or out.get("question") or out.get("message") or r["error"] or "").replace("|", "/")
        tools = ", ".join(t["name"] for t in out.get("trace", []) if t["name"] != "triage")
        status = "pass" if not r["problems"] else "FAIL: " + "; ".join(r["problems"]).replace("|", "/")
        lines.append(f"| {r['id']} | {r['question']} | {status} | {reply[:160]} | {tools} | {r['seconds']:.0f} |")
    return "\n".join(lines) + "\n"


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", default="gateway", choices=["gateway", *KEY_ENV])
    ap.add_argument("--model")
    ap.add_argument("--only", help="comma-separated question ids")
    ap.add_argument("--concurrency", type=int, default=4)
    ap.add_argument("--out", default="agent_eval")
    args = ap.parse_args()

    qs = json.loads(QUESTIONS.read_text(encoding="utf-8"))["questions"]
    if args.only:
        wanted = set(args.only.split(","))
        qs = [q for q in qs if q["id"] in wanted]
    sem = asyncio.Semaphore(args.concurrency)
    async with httpx.AsyncClient() as client:
        rows = await asyncio.gather(*(run_one(q, args, client, sem) for q in qs))
    out = Path(args.out)
    out.with_suffix(".json").write_text(json.dumps(rows, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    out.with_suffix(".md").write_text(summary_md(rows, args), encoding="utf-8")
    tokens = sum((r["result"] or {}).get("usage", {}).get("inputTokens", 0) for r in rows)
    print(f"\n{sum(1 for r in rows if not r['problems'])} of {len(rows)} passed; "
          f"{tokens:,} input tokens; written {out.with_suffix('.json')} and {out.with_suffix('.md')}")


if __name__ == "__main__":
    asyncio.run(main())
