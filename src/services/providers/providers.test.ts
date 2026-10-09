import { describe, expect, test } from "vitest";
import { adjust as adjustAnthropic, buildAnthropicBody, parseAnthropicModels, parseAnthropicResponse } from "./anthropic";
import { adjustOpenAiBody, buildOpenAiBody, parseOpenAiModels, parseOpenAiResponse } from "./openai";
import { toNormMessages, withJsonInstructions } from "./shared";
import { GeminiBlockedError, GeminiEmptyResponseError, GeminiError } from "../aiErrors";
import { PROVIDERS, cleanBaseUrl, isProviderId } from "../../config/providers";
import { applyPatch, viewForProvider } from "../../db/settingsView";

const accepts = { pdf: true, image: true };
const caught = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
};

describe("toNormMessages", () => {
  test("turns a string prompt into one user message", () => {
    const m = toNormMessages("hello", "Claude", accepts);
    expect(m).toEqual([{ role: "user", parts: [{ text: "hello" }] }]);
  });
  test("maps Gemini roles and merges neighbours of the same role", () => {
    const m = toNormMessages([
      { role: "user", parts: [{ text: "a" }] },
      { role: "user", parts: [{ text: "b" }] },
      { role: "model", parts: [{ text: "c" }] },
    ], "Claude", accepts);
    expect(m).toHaveLength(2);
    expect(m[0].parts).toHaveLength(2);
    expect(m[1].role).toBe("assistant");
  });
  test("keeps images and PDFs as separate part kinds", () => {
    const m = toNormMessages([{ role: "user", parts: [{ inlineData: { mimeType: "image/png", data: "AAA" } }, { inlineData: { mimeType: "application/pdf", data: "BBB" } }] }], "Claude", accepts);
    expect(m[0].parts[0].image?.data).toBe("AAA");
    expect(m[0].parts[1].document?.data).toBe("BBB");
  });
  test("refuses a PDF for a provider that cannot read it, with a useful message", () => {
    expect(() => toNormMessages([{ role: "user", parts: [{ inlineData: { mimeType: "application/pdf", data: "x" } }] }], "OpenAI", { pdf: false, image: true })).toThrow(/cannot read PDF/);
  });
});

describe("Claude requests and replies", () => {
  const req = { model: "claude-x", system: "Be brief.", messages: toNormMessages("hi", "Claude", accepts), temperature: 0.3, maxTokens: 500, json: false };
  test("builds a Messages API body", () => {
    const b = buildAnthropicBody(req) as { model: string; max_tokens: number; system: string; messages: Array<{ content: Array<{ type: string }> }> };
    expect(b.model).toBe("claude-x");
    expect(b.max_tokens).toBe(500);
    expect(b.system).toBe("Be brief.");
    expect(b.messages[0].content[0].type).toBe("text");
  });
  test("always sets max_tokens because Claude requires it", () => {
    const b = buildAnthropicBody({ ...req, maxTokens: undefined }) as { max_tokens: number };
    expect(b.max_tokens).toBeGreaterThan(1000);
  });
  test("adds JSON instructions and the schema when JSON is requested", () => {
    const b = buildAnthropicBody({ ...req, json: true, schema: { type: "OBJECT" } }) as { system: string };
    expect(b.system).toContain("valid JSON");
    expect(b.system).toContain("OBJECT");
  });
  test("reads text blocks, usage and the stop reason", () => {
    const r = parseAnthropicResponse({ content: [{ type: "text", text: "Hello" }, { type: "text", text: " there" }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 4 } });
    expect(r.text).toBe("Hello there");
    expect(r.finishReason).toBe("STOP");
    expect(r.usage?.totalTokens).toBe(14);
  });
  test("reports a cut-off reply as MAX_TOKENS", () => {
    expect(parseAnthropicResponse({ content: [{ type: "text", text: "partial" }], stop_reason: "max_tokens" }).finishReason).toBe("MAX_TOKENS");
  });
  test("throws typed errors for empty and refused replies", () => {
    expect(caught(() => parseAnthropicResponse({ content: [], stop_reason: "end_turn" })) instanceof GeminiEmptyResponseError).toBe(true);
    expect(caught(() => parseAnthropicResponse({ content: [], stop_reason: "refusal" })) instanceof GeminiBlockedError).toBe(true);
  });
  test("lowers max_tokens to the limit the API names, and drops an unsupported temperature", () => {
    const lowered = adjustAnthropic({ max_tokens: 65536, temperature: 0.3 }, "max_tokens: 65536 > 32000, which is the maximum allowed number of output tokens");
    expect(lowered?.max_tokens).toBe(32000);
    const noTemp = adjustAnthropic({ max_tokens: 100, temperature: 0.3 }, "`temperature` is not supported for this model");
    expect(noTemp && "temperature" in noTemp).toBe(false);
    expect(adjustAnthropic({ max_tokens: 100 }, "something else")).toBe(null);
  });
  test("lists only Claude models", () => {
    const list = parseAnthropicModels({ data: [{ id: "claude-a", display_name: "Claude A" }, { id: "other" }] });
    expect(list).toEqual([{ id: "claude-a", displayName: "Claude A" }]);
  });
});

