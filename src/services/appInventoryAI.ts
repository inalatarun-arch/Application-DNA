import { generateJson } from './geminiService';
import type { GeminiContent } from './geminiService';
import { batchAttachments } from './applicationAI';
import { fileToGeminiContent, validateFile } from '@/lib/filePayload';
import { mergeInventories, normalizeInventory, parseDelimited, tableToInventory, type InventoryApp } from '@/lib/appInventory';
import { INVENTORY_CLOSE, INVENTORY_SYSTEM } from '@/prompts';

const S = { type: 'STRING' } as const;
const SA = { type: 'ARRAY', items: S } as const;

const INVENTORY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    applications: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: S, vendor: S, domain: S, description: S, businessOwner: S, technicalOwner: S,
          criticalTier: { type: 'STRING', enum: ['tier-1', 'tier-2', 'tier-3', 'tier-4', ''] },
          technicalStack: SA, tags: SA,
          modules: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: S, description: S }, required: ['name'] } },
        },
        required: ['name'],
      },
    },
  },
  required: ['applications'],
} as const;

export interface InventorySource {
  file: string;
  /** "table" = columns mapped locally with no AI; "ai" = read by the AI. */
  method: 'table' | 'ai';
  applications: number;
  /** Columns that were mapped / ignored, for table sources. */
  detail?: string;
}

export interface InventoryRun {
  apps: InventoryApp[];
  sources: InventorySource[];
  model: string;
  truncated: boolean;
}

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/** Spreadsheet sheets arrive from the file reader as "SHEET: name\n<csv>" blocks. */
function sheetsOf(content: GeminiContent): Array<{ name: string; csv: string }> {
  const text = content.parts.map((p) => p.text ?? '').join('\n');
  const out: Array<{ name: string; csv: string }> = [];
  const re = /^SHEET: (.*)$/gm;
  const marks = [...text.matchAll(re)];
  marks.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length + 1;
    const end = i + 1 < marks.length ? (marks[i + 1].index ?? text.length) : text.lastIndexOf('FILE>>>') > start ? text.lastIndexOf('FILE>>>') : text.length;
    out.push({ name: m[1], csv: text.slice(start, end).trim() });
  });
  return out;
}

const mappedNote = (headers: string[], fields: Map<number, string>) => `Mapped: ${[...fields.entries()].sort((a, b) => a[0] - b[0]).map(([i, f]) => `${headers[i]} → ${f}`).join(', ')}`;

/**
 * Reads every file. Structured tables (CSV, Excel sheets with a recognisable application-name column) are mapped
 * locally, which is instant, free and exact. Everything else, and any typed notes, goes to the AI in batches.
 */
export async function extractInventory(
  files: File[],
  notes: string,
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
): Promise<InventoryRun> {
  const lists: InventoryApp[][] = [];
  const sources: InventorySource[] = [];
  const forAi: GeminiContent[] = [];
  const aiFiles: string[] = [];

  for (const file of files) {
    validateFile(file);
    const ext = extOf(file.name);
    if (ext === 'csv' || ext === 'tsv') {
      const t = tableToInventory(parseDelimited(await file.text()));
      if (t) {
        lists.push(t.apps);
        sources.push({ file: file.name, method: 'table', applications: t.apps.length, detail: mappedNote(t.headers, t.mapping.fields) });
        continue;
      }
    } else if (ext === 'xlsx' || ext === 'xls') {
      const content = await fileToGeminiContent(file);
      const rest: string[] = [];
      let mapped = 0;
      for (const sheet of sheetsOf(content)) {
        const t = tableToInventory(parseDelimited(sheet.csv));
        if (t) { lists.push(t.apps); mapped += t.apps.length; sources.push({ file: `${file.name} › ${sheet.name}`, method: 'table', applications: t.apps.length, detail: mappedNote(t.headers, t.mapping.fields) }); } else rest.push(`SHEET: ${sheet.name}\n${sheet.csv}`);
      }
      if (rest.length && (!mapped || rest.join('').length > 200)) {
        forAi.push({ role: 'user', parts: [{ text: `<<<FILE ${file.name} (spreadsheet)\n${rest.join('\n\n')}\nFILE>>>` }] });
        aiFiles.push(file.name);
      }
      continue;
    }
    forAi.push(await fileToGeminiContent(file));
    aiFiles.push(file.name);
  }

  let model = '';
  let truncated = false;
  const typed = notes.trim();
  if (forAi.length || typed) {
    const batches = batchAttachments(forAi);
    const aiLists: InventoryApp[][] = [];
    for (let i = 0; i < batches.length; i++) {
      onProgress?.(batches.length > 1 ? `AI is reading source batch ${i + 1} of ${batches.length}...` : 'AI is reading the material...');
      const prompt: GeminiContent[] = [
        ...(typed && i === 0 ? [{ role: 'user', parts: [{ text: `USER NOTES\n${typed}` }] } as GeminiContent] : []),
        ...batches[i],
        { role: 'user', parts: [{ text: INVENTORY_CLOSE }] },
      ];
      const r = await generateJson<unknown>(prompt, {
        feature: 'application-ingestion',
        system: INVENTORY_SYSTEM,
        responseSchema: INVENTORY_SCHEMA as unknown as Record<string, unknown>,
        temperature: 0.1,
        maxOutputTokens: 32768,
        signal,
      });
      aiLists.push(normalizeInventory(r.data));
      model = r.model;
      truncated = truncated || !!r.repaired;
    }
    const aiApps = mergeInventories(aiLists);
    lists.push(aiApps);
    sources.push({ file: [...aiFiles, ...(typed ? ['typed notes'] : [])].join(', '), method: 'ai', applications: aiApps.length });
  }
  return { apps: mergeInventories(lists), sources, model, truncated };
}
