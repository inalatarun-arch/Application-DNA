import { generateJson, isGeminiError } from './geminiService';
import type { GeminiContent } from './geminiService';
import { docxToMarkdown, fileToGeminiContent, validateFile } from '@/lib/filePayload';
import { halve, splitByHeadings, type DocPart } from '@/lib/docStructure';
import { CATALOGUE_SCHEMA, isProjectOnlyPart, mergeAnswers, normalizeCatalogue, type PartAnswer } from '@/lib/catalogueModel';
import type { ApplicationExtraction } from '@/lib/extractionModel';
import { CATALOGUE_CLOSE, CATALOGUE_SYSTEM } from '@/prompts';

const PART_CHARS = 24_000;
const CONCURRENCY = 2;
const MAX_HALVINGS = 2;
/** Configuration or cancellation: nothing useful can follow, so stop and report. */
const FATAL = new Set(['MISSING_KEY', 'INVALID_KEY', 'PERMISSION_DENIED', 'ABORTED']);

interface Unit {
  label: string;
  /** Text parts can be cut smaller if the answer comes back truncated. */
  part?: DocPart;
  /** PDFs and images are sent as they are. */
  content?: GeminiContent[];
}

export interface CatalogueRun {
  plans: Map<string, ApplicationExtraction>;
  parts: number;
  skipped: number;
  /** Parts whose answer could not be obtained. */
  failed: string[];
  /** Parts whose answer was cut off and could not be recovered even after splitting. */
  truncated: number;
  /** Links the import repaired from the document's numbering (a screen without a module). */
  repairs: string[];
  /** Items the model attached to a name outside the roster (dropped). */
  unmatched: number;
  model: string;
}

const extOf = (n: string) => n.split('.').pop()?.toLowerCase() ?? '';
const TEXT_EXT = new Set(['txt', 'md', 'csv', 'tsv', 'json', 'xml', 'yaml', 'yml', 'sql', 'graphql', 'log', 'html']);

async function unitsOf(files: File[], notes: string): Promise<Unit[]> {
  const units: Unit[] = [];
  for (const file of files) {
    validateFile(file);
    const ext = extOf(file.name);
    let markdown: string | null = null;
    if (ext === 'docx') markdown = await docxToMarkdown(file);
    else if (TEXT_EXT.has(ext)) markdown = await file.text();
    else if (ext === 'xlsx' || ext === 'xls') markdown = (await fileToGeminiContent(file)).parts.map((p) => p.text ?? '').join('\n');
    if (markdown !== null) {
      splitByHeadings(markdown, PART_CHARS).forEach((part, i, all) => units.push({ label: `${file.name} part ${i + 1}/${all.length}`, part }));
    } else {
      units.push({ label: file.name, content: [await fileToGeminiContent(file)] });
    }
  }
  if (notes.trim()) units.push({ label: 'typed notes', part: { path: [], text: notes.trim() } });
  return units;
}

const rosterText = (roster: string[]) => `APPLICATION ROSTER (copy applicationName exactly from this list)\n${roster.map((r) => `- ${r}`).join('\n')}`;

/**
 * Reads a long specification part by part (cut along its headings) and builds one extraction plan per roster
 * application: modules, screens, functionalities and technical components. A part whose answer is cut off by the
 * output limit is split in two and read again. A part that fails is reported; the others still count.
 */
export async function extractCatalogue(
  files: File[],
  notes: string,
  roster: string[],
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number, message: string) => void } = {},
): Promise<CatalogueRun> {
  const all = await unitsOf(files, notes);
  const units = all.filter((u) => !u.part || !isProjectOnlyPart(u.part));
  const skipped = all.length - units.length;
  const answers: PartAnswer[] = [];
  const failed: string[] = [];
  let truncated = 0;
  let model = '';
  let done = 0;
  let fatal: unknown = null;
  // Quota or rate limits: keep what was read so far instead of throwing it away.
  let halted = '';

  const ask = async (unit: Unit, depth: number): Promise<void> => {
    const body = unit.part
      ? `${rosterText(roster)}\n\nSECTION PATH: ${unit.part.path.join(' > ') || '(top of document)'}\n\n${unit.part.text}`
      : rosterText(roster);
    const prompt: GeminiContent[] = [
      { role: 'user', parts: [{ text: body }] },
      ...(unit.content ?? []),
      { role: 'user', parts: [{ text: CATALOGUE_CLOSE }] },
    ];
    const r = await generateJson<unknown>(prompt, {
      feature: 'application-ingestion', system: CATALOGUE_SYSTEM, responseSchema: CATALOGUE_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.1, maxOutputTokens: 32768, signal: opts.signal, timeoutMs: 600_000,
    });
    model = r.model;
    answers.push(normalizeCatalogue(r.data, roster));
    if (r.repaired) {
      // The answer ran into the output limit. Read the two halves separately so nothing is lost.
      const halves = unit.part && depth < MAX_HALVINGS ? halve(unit.part) : null;
      if (halves) for (const h of halves) await ask({ label: unit.label, part: h }, depth + 1);
      else truncated++;
    }
  };

  let next = 0;
  const worker = async () => {
    while (next < units.length && !fatal && !halted) {
      const unit = units[next++];
      opts.onProgress?.(done, units.length, `Reading ${unit.label}...`);
      try {
        await ask(unit, 0);
      } catch (err) {
        if ((isGeminiError(err) && FATAL.has(err.code)) || (err instanceof Error && err.name === 'KeyLockedError')) { fatal = err; return; }
        if (isGeminiError(err) && err.code === 'QUOTA_EXCEEDED') halted = err.message;
        failed.push(`${unit.label}: ${err instanceof Error ? err.message : String(err)}`);
      }
      done++;
      opts.onProgress?.(done, units.length, `Read ${done} of ${units.length} parts`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, units.length) }, worker));
  if (fatal) throw fatal;
  if (halted) failed.push(`Stopped early: ${halted} The remaining parts were not read.`);
  if (units.length && failed.length === units.length) throw new Error(`The AI could not read any part of the document. ${failed[0]}`);

  const repairs: string[] = [];
  return { plans: mergeAnswers(answers, roster, repairs), repairs, parts: units.length, skipped, failed, truncated, unmatched: answers.reduce((n, a) => n + a.unmatched, 0), model };
}
