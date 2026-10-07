import { describe, expect, test } from "vitest";
import {
  extractGeminiResponse,
  GeminiBlockedError,
  GeminiEmptyResponseError,
  GeminiTruncatedError,
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
