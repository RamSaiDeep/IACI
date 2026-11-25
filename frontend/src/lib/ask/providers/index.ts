import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";
import { OpenAICompatProvider } from "./openai-compat";
import { AskError, DEFAULT_MODELS, PROVIDER_LABELS, type LLMProvider, type ProviderId } from "./types";

/** `mock` is only honoured when NEXT_PUBLIC_ASK_ALLOW_MOCK=1 (set it in .env.local for development). */
export function makeProvider(opts: { key?: string | null; provider?: string; model?: string; mock?: boolean }): LLMProvider {
  if (opts.mock) {
    if (process.env.NEXT_PUBLIC_ASK_ALLOW_MOCK !== "1" && process.env.NODE_ENV === "production")
      throw new AskError("bad_request", "The demo (mock) assistant is disabled on this server.", 400);
    return new MockProvider();
  }
  if (!opts.key) throw new AskError("missing_key", "Add your API key to get answers. The starting points and forms work without one.", 401);
  const provider = (opts.provider ?? "anthropic") as ProviderId;
  if (!(provider in PROVIDER_LABELS)) throw new AskError("bad_request", "Unknown provider.", 400);
  const model = opts.model?.trim() || DEFAULT_MODELS[provider];
  if (!/^[\w.:\/-]{1,100}$/.test(model)) throw new AskError("bad_request", "That model name looks invalid. Copy it exactly from the provider's model list.", 400);
  if (provider === "anthropic") return new AnthropicProvider(opts.key, model);
  return new OpenAICompatProvider(provider, opts.key, model);
}
