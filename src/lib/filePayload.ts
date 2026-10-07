import type { GeminiContent } from '@/services/geminiService';

const MAX_FILE_BYTES = 12 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set(['txt','md','csv','json','xml','yaml','yml','log','sql','graphql','js','ts','tsx','jsx','css','html','vtt','srt']);
const SUPPORTED_BINARY_EXTENSIONS = new Set(['pdf','docx','png','jpg','jpeg','webp']);

function validateFile(file: File): void {
  if (!(file instanceof File)) throw new Error('Please select a valid file.');
  if (file.size <= 0) throw new Error(`${file.name || 'The selected file'} is empty. Add a file with content and try again.`);
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than 12 MB. Split the document or upload a smaller file.`);
  const ext = extension(file.name);
  const isText = file.type.startsWith('text/') || TEXT_EXTENSIONS.has(ext);
  if (!isText && !SUPPORTED_BINARY_EXTENSIONS.has(ext)) {
    throw new Error(`${file.name} is not supported. Use TXT, Markdown, PDF, DOCX, PNG, JPG or JPEG.`);
  }
}


function extension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function toBase64(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

export async function fileToGeminiContent(file: File): Promise<GeminiContent> {
  validateFile(file);

  const ext = extension(file.name);
  if (file.type.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) {
    const text = await file.text();
    return { role: 'user', parts: [{ text: `FILE: ${file.name}\\nMIME: ${file.type || 'text/plain'}\\nCONTENT:\\n${text}` }] };
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });

  return {
    role: 'user',
    parts: [
      { text: `FILE: ${file.name}\\nMIME: ${file.type || 'application/octet-stream'}\\nAnalyse this file as source material. Extract all application-relevant information you can identify.` },
      { inlineData: { mimeType: file.type || 'application/octet-stream', data: toBase64(dataUrl) } },
    ],
  };
}

export async function filesToGeminiParts(files: File[]): Promise<GeminiContent[]> {
  return Promise.all(files.map(fileToGeminiContent));
}
