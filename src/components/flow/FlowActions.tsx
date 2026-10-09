import { useRef, useState } from 'react';
import { FileCode2, Loader2, RotateCcw, Save, Sparkles, Undo2 } from 'lucide-react';
import { downloadBlob, slug } from '@/lib/download';
import { flowToBpmn, flowToDrawio, flowToVsdx } from '@/lib/flowFormats';
import type { FlowModel } from '@/lib/flowModel';
import { useApiKey } from '@/hooks/useApiKey';
import { editFlow } from '@/services/flowAI';
import { describeError, isGeminiError } from '@/services/geminiService';

interface Props {
  /** The flow as currently shown (original or edited). */
  model: FlowModel;
  /** True when `model` differs from what is stored or generated. */
  edited: boolean;
  onChange: (next: FlowModel) => void;
  onReset: () => void;
  /** Optional: persist the edited flow somewhere (a functionality, an artifact). */
  onSave?: () => Promise<void> | void;
  saveLabel?: string;
}

const MIME_XML = 'application/xml';

/** Export to BPMN, draw.io and Visio, plus plain-language edits applied as small operations. */
export default function FlowActions({ model, edited, onChange, onReset, onSave, saveLabel = 'Save flow' }: Props) {
  const apiKey = useApiKey();
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState<FlowModel[]>([]);
  const [saving, setSaving] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const base = slug(model.title);

  const save = (kind: 'bpmn' | 'drawio' | 'vsdx') => {
    setError('');
    try {
      if (kind === 'bpmn') downloadBlob(new Blob([flowToBpmn(model)], { type: MIME_XML }), `${base}.bpmn`);
      else if (kind === 'drawio') downloadBlob(new Blob([flowToDrawio(model)], { type: MIME_XML }), `${base}.drawio`);
      else downloadBlob(new Blob([flowToVsdx(model).slice().buffer as ArrayBuffer], { type: 'application/vnd.ms-visio.drawing' }), `${base}.vsdx`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  const apply = async () => {
    const text = instruction.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      const result = await editFlow(model, text, controller.signal);
      if (result.applied === 0) {
        setNotice(result.note || 'The model proposed no changes. Try naming the step to change.');
      } else {
        setHistory((h) => [...h.slice(-9), model]);
        onChange(result.model);
        setInstruction('');
        const tokens = result.tokens?.prompt != null ? ` Used ${result.tokens.prompt} input and ${result.tokens.output ?? 0} output tokens.` : '';
        const skipped = result.skipped.length ? ` ${result.skipped.length} change${result.skipped.length === 1 ? '' : 's'} skipped: ${result.skipped.slice(0, 2).join('; ')}.` : '';
        setNotice(`${result.applied} change${result.applied === 1 ? '' : 's'} applied. ${result.note}${skipped}${tokens}`.trim());
      }
    } catch (err) {
      if (!(isGeminiError(err) && err.code === 'ABORTED')) setError(describeError(err));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    onChange(prev);
    setNotice('Last change undone.');
  };

  const persist = async () => {
    if (!onSave) return;
    setSaving(true);
    setError('');
    try {
      await onSave();
      setNotice('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Flow tools" className="space-y-3 rounded border border-outline-variant bg-surface-low p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-label-md font-medium text-on-surface-variant">Export as</span>
        <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={() => save('bpmn')}><FileCode2 size={14} aria-hidden />BPMN</button>
        <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={() => save('drawio')}><FileCode2 size={14} aria-hidden />draw.io</button>
        <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={() => save('vsdx')}><FileCode2 size={14} aria-hidden />Visio</button>
        <span className="ml-auto flex items-center gap-2">
          {history.length > 0 && <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={undo}><Undo2 size={14} aria-hidden />Undo</button>}
          {edited && <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={() => { setHistory([]); onReset(); setNotice('Back to the original flow.'); }}><RotateCcw size={14} aria-hidden />Reset</button>}
          {onSave && edited && (
            <button type="button" className="btn btn-primary px-3 py-1.5" disabled={saving} onClick={() => void persist()}>
              {saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Save size={14} aria-hidden />}{saveLabel}
            </button>
          )}
        </span>
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void apply(); }}>
        <div className="min-w-[240px] flex-1">
          <label htmlFor="flow-instruction" className="field-label">Change this flow with a sentence</label>
          <input
            id="flow-instruction"
            className="input"
            value={instruction}
            maxLength={600}
            placeholder="e.g. Add a manager approval step before payment is released"
            onChange={(e) => setInstruction(e.target.value)}
            disabled={!apiKey}
          />
        </div>
        {busy ? (
          <button type="button" className="btn btn-secondary" onClick={() => abort.current?.abort()}><Loader2 size={15} className="animate-spin" aria-hidden />Cancel</button>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={!apiKey || !instruction.trim()}><Sparkles size={15} aria-hidden />Apply</button>
        )}
      </form>
      {!apiKey && <p className="text-label-md text-on-surface-variant">Unlock or configure Gemini in Settings to edit with text. Exports work without it.</p>}
      {notice && <p role="status" className="text-body-md">{notice}</p>}
      {error && <p role="alert" className="rounded border border-error bg-error-container p-3 text-body-md text-error">{error}</p>}
    </section>
  );
}
