import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Chip from '@/components/ui/Chip';
import { cn } from '@/lib/cn';
import type { ApplicationExtraction } from '@/lib/extractionModel';
import {
  TYPE_LABEL,
  applyRevision,
  resolveAction,
  summarize,
  toExtraction,
  type ExistingNames,
  type StageType,
  type StagedItem,
} from '@/lib/extractionStage';
import { describeError, isGeminiError } from '@/services/geminiService';
import { reviseExtraction } from '@/services/applicationAI';

interface Props {
  open: boolean;
  base: ApplicationExtraction;
  initial: StagedItem[];
  existing: ExistingNames;
  model: string;
  truncated: boolean;
  onApply: (plan: ApplicationExtraction) => Promise<void>;
  onClose: () => void;
}

type Filter = 'all' | StageType;
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'module', label: 'Modules' },
  { id: 'screen', label: 'Screens' },
  { id: 'functionality', label: 'Functionalities' },
  { id: 'component', label: 'Components' },
];

const LIST_FIELDS: Record<StageType, Array<[string, string]>> = {
  module: [],
  screen: [['validationRules', 'Validation rules'], ['workflowSteps', 'Workflow steps'], ['exceptionHandling', 'Exceptions'], ['upstreamSystems', 'Upstream'], ['downstreamSystems', 'Downstream']],
  functionality: [['userRoles', 'Roles'], ['triggers', 'Triggers'], ['inputs', 'Inputs'], ['outputs', 'Outputs'], ['upstreamSystems', 'Upstream'], ['downstreamSystems', 'Downstream']],
  component: [['functionalityNames', 'Used by'], ['screenNames', 'Screens'], ['dependsOnNames', 'Depends on']],
};
const TEXT_FIELD: Record<StageType, string> = { module: 'description', screen: 'purpose', functionality: 'description', component: 'description' };

