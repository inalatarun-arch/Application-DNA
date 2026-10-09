import { useRef, useState } from 'react';
import { FileUp, Loader2, Sparkles, Square } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { useApiKey } from '@/hooks/useApiKey';
import { describeError, isGeminiError } from '@/services/geminiService';
import { extractApplicationKnowledge } from '@/services/applicationAI';
import { applyApplicationExtraction } from '@/services/applicationIngestion';
import { normName, stageExtraction, type ExistingNames, type StagedItem } from '@/lib/extractionStage';
import type { ApplicationExtraction } from '@/lib/extractionModel';
import ExtractionReview from './ExtractionReview';
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
  const [progress, setProgress] = useState('');
  const [review, setReview] = useState<{ base: ApplicationExtraction; staged: StagedItem[]; model: string; truncated: boolean; images: File[] } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const existing: ExistingNames = {
    module: new Set((modules ?? []).map((m) => normName(m.name))),
    screen: new Set((screens ?? []).map((x) => normName(x.name))),
    functionality: new Set((functionalities ?? []).map((f) => normName(f.name))),
    component: new Set((components ?? []).map((c) => normName(c.name))),
  };

  const run = async () => {
    if (!app || !apiKey || busy) return;
    setBusy(true); setError(''); setNotice(''); setProgress('');
    const controller = new AbortController(); abort.current = controller;
    try {
      const attachments = await filesToGeminiParts(files);
      const result = await extractApplicationKnowledge(app, modules ?? [], screens ?? [], functionalities ?? [], components ?? [], text, attachments, controller.signal, (done, total) => setProgress(total > 1 ? `Reading source batch ${Math.min(done + 1, total)} of ${total}...` : ''));
      const staged = stageExtraction(result.data);
      if (staged.length === 0 && !Object.keys(result.data.application).some((k) => (result.data.application as Record<string, unknown>)[k])) {
        setNotice('The AI found nothing it could extract from this material. Add more detail or a different file and try again.');
      } else {
        setReview({ base: result.data, staged, model: result.model, truncated: result.truncated, images: files.filter((f) => f.type.startsWith('image/')) });
      }
    } catch (err) {
      if (isGeminiError(err) && err.code === 'ABORTED') setNotice('AI processing cancelled. No changes were applied.');
      else setError(describeError(err));
    } finally { setBusy(false); setProgress(''); abort.current = null; }
  };

  const apply = async (plan: ApplicationExtraction) => {
    if (!app || !review) return;
    const counts = await applyApplicationExtraction(app, plan, review.images);
    setNotice(`Applied to the repository: ${counts.modules} modules (${counts.updatedModules} updated), ${counts.screens} screens (${counts.updatedScreens} updated), ${counts.functionalities} functionalities (${counts.updatedFunctionalities} updated) and ${counts.components} technical components (${counts.updatedComponents} updated).`);
    setReview(null); setText(''); setFiles([]);
  };

  return (
    <Section title="AI application capture" description="Describe the application in plain English and/or attach screenshots or documents. The AI turns the evidence into structured modules, screens, business logic, functionalities and technical components. You review the result, change it by hand or by instruction, and only then is it saved.">
      <div className="space-y-4">
        <textarea className="input min-h-[150px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="Example: Procurement users open Supplier Maintenance from Payables. They can create a supplier, validate Tax ID, save the record, and submit it for approval. Duplicate Tax IDs must be blocked. The screen calls the supplier API and writes to the supplier master table." />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
            <FileUp size={16} aria-hidden /> Attach files
          </button>
          <input ref={fileInput} type="file" accept=".txt,.md,.csv,.json,.xml,.yaml,.yml,.log,.sql,.graphql,.js,.ts,.tsx,.jsx,.css,.html,.pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.webp" multiple className="sr-only" onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          {files.length > 0 && <span className="text-label-md text-on-surface-variant">{files.length} file{files.length === 1 ? '' : 's'} selected</span>}
          {busy ? (
            <button type="button" className="btn btn-secondary" onClick={() => abort.current?.abort()}><Square size={14} aria-hidden /> Cancel</button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={!apiKey || (!text.trim() && files.length === 0)} onClick={() => void run()}><Sparkles size={16} aria-hidden /> Analyse and review</button>
          )}
        </div>
        <p className="field-hint">TXT, Markdown, CSV, JSON, PDF, Word (DOCX), Excel (XLSX/XLS), PNG, JPG and WebP are supported. Each file is limited to 12 MB and the combined upload to 14 MB. Word and Excel content is extracted in the browser before it is sent to the AI; PDF and image files are sent as supported binary inputs.</p>
        {!apiKey && <p className="rounded border border-outline-variant bg-surface-low p-3 text-body-md">Configure AI in Settings → AI Configuration to enable AI capture.</p>}
        {busy && <p role="status" className="inline-flex items-center gap-2 text-body-md text-on-surface-variant"><Loader2 size={14} className="animate-spin" /> {progress || 'Reading the application evidence...'}</p>}
        {notice && <p role="status" className="rounded border border-outline-variant bg-surface-low p-3 text-body-md">{notice}</p>}
        {error && <p role="alert" className="rounded border border-error bg-error-container p-3 text-body-md text-error">{error}</p>}
      </div>
      {review && app && (
        <ExtractionReview
          open
          base={review.base}
          initial={review.staged}
          existing={existing}
          model={review.model}
          truncated={review.truncated}
          onApply={apply}
          onClose={() => setReview(null)}
        />
      )}
    </Section>
  );
}
