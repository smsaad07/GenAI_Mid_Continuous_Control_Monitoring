// Minimal Groq (OpenAI-compatible) chat client with usage + cost accounting.
// The key is read server-side only; it never reaches the browser.

export const DEFAULT_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
export const REASONING_EFFORT = (process.env.GROQ_REASONING_EFFORT || "medium") as "low" | "medium" | "high";

// USD per 1M tokens (third-party trackers of Groq on-demand pricing, Oct 2026; verify at console.groq.com).
export const PRICES: Record<string, { input: number; cached: number; output: number }> = {
  "openai/gpt-oss-120b": { input: 0.15, cached: 0.075, output: 0.6 },
  "openai/gpt-oss-20b": { input: 0.075, cached: 0.0375, output: 0.3 },
};

export interface Usage { prompt_tokens: number; completion_tokens: number; cached_tokens: number; total_tokens: number }
export interface ChatResult { message: any; usage: Usage; latency_ms: number; model: string; finish_reason: string }

export class RateLimitError extends Error {
  retryAfter: number;
  constructor(msg: string, retryAfter: number) { super(msg); this.retryAfter = retryAfter; }
}

export function hasKey() { return !!process.env.GROQ_API_KEY; }

export function costUsd(model: string, u: Usage): number {
  const p = PRICES[model] || PRICES["openai/gpt-oss-120b"];
  const uncached = Math.max(0, u.prompt_tokens - u.cached_tokens);
  return (uncached * p.input + u.cached_tokens * p.cached + u.completion_tokens * p.output) / 1_000_000;
}

export async function chat(body: {
  messages: any[]; tools?: any[]; tool_choice?: any; model?: string; temperature?: number; max_tokens?: number;
  reasoning_effort?: "low" | "medium" | "high"; response_format?: any;
}, attempt = 0): Promise<ChatResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not configured");
  const model = body.model || DEFAULT_MODEL;
  const payload: any = {
    model, messages: body.messages, temperature: body.temperature ?? 0.2, max_completion_tokens: body.max_tokens ?? 2048,
    reasoning_effort: body.reasoning_effort ?? REASONING_EFFORT,
  };
  if (body.tools) { payload.tools = body.tools; payload.tool_choice = body.tool_choice ?? "auto"; }
  if (body.response_format) payload.response_format = body.response_format;
  const t0 = Date.now();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const latency = Date.now() - t0;
  if (res.status === 429 || res.status >= 500) {
    const ra = Number(res.headers.get("retry-after") || "0") || 2 ** attempt * 2;
    const text = await res.text();
    if (attempt < 3 && ra <= 20) {
      await new Promise((r) => setTimeout(r, ra * 1000));
      return chat(body, attempt + 1);
    }
    if (res.status === 429) throw new RateLimitError(`Groq rate limit: ${text.slice(0, 300)}`, ra);
    throw new Error(`Groq ${res.status}: ${text.slice(0, 300)}`);
  }
  const data: any = await res.json();
  if (!res.ok) {
    // tool_use_failed: model produced a malformed tool call; surface it so the agent loop can retry
    throw new Error(`Groq ${res.status}: ${JSON.stringify(data?.error || data).slice(0, 400)}`);
  }
  const u = data.usage || {};
  const usage: Usage = {
    prompt_tokens: u.prompt_tokens || 0, completion_tokens: u.completion_tokens || 0,
    cached_tokens: u.prompt_tokens_details?.cached_tokens || 0, total_tokens: u.total_tokens || 0,
  };
  return { message: data.choices?.[0]?.message || {}, usage, latency_ms: latency, model, finish_reason: data.choices?.[0]?.finish_reason };
}

export function addUsage(a: Usage, b: Usage): Usage {
  return { prompt_tokens: a.prompt_tokens + b.prompt_tokens, completion_tokens: a.completion_tokens + b.completion_tokens, cached_tokens: a.cached_tokens + b.cached_tokens, total_tokens: a.total_tokens + b.total_tokens };
}
export const ZERO: Usage = { prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0, total_tokens: 0 };
