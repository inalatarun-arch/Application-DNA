import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import type { GeminiContent } from '@/services/geminiService';

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set(['txt','md','csv','json','xml','yaml','yml','log','sql','graphql','js','ts','tsx','jsx','css','html','vtt','srt']);
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
const SUPPORTED_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  'pdf', 'docx', 'xlsx', 'xls', ...Object.keys(IMAGE_MIME_BY_EXTENSION),
]);

function extension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function resolveFileMimeType(file: Pick<File, 'name' | 'type'>): string {
  const ext = extension(file.name);
  if (ext === 'pdf') return 'application/pdf';
  if (IMAGE_MIME_BY_EXTENSION[ext]) return IMAGE_MIME_BY_EXTENSION[ext];
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === 'xls') return 'application/vnd.ms-excel';
  return file.type || 'text/plain';
}

export function validateFile(file: File): void {
  if (!(file instanceof File)) throw new Error('Please select a valid file.');
  if (file.size <= 0) throw new Error(`${file.name || 'The selected file'} is empty. Add a file with content and try again.`);
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than 12 MB. Split the document or upload a smaller file.`);
  const ext = extension(file.name);
  if (!SUPPORTED_EXTENSIONS.has(ext) && !file.type.startsWith('text/')) {
    throw new Error(`${file.name} is not supported. Use TXT, Markdown, CSV, JSON, PDF, DOCX, XLSX, XLS, PNG, JPG or JPEG.`);
  }
}

function toBase64(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

async function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

async function extractOfficeText(file: File, ext: string): Promise<string> {
  try {
    const buffer = await file.arrayBuffer();
    if (ext === 'docx') {
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      const text = result.value.trim();
      if (!text) throw new Error('No readable text was found in the Word document.');
      return text;
    }

    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheets = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      return sheet ? `SHEET: ${name}\n${XLSX.utils.sheet_to_csv(sheet)}` : '';
    }).filter(Boolean);
    if (!sheets.some((sheet) => sheet.trim())) throw new Error('No readable rows were found in the spreadsheet.');
    return sheets.join('\n\n');
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown parsing error.';
    throw new Error(`Could not extract text from ${file.name}. Check that the file is a valid, unencrypted Office document. ${detail}`);
  }
}

export async function fileToGeminiContent(file: File): Promise<GeminiContent> {
  validateFile(file);
  const ext = extension(file.name);

  if (TEXT_EXTENSIONS.has(ext) || (file.type.startsWith('text/') && !['docx', 'xlsx', 'xls'].includes(ext))) {
    const text = await file.text();
    if (!text.trim()) throw new Error(`${file.name} contains no readable text.`);
    return {
      role: 'user',
      parts: [{ text: `FILE: ${file.name}\nMIME: ${file.type || 'text/plain'}\nCONTENT:\n${text}` }],
    };
  }

  if (['docx', 'xlsx', 'xls'].includes(ext)) {
    const text = await extractOfficeText(file, ext);
    return {
      role: 'user',
      parts: [{ text: `FILE: ${file.name}\nEXTRACTED OFFICE DOCUMENT CONTENT:\n${text}\n\nExtract all application-relevant information from this content. Preserve sheet names, headings, labels and table relationships.` }],
    };
  }

  // Gemini accepts PDF and image bytes as inlineData. Infer the MIME type from the extension
  // when browsers provide an empty or generic File.type (common for PDFs from some sources).
  const mimeType = resolveFileMimeType(file);
  if (mimeType === 'text/plain' || mimeType === 'application/octet-stream') {
    throw new Error(`Could not determine a supported content type for ${file.name}.`);
  }
  const dataUrl = await readAsDataUrl(file);
  return {
    role: 'user',
    parts: [
      { text: `FILE: ${file.name}\nMIME: ${mimeType}\nAnalyse this file as source material. Extract all application-relevant information you can identify.` },
      { inlineData: { mimeType, data: toBase64(dataUrl) } },
    ],
  };
}

export async function filesToGeminiParts(files: File[]): Promise<GeminiContent[]> {
  // Process sequentially to avoid simultaneously holding multiple 12 MB files as base64 strings.
  const parts: GeminiContent[] = [];
  for (const file of files) parts.push(await fileToGeminiContent(file));
  return parts;
}