export default function ExtractionReview({ open, base, initial, existing, model, truncated, onApply, onClose }: Props) {
  const [staged, setStaged] = useState<StagedItem[]>(initial);
  const [history, setHistory] = useState<StagedItem[][]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [includeApp, setIncludeApp] = useState(true);
  const [instruction, setInstruction] = useState('');
  const [revising, setRevising] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const abort = useRef<AbortController | null>(null);

  const visible = staged.filter((s) => filter === 'all' || s.type === filter);
  const stats = useMemo(() => {
    const kept = staged.filter((s) => s.include);
    const updates = kept.filter((s) => resolveAction(s, existing) === 'update').length;
    return { kept: kept.length, updates, creates: kept.length - updates, excluded: staged.length - kept.length };
  }, [staged, existing]);
  const appFields = Object.entries(base.application).filter(([, v]) => (Array.isArray(v) ? v.length : !!v));

  const patch = (ref: string, fn: (s: StagedItem) => StagedItem) => setStaged((prev) => prev.map((s) => (s.ref === ref ? fn(s) : s)));
  const setField = (ref: string, field: string, value: unknown) => patch(ref, (s) => ({ ...s, item: { ...s.item, [field]: value } as StagedItem['item'] }));
  const setAll = (include: boolean) => setStaged((prev) => prev.map((s) => (filter === 'all' || s.type === filter ? { ...s, include } : s)));

  const revise = async () => {
    if (!instruction.trim() || revising) return;
    setRevising(true);
    setError('');
    setMessage('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      const { revision, model: usedModel } = await reviseExtraction(staged, instruction, controller.signal);
      const result = applyRevision(staged, revision);
      if (result.changed.length) {
        setHistory((h) => [...h, staged]);
        setStaged(result.staged);
        setTouched((t) => new Set([...t, ...result.changed]));
        setInstruction('');
      }
      const parts = [
        result.changed.length ? `Changed ${result.changed.join(', ')} (${usedModel}).` : 'No changes were made.',
        result.ignored.length ? `Ignored unknown references: ${result.ignored.join(', ')}.` : '',
        revision.note,
      ].filter(Boolean);
      setMessage(parts.join(' '));
    } catch (err) {
      if (!(isGeminiError(err) && err.code === 'ABORTED')) setError(describeError(err));
    } finally {
      setRevising(false);
      abort.current = null;
    }
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setStaged(last);
    setHistory((h) => h.slice(0, -1));
    setTouched(new Set());
    setMessage('Reverted the last AI revision.');
  };

  const apply = async () => {
    setApplying(true);
    setError('');
    try {
      const plan = toExtraction(base, staged);
      await onApply(includeApp ? plan : { ...plan, application: {} });
    } catch (err) {
      setError(describeError(err));
      setApplying(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Review extracted application knowledge"
      size="xl"
      onClose={() => (applying ? undefined : onClose())}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={applying}>Discard</button>
          <button type="button" className="btn btn-primary" onClick={() => void apply()} disabled={applying || (stats.kept === 0 && !includeApp)}>
            {applying && <Loader2 size={16} className="animate-spin" aria-hidden />}
            Apply {stats.kept} item{stats.kept === 1 ? '' : 's'} to the repository
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-body-md text-on-surface-variant">
          Nothing has been saved yet. Untick what you do not want, fix names and text, or describe the changes you want and let the AI apply them.
          {' '}Extracted with {model}. Will create {stats.creates}, update {stats.updates}{stats.excluded ? `, leave out ${stats.excluded}` : ''}.
        </p>
        {truncated && (
          <p role="alert" className="flex items-start gap-2 rounded border border-error bg-error-container p-3 text-body-md text-error">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            The AI ran out of output space, so only the completed items were recovered. Run the extraction again with fewer or smaller files to get the rest.
          </p>
        )}

        {appFields.length > 0 && (
          <label className="flex items-start gap-3 rounded border border-outline-variant p-3">
            <input type="checkbox" className="mt-1" checked={includeApp} onChange={(e) => setIncludeApp(e.target.checked)} />
            <span className="text-body-md">
              <span className="font-semibold">Application details</span>
              <span className="block text-on-surface-variant">{appFields.map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`).join(' | ')}</span>
            </span>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={cn('rounded border px-3 py-1 text-label-md', filter === f.id ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container')}
            >
              {f.label}{f.id === 'all' ? ` (${staged.length})` : ` (${staged.filter((s) => s.type === f.id).length})`}
            </button>
          ))}
          <span className="ml-auto flex gap-2">
            <button type="button" className="btn btn-secondary px-2 py-1 text-label-md" onClick={() => setAll(true)}>Select shown</button>
            <button type="button" className="btn btn-secondary px-2 py-1 text-label-md" onClick={() => setAll(false)}>Clear shown</button>
          </span>
        </div>

        <ul className="max-h-[42vh] divide-y divide-outline-variant overflow-y-auto rounded border border-outline-variant">
          {visible.length === 0 && <li className="p-4 text-body-md text-on-surface-variant">Nothing of this kind was extracted.</li>}
          {visible.map((s) => {
            const item = s.item as unknown as Record<string, unknown>;
            const action = resolveAction(s, existing);
            const expanded = openRef === s.ref;
            const textKey = TEXT_FIELD[s.type];
            return (
              <li key={s.ref} className={cn('p-3', !s.include && 'opacity-50', touched.has(s.ref) && 'bg-surface-low')}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" className="mt-2" checked={s.include} onChange={(e) => patch(s.ref, (x) => ({ ...x, include: e.target.checked }))} aria-label={`Include ${String(item.name)}`} />
                  <button type="button" className="icon-btn mt-0.5 h-7 w-7" onClick={() => setOpenRef(expanded ? null : s.ref)} aria-expanded={expanded} aria-label={expanded ? 'Hide details' : 'Show details'}>
                    {expanded ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip>{s.ref}</Chip>
                      <span className="text-label-md text-on-surface-variant">{TYPE_LABEL[s.type]}</span>
                      <span className={cn('rounded px-1.5 py-0.5 text-label-md', action === 'update' ? 'bg-surface-container text-on-surface' : 'border border-outline-variant text-on-surface-variant')}>
                        {action === 'update' ? 'Updates existing' : 'New'}
                      </span>
                      {touched.has(s.ref) && <span className="text-label-md text-on-surface-variant">revised</span>}
                    </div>
                    <input className="input mt-1 font-medium" value={String(item.name ?? '')} onChange={(e) => setField(s.ref, 'name', e.target.value)} aria-label={`${TYPE_LABEL[s.type]} name`} />
                    <p className="mt-1 text-label-md font-normal text-on-surface-variant">{summarize(s)}</p>
                    {expanded && (
                      <div className="mt-3 space-y-3">
                        <div>
                          <label className="field-label" htmlFor={`${s.ref}-text`}>{textKey === 'purpose' ? 'Purpose' : 'Description'}</label>
                          <textarea id={`${s.ref}-text`} className="input min-h-[72px]" value={String(item[textKey] ?? '')} onChange={(e) => setField(s.ref, textKey, e.target.value)} />
                        </div>
                        {s.type === 'screen' && Array.isArray(item.uiElements) && item.uiElements.length > 0 && (
                          <div>
                            <p className="field-label">Controls ({item.uiElements.length})</p>
                            <div className="flex flex-wrap gap-1">
                              {(item.uiElements as Array<{ name: string; type: string; required: boolean }>).map((u, i) => (
                                <Chip key={`${u.name}-${i}`}>{u.name}{u.required ? '*' : ''} ({u.type})</Chip>
                              ))}
                            </div>
                          </div>
                        )}
                        {LIST_FIELDS[s.type].map(([field, label]) => {
                          const values = item[field];
                          return Array.isArray(values) && values.length > 0 ? (
                            <div key={field}>
                              <p className="field-label">{label}</p>
                              <ul className="list-disc pl-5 text-body-md text-on-surface-variant">
                                {(values as string[]).map((v, i) => <li key={`${field}-${i}`}>{v}</li>)}
                              </ul>
                            </div>
                          ) : null;
                        })}
                        {s.type === 'component' && (
                          <p className="text-label-md text-on-surface-variant">Kind: {String(item.kind)}{Array.isArray(item.columns) && item.columns.length ? ` | ${item.columns.length} columns` : ''}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="rounded border border-outline-variant p-3">
          <label className="field-label" htmlFor="revise-instruction">Suggest changes to AI</label>
          <textarea
            id="revise-instruction"
            className="input min-h-[72px]"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={'Examples: "Rename S2 to Supplier Maintenance and mark Tax ID as required." "Merge F3 into F1." "Add a functionality Approve supplier on S1 for the Procurement Manager role." "Drop all technical components."'}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {revising ? (
              <button type="button" className="btn btn-secondary" onClick={() => abort.current?.abort()}><Loader2 size={16} className="animate-spin" aria-hidden /> Cancel</button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => void revise()} disabled={!instruction.trim()}><Sparkles size={16} aria-hidden /> Apply change</button>
            )}
            <button type="button" className="btn btn-secondary" onClick={undo} disabled={history.length === 0 || revising}><RotateCcw size={16} aria-hidden /> Undo last change</button>
            <span className="text-label-md text-on-surface-variant">Only the items you mention are sent back as edits, so this stays quick.</span>
          </div>
          {message && <p role="status" className="mt-2 text-body-md text-on-surface-variant">{message}</p>}
        </div>
        {error && <p role="alert" className="rounded border border-error bg-error-container p-3 text-body-md text-error">{error}</p>}
      </div>
    </Modal>
  );
}
