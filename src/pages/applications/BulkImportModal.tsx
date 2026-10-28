import { Fragment, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileUp, Loader2, Sparkles, Square, Table2, Wand2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import Modal from '@/components/ui/Modal';
import Chip from '@/components/ui/Chip';
import { db } from '@/db/db';
import { CRITICAL_TIERS } from '@/db/catalog';
import { applyInventory, type InventoryImportResult } from '@/db/inventoryImport';
import type { CriticalTier } from '@/db/types';
import { describeError, isGeminiError } from '@/services/geminiService';
import { extractInventory, type InventoryRun } from '@/services/appInventoryAI';
import { normKey, stageInventory, type StagedApp } from '@/lib/appInventory';
import { cn } from '@/lib/cn';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: (result: InventoryImportResult) => void;
}

const ACCEPT = '.csv,.tsv,.xlsx,.xls,.docx,.pdf,.txt,.md,.json,.xml,.yaml,.yml,.png,.jpg,.jpeg,.webp';

/** Upload one file that lists many applications, review what was found, and save them all at once. */
export default function BulkImportModal({ open, onClose, onImported }: Props) {
  const existing = useLiveQuery(() => db.applications.toArray(), []) ?? [];
  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [run, setRun] = useState<InventoryRun | null>(null);
  const [rows, setRows] = useState<StagedApp[] | null>(null);
  const [open_, setOpen_] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => { setFiles([]); setNotes(''); setError(''); setRun(null); setRows(null); setOpen_(new Set()); setBusy(false); setSaving(false); setProgress(''); };
  const close = () => { abort.current?.abort(); reset(); onClose(); };

  const extract = async () => {
    if (busy) return;
    setBusy(true); setError(''); setProgress('');
    const controller = new AbortController(); abort.current = controller;
    try {
      const result = await extractInventory(files, notes, controller.signal, setProgress);
      if (!result.apps.length) { setError('No applications were found in this material. Check that the file lists application names, or add a note describing them.'); return; }
      setRun(result);
      setRows(stageInventory(result.apps, existing));
    } catch (err) {
      setError(isGeminiError(err) && err.code === 'ABORTED' ? 'Extraction cancelled. Nothing was saved.' : describeError(err));
    } finally { setBusy(false); setProgress(''); abort.current = null; }
  };

  const edit = (key: string, patch: Partial<StagedApp['app']>) => setRows((rs) => rs && rs.map((r) => {
    if (r.key !== key) return r;
    const app = { ...r.app, ...patch };
    // Renaming can turn a new row into a match (or the reverse), so re-check against the catalogue.
    const hit = patch.name !== undefined ? existing.find((e) => normKey(e.name) === normKey(app.name)) : existing.find((e) => e.id === r.existingId);
    return { ...r, app, existingId: hit?.id, existingName: hit?.name };
  }));
  const toggle = (key: string) => setRows((rs) => rs && rs.map((r) => (r.key === key ? { ...r, selected: !r.selected } : r)));
  const toggleAll = (selected: boolean) => setRows((rs) => rs && rs.map((r) => ({ ...r, selected })));

  const counts = useMemo(() => {
    const sel = (rows ?? []).filter((r) => r.selected && r.app.name.trim());
    return { selected: sel.length, fresh: sel.filter((r) => !r.existingId).length, matched: sel.filter((r) => r.existingId).length, total: rows?.length ?? 0 };
  }, [rows]);

  const save = async () => {
    if (!rows || saving || !counts.selected) return;
    setSaving(true); setError('');
    try {
      const result = await applyInventory(rows);
      onImported(result);
      reset(); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the applications.');
      setSaving(false);
    }
  };

  const reviewing = rows !== null;

  return (
    <Modal
      open={open}
      size="xl"
      title={reviewing ? 'Review applications found' : 'Import applications from a file'}
      onClose={close}
      footer={reviewing ? (
        <>
          <button type="button" className="btn btn-secondary" onClick={() => { setRows(null); setRun(null); setError(''); }} disabled={saving}>Back</button>
          <button type="button" className="btn btn-primary" disabled={saving || counts.selected === 0} onClick={() => void save()}>
            {saving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            {saving ? 'Saving...' : `Import ${counts.selected} application${counts.selected === 1 ? '' : 's'}`}
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
          {busy
            ? <button type="button" className="btn btn-secondary" onClick={() => abort.current?.abort()}><Square size={14} aria-hidden /> Stop</button>
            : <button type="button" className="btn btn-primary" disabled={files.length === 0 && !notes.trim()} onClick={() => void extract()}><Sparkles size={16} aria-hidden /> Extract applications</button>}
        </>
      )}
    >
      {!reviewing ? (
        <div className="space-y-4">
          <p className="text-body-md text-on-surface-variant">Upload an application inventory, architecture document or any file that lists several applications. Every application found is shown for review before anything is saved. Existing applications are matched by name, so nothing is duplicated.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex gap-3 rounded border border-outline-variant bg-surface-low p-3 text-body-md"><Table2 size={18} className="mt-0.5 shrink-0" aria-hidden /><span><strong className="block font-semibold">Spreadsheets and CSV</strong>Columns such as Application, Platform, Domain, Tier, Owner and Module are mapped automatically. No AI needed.</span></div>
            <div className="flex gap-3 rounded border border-outline-variant bg-surface-low p-3 text-body-md"><Wand2 size={18} className="mt-0.5 shrink-0" aria-hidden /><span><strong className="block font-semibold">Documents, PDFs, images, notes</strong>The AI reads the material and lists the applications it names.</span></div>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => input.current?.click()} disabled={busy}><FileUp size={16} aria-hidden /> Choose files</button>
              <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
              {files.length > 0 && <span className="text-label-md text-on-surface-variant">{files.map((f) => f.name).join(', ')}</span>}
            </div>
            <p className="field-hint">CSV, TSV, Excel, Word, PDF, text, Markdown, JSON, PNG, JPG or WebP. Up to 12 MB per file and 14 MB in total.</p>
          </div>
          <div>
            <label htmlFor="bulk-notes" className="field-label">Or paste a list / add context (optional)</label>
            <textarea id="bulk-notes" className="input min-h-[96px]" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} placeholder={'Example:\nSAP ERP (Finance, tier 1), Workday HCM (HR), Salesforce Sales Cloud (Sales & CRM)'} />
          </div>
          {busy && <p role="status" className="inline-flex items-center gap-2 text-body-md text-on-surface-variant"><Loader2 size={14} className="animate-spin" aria-hidden /> {progress || 'Reading the file...'}</p>}
          {error && <p role="alert" className="rounded border border-error bg-error-container p-3 text-body-md text-error">{error}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded border border-outline-variant bg-surface-low p-3 text-body-md">
            <p><strong>{counts.total} application{counts.total === 1 ? '' : 's'} found.</strong> {counts.fresh} will be created, {counts.matched} already exist and will only have blank details and missing modules filled in. Untick any row to skip it. Name, platform, domain and tier can be edited here.</p>
            {run && <ul className="mt-1 list-disc pl-5 text-label-md font-normal text-on-surface-variant">{run.sources.map((s) => <li key={s.file}><strong className="font-medium">{s.file}</strong>: {s.applications} found {s.method === 'table' ? `by column mapping (no AI). ${s.detail ?? ''}` : `by the AI${run.model ? ` (${run.model})` : ''}`}</li>)}</ul>}
            {run?.truncated && <p className="mt-1 text-label-md text-error">The AI's reply was cut off, so the list may be incomplete. Split the file and import it in parts to be sure.</p>}
          </div>
          <div className="overflow-x-auto rounded border border-outline-variant">
            <table className="w-full min-w-[820px] text-left text-body-md">
              <thead className="border-b border-outline-variant bg-surface-low text-label-md text-on-surface-variant">
                <tr>
                  <th scope="col" className="w-10 px-3 py-2"><input type="checkbox" aria-label="Select all" checked={counts.selected === counts.total && counts.total > 0} onChange={(e) => toggleAll(e.target.checked)} /></th>
                  <th scope="col" className="px-2 py-2 font-medium">Application</th>
                  <th scope="col" className="px-2 py-2 font-medium">Platform</th>
                  <th scope="col" className="px-2 py-2 font-medium">Domain</th>
                  <th scope="col" className="px-2 py-2 font-medium">Tier</th>
                  <th scope="col" className="px-2 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.map((r) => {
                  const expanded = open_.has(r.key);
                  const a = r.app;
                  return (
                    <Fragment key={r.key}>
                      <tr className={cn(!r.selected && 'opacity-50')}>
                        <td className="px-3 py-2"><input type="checkbox" aria-label={`Include ${a.name}`} checked={r.selected} onChange={() => toggle(r.key)} /></td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <button type="button" className="icon-btn h-7 w-7" aria-label={expanded ? `Hide details of ${a.name}` : `Show details of ${a.name}`} aria-expanded={expanded} onClick={() => setOpen_((s) => { const n = new Set(s); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; })}>{expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}</button>
                            <input className="input min-w-[150px]" aria-label="Application name" value={a.name} onChange={(e) => edit(r.key, { name: e.target.value })} />
                          </div>
                        </td>
                        <td className="px-2 py-2"><input className="input min-w-[120px]" aria-label={`Platform of ${a.name}`} value={a.vendor} onChange={(e) => edit(r.key, { vendor: e.target.value })} /></td>
                        <td className="px-2 py-2"><input className="input min-w-[120px]" aria-label={`Domain of ${a.name}`} value={a.domain} placeholder="Unclassified" onChange={(e) => edit(r.key, { domain: e.target.value })} /></td>
                        <td className="px-2 py-2">
                          <select className="input w-auto" aria-label={`Tier of ${a.name}`} value={a.criticalTier} onChange={(e) => edit(r.key, { criticalTier: e.target.value as CriticalTier | '' })}>
                            <option value="">Not stated (Tier 3)</option>
                            {CRITICAL_TIERS.map((t) => <option key={t.id} value={t.id}>{t.label}: {t.description}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-2">{r.existingId ? <Chip>Exists: {r.existingName}</Chip> : <Chip>New</Chip>}</td>
                      </tr>
                      {expanded && (
                        <tr className="bg-surface-low">
                          <td />
                          <td colSpan={5} className="space-y-1 px-2 py-3 text-body-md">
                            {a.description && <p>{a.description}</p>}
                            <p className="text-label-md font-normal text-on-surface-variant">Business owner: {a.businessOwner || '-'} · Technical owner: {a.technicalOwner || '-'}</p>
                            {a.technicalStack.length > 0 && <div className="flex flex-wrap gap-1">{a.technicalStack.map((s) => <Chip key={s}>{s}</Chip>)}</div>}
                            {a.tags.length > 0 && <div className="flex flex-wrap gap-1">{a.tags.map((s) => <Chip key={s}>#{s}</Chip>)}</div>}
                            {a.modules.length > 0 && <p className="text-label-md font-normal text-on-surface-variant">Modules ({a.modules.length}): {a.modules.map((m) => m.name).join(', ')}</p>}
                            {!a.description && !a.technicalStack.length && !a.tags.length && !a.modules.length && <p className="text-label-md font-normal text-on-surface-variant">No further details in the file.</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {error && <p role="alert" className="rounded border border-error bg-error-container p-3 text-body-md text-error">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
