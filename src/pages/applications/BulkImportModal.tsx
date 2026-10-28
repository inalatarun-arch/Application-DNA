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
import { extractCatalogue } from '@/services/catalogueAI';
import { applyApplicationExtraction, type IngestionResult } from '@/services/applicationIngestion';
import { countPlan, sumCounts } from '@/lib/catalogueModel';
import { normName, stageExtraction, type ExistingNames } from '@/lib/extractionStage';
import type { Application } from '@/db/types';
import type { ApplicationExtraction } from '@/lib/extractionModel';
import ExtractionReview from './ExtractionReview';
import CatalogueSummary, { type DetailEntry, type DetailNotes } from './CatalogueSummary';
import { normKey, stageInventory, type StagedApp } from '@/lib/appInventory';
import { cn } from '@/lib/cn';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: (result: InventoryImportResult, details?: string) => void;
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
  const [deep, setDeep] = useState(false);
  const [stage, setStage] = useState<'upload' | 'review' | 'extracting' | 'details'>('upload');
  const [saved, setSaved] = useState<InventoryImportResult | null>(null);
  const [roster, setRoster] = useState<string[]>([]);
  const [entries, setEntries] = useState<DetailEntry[]>([]);
  const [notesInfo, setNotesInfo] = useState<DetailNotes | null>(null);
  const [deepError, setDeepError] = useState('');
  const [deepProgress, setDeepProgress] = useState({ done: 0, total: 0, message: '' });
  const [detailReview, setDetailReview] = useState<{ app: Application; plan: ApplicationExtraction; existing: ExistingNames } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => { setStage('upload'); setDeep(false); setSaved(null); setRoster([]); setEntries([]); setNotesInfo(null); setDeepError(''); setDetailReview(null); setFiles([]); setNotes(''); setError(''); setRun(null); setRows(null); setOpen_(new Set()); setBusy(false); setSaving(false); setProgress(''); };
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
      // Documents, PDFs and notes usually hold more than a name list; plain tables rarely do.
      setDeep(files.some((f) => !/\.(csv|tsv|xlsx|xls)$/i.test(f.name)) || !!notes.trim());
      setStage('review');
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

  const detailsMessage = (list: DetailEntry[]) => {
    const t = sumCounts(list.filter((e) => e.status === 'applied').map((e) => e.counts));
    const parts = [`${t.modules} modules`, `${t.screens} screens`, `${t.functionalities} functionalities`, `${t.integrations} integrations`, `${t.components + t.database + t.apis} technical components`];
    return list.some((e) => e.status === 'applied') ? `Details applied: ${parts.join(', ')}.` : undefined;
  };

  const finish = (result: InventoryImportResult, list: DetailEntry[] = []) => { onImported(result, detailsMessage(list)); reset(); onClose(); };

  const runDeep = async (names: string[]) => {
    setStage('extracting'); setDeepError(''); setEntries([]); setNotesInfo(null);
    setDeepProgress({ done: 0, total: 0, message: 'Preparing the document...' });
    const controller = new AbortController(); abort.current = controller;
    try {
      const r = await extractCatalogue(files, notes, names, { signal: controller.signal, onProgress: (done, total, message) => setDeepProgress({ done, total, message }) });
      setEntries(names.map((name) => { const plan = r.plans.get(name) ?? null; return { name, plan, counts: plan ? countPlan(plan) : countPlan({ application: {}, modules: [], screens: [], functionalities: [], technicalComponents: [] }), status: 'pending' as const }; }));
      setNotesInfo({ parts: r.parts, skipped: r.skipped, failed: r.failed, truncated: r.truncated, unmatched: r.unmatched, repairs: r.repairs, model: r.model });
    } catch (err) {
      setDeepError(isGeminiError(err) && err.code === 'ABORTED' ? 'Detail extraction was stopped. The applications are saved; you can try again.' : `${describeError(err)} The applications are saved; you can try again.`);
    } finally { setStage('details'); abort.current = null; }
  };

  const save = async () => {
    if (!rows || saving || !counts.selected) return;
    setSaving(true); setError('');
    try {
      const chosen = rows.filter((r) => r.selected && r.app.name.trim());
      const result = await applyInventory(rows, { modules: !deep });
      if (!deep) { finish(result); return; }
      setSaved(result);
      // Roster names are the stored names, so each answer can be matched back to its application.
      const names = [...new Set(chosen.map((r) => r.existingName ?? r.app.name.trim()))];
      setRoster(names);
      setSaving(false);
      await runDeep(names);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the applications.');
      setSaving(false);
    }
  };

  const openDetail = async (name: string) => {
    const entry = entries.find((e) => e.name === name);
    const app = (await db.applications.toArray()).find((a) => normKey(a.name) === normKey(name));
    if (!entry?.plan || !app) { setDeepError(`Could not find ${name} in the catalogue.`); return; }
    const [mods, scr, fns, comps] = await Promise.all([
      db.modules.where('applicationId').equals(app.id).toArray(), db.screens.where('applicationId').equals(app.id).toArray(),
      db.functionalities.where('applicationId').equals(app.id).toArray(), db.technicalComponents.where('applicationId').equals(app.id).toArray(),
    ]);
    const names = (list: Array<{ name: string }>) => new Set(list.map((x) => normName(x.name)));
    setDetailReview({ app, plan: entry.plan, existing: { module: names(mods), screen: names(scr), functionality: names(fns), component: names(comps) } });
  };

  const markApplied = (name: string, result: IngestionResult) => setEntries((list) => list.map((e) => (e.name === name ? { ...e, status: 'applied', result } : e)));

  const applyOne = async (plan: ApplicationExtraction) => {
    if (!detailReview) return;
    const result = await applyApplicationExtraction(detailReview.app, plan, []);
    markApplied(detailReview.app.name, result);
    setDetailReview(null);
  };

  const applyAll = async () => {
    setSaving(true); setDeepError('');
    try {
      const apps = await db.applications.toArray();
      for (const e of entries) {
        if (e.status === 'applied' || !e.plan) continue;
        const app = apps.find((a) => normKey(a.name) === normKey(e.name));
        if (!app) continue;
        markApplied(e.name, await applyApplicationExtraction(app, e.plan, []));
      }
    } catch (err) {
      setDeepError(err instanceof Error ? err.message : 'Could not save the details.');
    } finally { setSaving(false); }
  };

  const pending = entries.filter((e) => e.status === 'pending' && e.plan).length;

  const title = { upload: 'Import applications from a file', review: 'Review applications found', extracting: 'Reading the document in detail', details: 'Modules, screens, functionalities and components' }[stage];
  const footer = stage === 'review' ? (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => { setRows(null); setRun(null); setError(''); setStage('upload'); }} disabled={saving}>Back</button>
      <button type="button" className="btn btn-primary" disabled={saving || counts.selected === 0} onClick={() => void save()}>
        {saving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
        {saving ? 'Saving...' : deep ? `Import ${counts.selected} and extract details` : `Import ${counts.selected} application${counts.selected === 1 ? '' : 's'}`}
      </button>
    </>
  ) : stage === 'extracting' ? (
    <button type="button" className="btn btn-secondary" onClick={() => abort.current?.abort()}><Square size={14} aria-hidden /> Stop</button>
  ) : stage === 'details' ? (
    <>
      {entries.length === 0 || deepError ? <button type="button" className="btn btn-secondary" onClick={() => void runDeep(roster)}>Try again</button> : null}
      {pending > 0 && <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void applyAll()}>{saving ? 'Applying...' : `Apply all ${pending} application${pending === 1 ? '' : 's'}`}</button>}
      <button type="button" className="btn btn-primary" disabled={saving} onClick={() => saved && finish(saved, entries)}>{pending > 0 ? 'Finish without applying the rest' : 'Done'}</button>
    </>
  ) : (
    <>
      <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
      {busy
        ? <button type="button" className="btn btn-secondary" onClick={() => abort.current?.abort()}><Square size={14} aria-hidden /> Stop</button>
        : <button type="button" className="btn btn-primary" disabled={files.length === 0 && !notes.trim()} onClick={() => void extract()}><Sparkles size={16} aria-hidden /> Extract applications</button>}
    </>
  );

  return (
    <Modal open={open} size="xl" title={title} onClose={close} footer={footer}>
      {stage === 'extracting' ? (
        <div className="space-y-3 py-6 text-center">
          <Loader2 size={28} className="mx-auto animate-spin" aria-hidden />
          <p role="status" className="text-body-md">{deepProgress.message}</p>
          {deepProgress.total > 0 && <progress className="mx-auto block w-64" max={deepProgress.total} value={deepProgress.done} aria-label="Parts read" />}
          <p className="text-label-md font-normal text-on-surface-variant">A long specification is read in parts, which can take several minutes. The applications are already saved.</p>
        </div>
      ) : stage === 'details' ? (
        <CatalogueSummary entries={entries} notes={notesInfo} error={deepError} busy={saving} onReview={(n) => void openDetail(n)} />
      ) : stage === 'upload' ? (
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
          <label className="flex items-start gap-3 rounded border border-outline-variant p-3 text-body-md">
            <input type="checkbox" className="mt-1" checked={deep} onChange={(e) => setDeep(e.target.checked)} />
            <span><strong className="block font-semibold">Also extract modules, screens, functionalities and technical components</strong>Reads the whole document section by section and builds the detailed knowledge for every application above: screens with fields and rules, functionalities, integrations, database objects, API endpoints and other components. You review the result before it is saved. Takes several minutes for a long document.</span>
          </label>
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
                {(rows ?? []).map((r) => {
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
      {detailReview && (
        <ExtractionReview
          open
          base={detailReview.plan}
          initial={stageExtraction(detailReview.plan)}
          existing={detailReview.existing}
          model={notesInfo?.model ?? ''}
          truncated={false}
          onApply={applyOne}
          onClose={() => setDetailReview(null)}
        />
      )}
    </Modal>
  );
}
