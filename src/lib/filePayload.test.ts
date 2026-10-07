import { describe, expect, test } from "vitest";
import { validateFile } from "@/lib/filePayload";

describe("upload validation", () => {
  test("rejects empty files", () => {
    expect(() => validateFile(new File([], "empty.txt", { type: "text/plain" }))).toThrow(/empty/i);
  });

  test("rejects unsupported extensions", () => {
    expect(() => validateFile(new File(["x"], "archive.zip", { type: "application/zip" }))).toThrow(/not supported/i);
  });

  test("rejects files over 12 MB", () => {
    const bytes = new Uint8Array(12 * 1024 * 1024 + 1);
    expect(() => validateFile(new File([bytes], "large.pdf", { type: "application/pdf" }))).toThrow(/12 MB/i);
  });

  test("accepts the audited document and image types", () => {
    expect(() => validateFile(new File(["x"], "notes.md", { type: "text/markdown" }))).not.toThrow();
    expect(() => validateFile(new File(["x"], "document.pdf", { type: "application/pdf" }))).not.toThrow();
    expect(() => validateFile(new File(["x"], "document.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))).not.toThrow();
    expect(() => validateFile(new File(["x"], "screen.png", { type: "image/png" }))).not.toThrow();
  });
});
