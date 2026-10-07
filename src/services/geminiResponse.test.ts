import { describe, expect, test } from "vitest";
import {
  extractGeminiResponse,
  GeminiBlockedError,
  GeminiEmptyResponseError,
  GeminiTruncatedError,
  toGeminiError,
} from "@/services/geminiService";

describe("Gemini response guards", () => {
  test("empty candidates are rejected", () => {
    expect(() => extractGeminiResponse({ candidates: [] })).toThrow(GeminiEmptyResponseError);
  });

  test("thinking-only replies are rejected", () => {
    expect(() => extractGeminiResponse({
      candidates: [{ content: { parts: [{ text: "x", thought: true }] }, finishReason: "STOP" }],
    })).toThrow(GeminiEmptyResponseError);
  });

  test("blocked responses use a typed error", () => {
    expect(() => extractGeminiResponse({ promptFeedback: { blockReason: "SAFETY" } })).toThrow(GeminiBlockedError);
  });

  test("MAX_TOKENS is classified as truncation", () => {
    expect(() => extractGeminiResponse({
      candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }],
    })).toThrow(GeminiTruncatedError);
  });

  test("other non-terminal finish reasons are classified as truncation", () => {
    expect(() => extractGeminiResponse({
      candidates: [{ content: { parts: [] }, finishReason: "OTHER" }],
    })).toThrow(GeminiTruncatedError);
  });

  test("normal response text is preserved", () => {
    expect(extractGeminiResponse({
      candidates: [{ content: { parts: [{ text: "hello" }] }, finishReason: "STOP" }],
    }).text).toBe("hello");
  });
});

describe("HTTP mapping", () => {
  test("503", async () => {
    const e = await toGeminiError(new Response("busy", { status: 503 }));
    expect(e.code).toBe("SERVER_ERROR");
    expect(e.status).toBe(503);
  });
  test("429", async () => {
    const e = await toGeminiError(new Response("busy", { status: 429 }));
    expect(e.code).toBe("QUOTA_EXCEEDED");
    expect(e.status).toBe(429);
  });
  test("404", async () => {
    const e = await toGeminiError(new Response("missing", { status: 404 }));
    expect(e.code).toBe("MODEL_NOT_FOUND");
    expect(e.status).toBe(404);
  });
});
