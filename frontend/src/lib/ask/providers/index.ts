import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";
import { AskError, DEFAULT_MODEL, MODELS, type LLMProvider } from "./types";

/** `mock` is only honoured when NEXT_PUBLIC_ASK_ALLOW_MOCK=1 (set it in .env.local for development). */
export function makeProvider(opts: { key?: string | null; model?: string; mock?: boolean }): LLMProvider {
  if (opts.mock) {
    if (process.env.NEXT_PUBLIC_ASK_ALLOW_MOCK !== "1" && process.env.NODE_ENV === "production")
      throw new AskError("bad_request", "The demo (mock) assistant is disabled on this server.", 400);
    return new MockProvider();
  }
  if (!opts.key) throw new AskError("missing_key", "Add your API key to get answers. The starting points and forms work without one.", 401);
  const model = MODELS.some((m) => m.id === opts.model) ? opts.model! : (process.env.ASK_DEFAULT_MODEL ?? DEFAULT_MODEL);
  return new AnthropicProvider(opts.key, model);
}
