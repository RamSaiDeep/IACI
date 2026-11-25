import { AskError, type ContentBlock, type LLMMessage, type LLMProvider, type LLMRequest, type LLMResponse } from "./types";

/** Chat-completions endpoints. Gemini exposes an OpenAI-compatible one, so a single class serves both. */
export const ENDPOINTS = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
} as const;

type OAIMessage = Record<string, unknown>;

function scrub(s: string, key: string): string {
  return key ? s.split(key).join("[redacted]") : s;
}

/** Anthropic-shaped messages (what the agent loop speaks) -> OpenAI chat messages. */
export function toOpenAIMessages(system: string, messages: LLMMessage[]): OAIMessage[] {
  const out: OAIMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") { out.push({ role: m.role, content: m.content }); continue; }
    const blocks = m.content as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (m.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => String(b.text)).join("\n");
      const calls = blocks.filter((b) => b.type === "tool_use").map((b) => ({
        id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
      }));
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      // Tool results must directly follow the assistant tool_calls message, so emit them first.
      for (const b of blocks) if (b.type === "tool_result") out.push({ role: "tool", tool_call_id: b.tool_use_id, content: String(b.content) });
      const text = blocks.filter((b) => b.type === "text").map((b) => String(b.text)).join("\n");
      if (text) out.push({ role: "user", content: text });
    }
  }
  return out;
}

export class OpenAICompatProvider implements LLMProvider {
  constructor(readonly id: "gemini" | "openrouter", private apiKey: string, readonly model: string) {}

  private async call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await fetch(ENDPOINTS[this.id], {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, ...body }),
        signal: AbortSignal.timeout(110_000),
      });
    } catch {
      throw new AskError("model_error", "Could not reach the model provider. Check your connection and try again.", 502);
    }
    if (res.ok) return (await res.json()) as Record<string, unknown>;

    let detail = "";
    try {
      const j = (await res.json()) as { error?: { message?: string } } | { error?: { message?: string } }[];
      detail = scrub((Array.isArray(j) ? j[0] : j)?.error?.message ?? "", this.apiKey).slice(0, 200);
    } catch { /* ignore */ }

    if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(detail)))
      throw new AskError("invalid_key", "The API key was rejected. Check that it is correct, active and allowed to use this model.", 401);
    if (res.status === 402)
      throw new AskError("insufficient_credit", "The provider says this account has insufficient credit. Add credit in the provider's console, then try again.", 402);
    if (res.status === 429)
      throw new AskError("rate_limited", "The provider is rate-limiting this key (free tiers have low limits). Wait a moment and try again.", 429);
    if (res.status >= 500)
      throw new AskError("overloaded", "The model provider is temporarily unavailable. Try again shortly.", 503);
    if (res.status === 404)
      throw new AskError("model_error", `The model "${this.model}" is not available to this key. Pick another model.`, 400);
    throw new AskError("bad_request", `The model provider rejected the request${detail ? `: ${detail}` : "."}`, 400);
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const json = await this.call({
      max_tokens: req.maxTokens,
      messages: toOpenAIMessages(req.system, req.messages),
      tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })),
    });
    const choice = (json.choices as { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }; finish_reason?: string }[] | undefined)?.[0];
    const msg = choice?.message ?? {};
    const content: ContentBlock[] = [];
    if (msg.content) content.push({ type: "text", text: msg.content });
    for (const c of msg.tool_calls ?? []) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(c.function.arguments || "{}"); } catch { /* malformed args: the tool will report what is missing */ }
      content.push({ type: "tool_use", id: c.id, name: c.function.name, input });
    }
    const usage = (json.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
    return {
      content,
      stopReason: msg.tool_calls?.length ? "tool_use" : choice?.finish_reason === "length" ? "max_tokens" : "end_turn",
      usage: { inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0 },
    };
  }

  async testKey(): Promise<void> {
    await this.call({ max_tokens: 16, messages: [{ role: "user", content: "Reply with OK." }] });
  }
}
