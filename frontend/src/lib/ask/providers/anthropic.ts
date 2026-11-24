import { AskError, type ContentBlock, type LLMProvider, type LLMRequest, type LLMResponse } from "./types";

const URL = "https://api.anthropic.com/v1/messages";

/** Remove every occurrence of the key from a string, defensively. */
function scrub(s: string, key: string): string {
  return key ? s.split(key).join("[redacted]") : s;
}

/**
 * Anthropic Messages API over fetch (no SDK dependency). The key lives only in
 * this object for the duration of one request; it is never logged.
 * Notes for current models: no `temperature`, no forced tool_choice, thinking
 * left at its default (adaptive) and returned thinking blocks are passed back
 * unchanged by the agent loop.
 */
export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic";
  constructor(private apiKey: string, readonly model: string) {}

  private async call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await fetch(URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(110_000),
      });
    } catch {
      throw new AskError("model_error", "Could not reach the model provider. Check your connection and try again.", 502);
    }
    if (res.ok) return (await res.json()) as Record<string, unknown>;

    let detail = "";
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      detail = scrub(j.error?.message ?? "", this.apiKey).slice(0, 200);
    } catch { /* ignore */ }

    if (res.status === 401 || res.status === 403)
      throw new AskError("invalid_key", "The API key was rejected. Check that it is correct, active and allowed to use this model.", 401);
    if (res.status === 402 || /credit balance|billing/i.test(detail))
      throw new AskError("insufficient_credit", "The provider says this account has insufficient credit. Add credit in the provider's console, then try again.", 402);
    if (res.status === 429)
      throw new AskError("rate_limited", "The provider is rate-limiting this key. Wait a moment and try again.", 429);
    if (res.status === 529 || res.status >= 500)
      throw new AskError("overloaded", "The model provider is temporarily unavailable. Try again shortly.", 503);
    if (res.status === 404)
      throw new AskError("model_error", `The model "${this.model}" is not available to this key. Pick another model.`, 400);
    throw new AskError("bad_request", `The model provider rejected the request${detail ? `: ${detail}` : "."}`, 400);
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const json = await this.call({
      model: this.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: req.messages,
      tools: req.tools,
      // Short, routine reasoning is enough here; the numbers come from tools.
      output_config: { effort: "low" },
    });
    const usage = (json.usage ?? {}) as { input_tokens?: number; output_tokens?: number };
    return {
      content: (json.content as ContentBlock[]) ?? [],
      stopReason: String(json.stop_reason ?? ""),
      usage: { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0 },
    };
  }

  async testKey(): Promise<void> {
    await this.call({
      model: this.model,
      max_tokens: 16,
      messages: [{ role: "user", content: "Reply with OK." }],
    });
  }
}
