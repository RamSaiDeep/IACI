import { NextResponse } from "next/server";
import { runAsk } from "../../../lib/ask/agent";
import { makeProvider } from "../../../lib/ask/providers";
import { AskError } from "../../../lib/ask/providers/types";
import { COUNTRY_SLUGS } from "../../../lib/ask/labels";
import type { AskRequest } from "../../../lib/ask/report-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const noStore = { "Cache-Control": "no-store" };

/**
 * The API key arrives per request in the `x-llm-key` header, is held only in
 * local variables for this request and is never logged, stored or echoed.
 * Errors returned to the client are built from fixed messages (AskError).
 */
export async function POST(req: Request) {
  const key = req.headers.get("x-llm-key");
  try {
    const body = (await req.json()) as { action?: string; request?: AskRequest; model?: string; provider?: string; mock?: boolean; stream?: boolean };

    if (body.action === "test-key") {
      const provider = makeProvider({ key, provider: body.provider, model: body.model, mock: body.mock });
      await provider.testKey();
      return NextResponse.json({ ok: true, model: provider.model }, { headers: noStore });
    }

    const r = body.request;
    if (!r || !(COUNTRY_SLUGS as string[]).includes(r.country) || !["free", "year", "compare", "screen", "event"].includes(r.mode))
      throw new AskError("bad_request", "That request was not understood.");
    if (r.question && r.question.length > 600) throw new AskError("bad_request", "Please keep the question under 600 characters.");
    if (r.mode === "free" && !r.question?.trim()) throw new AskError("bad_request", "Type a question first.");

    const provider = makeProvider({ key, provider: r.provider ?? body.provider, model: r.model ?? body.model, mock: body.mock });
    if (body.stream) {
      // NDJSON: {progress} lines while working, then one {result} or {error} line.
      const enc = new TextEncoder();
      const stream = new ReadableStream({
        async start(ctl) {
          const send = (o: unknown) => ctl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
          try {
            send({ progress: "Request received" });
            send({ result: await runAsk(r, provider, (text) => send({ progress: text })) });
          } catch (e) {
            send({ error: errorBody(e).body.error });
          }
          ctl.close();
        },
      });
      return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", ...noStore } });
    }
    const out = await runAsk(r, provider);
    return NextResponse.json(out, { headers: noStore });
  } catch (e) {
    const { body, status } = errorBody(e);
    return NextResponse.json(body, { status, headers: noStore });
  }
}

function errorBody(e: unknown) {
  if (e instanceof AskError) return { body: { error: { code: e.code, message: e.message } }, status: e.status };
  // Deliberately no logging of the error object: it could carry request data.
  return { body: { error: { code: "internal", message: "Something went wrong while building the answer. Please try again." } }, status: 500 };
}
