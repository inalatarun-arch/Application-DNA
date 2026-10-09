import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { fileToGeminiContent, filesToGeminiParts, resolveFileMimeType, validateFile } from "@/lib/filePayload";

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

  test("accepts supported text, office, PDF and image types", () => {
    for (const [name, type] of [
      ["notes.md", "text/markdown"],
      ["data.csv", "text/csv"],
      ["document.pdf", "application/pdf"],
      ["document.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["document.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      ["document.xls", "application/vnd.ms-excel"],
      ["screen.png", "image/png"],
    ]) {
      expect(() => validateFile(new File(["x"], name, { type }))).not.toThrow();
    }
  });

  test("infers PDF and image MIME types when browser File.type is empty", () => {
    expect(resolveFileMimeType({ name: "spec.pdf", type: "" })).toBe("application/pdf");
    expect(resolveFileMimeType({ name: "screen.jpg", type: "" })).toBe("image/jpeg");
    expect(resolveFileMimeType({ name: "screen.webp", type: "" })).toBe("image/webp");
  });
});

describe("file content preparation", () => {
  test("sends readable text files as actual text with metadata", async () => {
    const content = await fileToGeminiContent(new File(["Business rule: duplicate IDs are rejected."], "rules.txt", { type: "text/plain" }));
    expect(content.parts[0].text).toContain("FILE: rules.txt");
    expect(content.parts[0].text).toContain("Business rule: duplicate IDs are rejected.");
    expect(content.parts[0].text).toContain("\nCONTENT:\n");
  });

  test("extracts spreadsheet sheets and cell values into text", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Requirement ID", "Requirement"],
      ["FR-001", "User can filter payments by status"],
    ]), "Requirements");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = new File([bytes], "requirements.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const content = await fileToGeminiContent(file);
    expect(content.parts[0].text).toContain("SHEET: Requirements");
    expect(content.parts[0].text).toContain("FR-001");
    expect(content.parts[0].text).toContain("filter payments by status");
    expect(content.parts.some((part) => part.inlineData)).toBe(false);
  });

  test("fails clearly for invalid or encrypted Office documents", async () => {
    const file = new File(["not a real Word file"], "broken.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    await expect(fileToGeminiContent(file)).rejects.toThrow(/Could not extract text from broken.docx/i);
  });

  test("rejects combined uploads that are likely to exceed Gemini's inline request limit", async () => {
    const files = [
      new File([new Uint8Array(8 * 1024 * 1024)], "one.pdf", { type: "application/pdf" }),
      new File([new Uint8Array(7 * 1024 * 1024)], "two.pdf", { type: "application/pdf" }),
    ];
    await expect(filesToGeminiParts(files)).rejects.toThrow(/14 MB combined/i);
  });
});
