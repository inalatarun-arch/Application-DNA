import { useRef, useState } from 'react';
import { FileUp, Loader2, Sparkles, Square } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { useApiKey } from '@/hooks/useApiKey';
import { describeError, isGeminiError } from '@/services/geminiService';
import { extractApplicationKnowledge } from '@/services/applicationAI';
import { applyApplicationExtraction } from '@/services/applicationIngestion';
import { filesToGeminiParts } from '@/lib/filePayload';
import Section from '@/components/ui/Section';

export default function ApplicationAiIngest({ applicationId }: { applicationId: string }) {
  const app = useLiveQuery(() => db.applications.get(applicationId), [applicationId]);
  const modules = useLiveQuery(() => db.modules.where('applicationId').equals(applicationId).toArray(), [applicationId]);
  const screens = useLiveQuery(() => db.screens.where('applicationId').equals(applicationId).toArray(), [applicationId]);
  const functionalities = useLiveQuery(() => db.functionalities.where('applicationId').equals(applicationId).toArray(), [applicationId]);
  const components = useLiveQuery(() => db.technicalComponents.where('applicationId').equals(applicationId).toArray(), [applicationId]);
  const apiKey = useApiKey();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const run = async () => {
    if (!app || !apiKey || busy) return;
    setBusy(true); setError(''); setNotice('');
    const controller = new AbortController(); abort.current = controller;
    try {
      const attachments = await filesToGeminiParts(files);
      const result = await extractApplicationKnowledge(app, modules ?? [], screens ?? [], functionalities ?? [], components ?? [], text, attachments, controller.signal);
      const counts = await applyApplicationExtraction(app, result.data, files.filter((f) => f.type.startsWith('image/')));
      setNotice(`AI updated the application using ${result.model}: ${counts.modules} modules, ${counts.screens} screens, ${counts.functionalities} functionalities and ${counts.components} technical components processed.`);
      setText(''); setFiles([]);
    } catch (err) {
      if (isGeminiError(err) && err.code === 'ABORTED') setNotice('AI processing cancelled. No changes were applied.');
      else setError(describeError(err));
    } finally { setBusy(false); abort.current = null; }
  };

  return (
    <Section title="AI application capture" description="Describe the application in plain English and/or attach screenshots or documents. Gemini turns the evidence into structured modules, screens, business logic, functionalities and technical components. Existing modules can be updated in the same run.">
      <div className="space-y-4">
        <textarea className="input min-h-[150px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="Example: Procurement users open Supplier Maintenance from Payables. They can create a supplier, validate Tax ID, save the record, and submit it for approval. Duplicate Tax IDs must be blocked. The screen calls the supplier API and writes to the supplier master table." />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
            <FileUp size={16} aria-hidden /> Attach files
          </button>
          <input ref={fileInput} type="file" multiple className="sr-only" onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          {files.length > 0 && <span className="text-label-md text-on-surface-variant">{files.length} file{files.length === 1 ? '' : 's'} selected</span>}
          {busy ? (
            <button type="button" className="btn btn-secondary" onClick={() => abort.current?.abort()}><Square size={14} aria-hidden /> Cancel</button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={!apiKey || (!text.trim() && files.length === 0)} onClick={() => void run()}><Sparkles size={16} aria-hidden /> Analyse & update application</button>
          )}
        </div>
        <p className="field-hint">Screenshots are attached to the screens Gemini maps them to. Supported uploads depend on the selected Gemini model; individual files are limited to 12 MB.</p>
        {!apiKey && <p className="rounded border border-outline-variant bg-surface-low p-3 text-body-md">Configure Gemini in Settings → AI Configuration to enable AI capture.</p>}
        {busy && <p role="status" className="inline-flex items-center gap-2 text-body-md text-on-surface-variant"><Loader2 size={14} className="animate-spin" /> Reading the application evidence…</p>}
        {notice && <p role="status" className="rounded border border-outline-variant bg-surface-low p-3 text-body-md">{notice}</p>}
        {error && <p role="alert" className="rounded border border-error bg-error-container p-3 text-body-md text-error">{error}</p>}
      </div>
    </Section>
  );
}