describe("OpenAI-style requests and replies", () => {
  const req = { model: "m", system: "Sys", messages: toNormMessages("hi", "OpenAI", accepts), temperature: 0.2, maxTokens: 300, json: true };
  test("puts the system text first and asks for a JSON object", () => {
    const b = buildOpenAiBody(req) as { messages: Array<{ role: string; content: string }>; response_format: { type: string }; max_tokens: number };
    expect(b.messages[0].role).toBe("system");
    expect(b.messages[0].content).toContain("valid JSON");
    expect(b.messages[1].content).toBe("hi");
    expect(b.response_format.type).toBe("json_object");
    expect(b.max_tokens).toBe(300);
  });
  test("sends images as data URLs", () => {
    const m = toNormMessages([{ role: "user", parts: [{ text: "look" }, { inlineData: { mimeType: "image/png", data: "QQ==" } }] }], "OpenAI", accepts);
    const b = buildOpenAiBody({ ...req, messages: m, json: false }) as { messages: Array<{ content: Array<{ type: string; image_url?: { url: string } }> }> };
    expect(b.messages[1].content[1].image_url?.url).toBe("data:image/png;base64,QQ==");
  });
  test("reads the message text, usage and finish reason", () => {
    const r = parseOpenAiResponse({ choices: [{ message: { content: "ok" }, finish_reason: "length" }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } });
    expect(r.text).toBe("ok");
    expect(r.finishReason).toBe("MAX_TOKENS");
    expect(r.usage?.outputTokens).toBe(2);
  });
  test("throws typed errors for empty and filtered replies", () => {
    expect(caught(() => parseOpenAiResponse({ choices: [{ message: { content: null }, finish_reason: "stop" }] })) instanceof GeminiEmptyResponseError).toBe(true);
    expect(caught(() => parseOpenAiResponse({ choices: [{ message: { content: "" }, finish_reason: "content_filter" }] })) instanceof GeminiBlockedError).toBe(true);
  });
  test("adapts to servers that want max_completion_tokens or reject temperature", () => {
    const a = adjustOpenAiBody({ max_tokens: 100, temperature: 1 }, "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead.");
    expect(a?.max_completion_tokens).toBe(100);
    expect(a && "max_tokens" in a).toBe(false);
    const t = adjustOpenAiBody({ temperature: 0.2, max_tokens: 5 }, "Unsupported value: 'temperature' does not support 0.2 with this model.");
    expect(t && "temperature" in t).toBe(false);
    const f = adjustOpenAiBody({ response_format: { type: "json_object" } }, "response_format is not supported");
    expect(f && "response_format" in f).toBe(false);
  });
  test("lowers an output limit that is too high", () => {
    const a = adjustOpenAiBody({ max_tokens: 65536 }, "max_tokens is too large: 65536. This model supports at most 16384 completion tokens.");
    expect(a?.max_tokens).toBe(16384);
  });
  test("hides non-chat models on OpenAI's own host only", () => {
    const data = { data: [{ id: "gpt-4o" }, { id: "text-embedding-3-small" }, { id: "whisper-1" }] };
    expect(parseOpenAiModels(data, true).map((m) => m.id)).toEqual(["gpt-4o"]);
    expect(parseOpenAiModels(data, false)).toHaveLength(3);
  });
});

describe("shared helpers", () => {
  test("JSON instructions append to an existing system prompt", () => {
    expect(withJsonInstructions("Base", undefined).startsWith("Base")).toBe(true);
  });
  test("provider ids and base URLs are validated", () => {
    expect(isProviderId("anthropic")).toBe(true);
    expect(isProviderId("copilot")).toBe(false);
    expect(cleanBaseUrl("https://openrouter.ai/api/v1/")).toBe("https://openrouter.ai/api/v1");
    expect(cleanBaseUrl("http://example.com/v1")).toBe("");
    expect(cleanBaseUrl("http://localhost:11434/v1")).toBe("http://localhost:11434/v1");
    expect(PROVIDERS.openai.customBaseUrl).toBe(true);
  });
  test("GeminiError carries a code the callers can branch on", () => {
    expect(new GeminiError("QUOTA_EXCEEDED", "x").code).toBe("QUOTA_EXCEEDED");
  });
});

describe("per-provider model settings", () => {
  const stored = { defaultModel: "gemini-flash-latest", featureModels: { impact: "gemini-2.5-flash" }, fallbackModels: ["g2"], temperature: 0.3 };
  test("Gemini keeps the original top-level fields", () => {
    const v = viewForProvider(stored, "gemini");
    expect(v.defaultModel).toBe("gemini-flash-latest");
    expect(v.fallbackModels).toEqual(["g2"]);
  });
  test("another provider starts from its own default and does not inherit Gemini models", () => {
    const v = viewForProvider(stored, "anthropic");
    expect(v.defaultModel).toBe(PROVIDERS.anthropic.defaultModel);
    expect(v.featureModels).toEqual({});
    expect(v.fallbackModels).toEqual([]);
  });
  test("a change for one provider never touches another's models", () => {
    const next = applyPatch(stored, "anthropic", { defaultModel: "claude-haiku-5-5", featureModels: { impact: "claude-opus-5-5" } });
    expect(next.defaultModel).toBe("gemini-flash-latest");
    expect(next.featureModels.impact).toBe("gemini-2.5-flash");
    expect(viewForProvider(next, "anthropic").defaultModel).toBe("claude-haiku-5-5");
    expect(viewForProvider(next, "anthropic").featureModels).toEqual({ impact: "claude-opus-5-5" });
    expect(viewForProvider(next, "openai").defaultModel).toBe(PROVIDERS.openai.defaultModel);
  });
  test("a Gemini change leaves other providers alone", () => {
    const withClaude = applyPatch(stored, "anthropic", { defaultModel: "claude-haiku-5-5" });
    const next = applyPatch(withClaude, "gemini", { defaultModel: "gemini-2.5-flash" });
    expect(next.defaultModel).toBe("gemini-2.5-flash");
    expect(viewForProvider(next, "anthropic").defaultModel).toBe("claude-haiku-5-5");
  });
});
