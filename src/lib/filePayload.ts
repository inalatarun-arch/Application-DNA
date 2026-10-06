import type { GeminiContent } from '@/services/geminiService';

const MAX_FILE_BYTES = 12 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set(['txt','md','csv','json','xml','yaml','yml','log','sql','graphql','js','ts','tsx','jsx','css','html','vtt','srt']);

function extension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function toBase64(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

export async function fileToGeminiContent(file: File): Promise<GeminiContent> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} is larger than 12 MB. Split the document or upload a smaller file.`);
  }

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
