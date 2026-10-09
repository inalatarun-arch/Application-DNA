import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Download, FileText, History, Loader2, RefreshCw, Sparkles, Table2, Users, XCircle } from 'lucide-react';
import { db, newId, nowIso } from '@/db/db';
import {
  DEFAULT_APPROVAL_MATRIX, buildRtm, createDocument, decideDocument, ensureDefaultTemplates, restoreDocumentVersion,
  saveDocumentVersion, saveGeneratedStories, submitDocument,
} from '@/db/delivery';
import type { DeliveryApproval, DeliveryApprovalRole, DeliveryDocument, DeliveryDocumentType, DeliveryDocumentVersion, DeliveryStory, Requirement, RequirementTrace } from '@/db/types';
import PageHeader from '@/components/ui/PageHeader';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { useApiKey } from '@/hooks/useApiKey';
import { useGraphSource } from '@/hooks/useGraphSource';
import { usePersistentState } from '@/hooks/usePersistentState';
import { downloadBlob, slug } from '@/lib/download';
import { markdownToDocx, type DocxImage } from '@/lib/docx';
import { dataUrlToImage, mermaidToImage } from '@/lib/docImages';
import { DIGEST_LABEL, type DigestLevel } from '@/lib/repoDigest';
import { describeError, isGeminiError } from '@/services/geminiService';
import { generateFdd, generateTdd, reviseDocument, type DocRun } from '@/services/documentAI';
import { generateStories } from '@/services/storyAI';
import PageSkeleton from '@/components/ui/Skeleton';

const esc = (v: string) => v.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const LABEL: Record<DeliveryDocumentType, string> = { frd: 'FDD / FRD', tdd: 'TDD' };

/** Pictures for the DOCX: every Mermaid block as a drawn diagram, every wireframe line as the stored screenshot when there is one. */
async function collectImages(markdown: string): Promise<Map<string, DocxImage>> {
  const images = new Map<string, DocxImage>();
  for (const m of markdown.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
    const src = m[1].trim();
    if (images.has(src)) continue;
    const img = await mermaidToImage(src).catch(() => null);
    if (img) images.set(src, img);
  }
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(wireframe:([^)\s]+)\)/g)) {
    const key = `wireframe:${m[1]}`;
    if (images.has(key) || m[1] === 'none') continue;
    const media = await db.screenMedia.where('screenId').equals(m[1]).toArray();
    const pick = media.find((x) => x.kind === 'wireframe') ?? media[0];
    const img = pick ? await dataUrlToImage(pick.dataUrl) : null;
    if (img) images.set(key, img);
  }
  return images;
}

export default function StudioPage() {
  const apiKey = useApiKey();
  const source = useGraphSource();
  const [projectId, setProjectId] = usePersistentState('eih.studio.project', '');
  const [type, setType] = useState<DeliveryDocumentType>('frd');
  const [level, setLevel] = usePersistentState<DigestLevel>('eih.studio.level', 'standard');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [run, setRun] = useState<DocRun | null>(null);
  const [reviewer, setReviewer] = useState('');
  const [role, setRole] = useState<DeliveryApprovalRole>('business-owner');
  const [comment, setComment] = useState('');
  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<'edit' | 'preview'>('preview');
  const [instruction, setInstruction] = useState('');
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const abort = useRef<AbortController | null>(null);

  const projects = useLiveQuery(() => db.projects.orderBy('name').toArray(), [], []);
  const docs = useLiveQuery(() => (projectId ? db.deliveryDocuments.where('projectId').equals(projectId).toArray() : Promise.resolve([] as DeliveryDocument[])), [projectId], [] as DeliveryDocument[]);
  const doc = docs.find((d) => d.type === type);
  const fddDoc = docs.find((d) => d.type === 'frd');
  const approvals = useLiveQuery(() => (doc ? db.deliveryApprovals.where('documentId').equals(doc.id).sortBy('createdAt') : Promise.resolve([] as DeliveryApproval[])), [doc?.id], [] as DeliveryApproval[]);
  const versions = useLiveQuery(() => (doc ? db.deliveryDocumentVersions.where('documentId').equals(doc.id).sortBy('version').then((v) => v.reverse()) : Promise.resolve([] as DeliveryDocumentVersion[])), [doc?.id, doc?.version], [] as DeliveryDocumentVersion[]);
  const reqs = useLiveQuery(() => (projectId ? db.requirements.where('projectId').equals(projectId).toArray() : Promise.resolve([] as Requirement[])), [projectId], [] as Requirement[]);
  const stories = useLiveQuery(() => (projectId ? db.deliveryStories.where('projectId').equals(projectId).toArray() : Promise.resolve([] as DeliveryStory[])), [projectId], [] as DeliveryStory[]);
  const rtm = useLiveQuery(() => (projectId ? buildRtm(projectId) : Promise.resolve([] as RequirementTrace[])), [projectId], [] as RequirementTrace[]);
  const project = projects?.find((p) => p.id === projectId);

  // Show what is stored whenever the project, document type or stored version changes.
  useEffect(() => { setText(doc?.content ?? ''); setDirty(false); setUndoStack([]); }, [doc?.id, doc?.version, projectId, type]);
  useEffect(() => { setRun(null); }, [projectId, type]);

  const headings = useMemo(() => text.split('\n').filter((x) => /^#{1,3} /.test(x)).join('\n'), [text]);
  const cancel = () => abort.current?.abort();
  const working = busy !== '';

  const guard = async (label: string, fn: (signal: AbortSignal) => Promise<void>) => {
    setBusy(label);
    setError('');
    setNotice('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      await fn(controller.signal);
    } catch (err) {
      if (isGeminiError(err) && err.code === 'ABORTED') setNotice('Cancelled. Nothing was changed.');
      else setError(describeError(err));
    } finally {
      setBusy('');
      setProgress(null);
      abort.current = null;
    }
  };

  const generate = () => {
    if (!project || !source) return;
    void guard('generate', async (signal) => {
      await ensureDefaultTemplates();
      const flowArtifact = (await db.artifacts.where('projectId').equals(project.id).filter((a) => a.kind === 'diagram').toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const input = { project, requirements: reqs, stories, source, futureFlow: flowArtifact?.content, level };
      const result = type === 'frd'
        ? await generateFdd(input, (done, total, label) => setProgress({ done, total, label }), signal)
        : await generateTdd(input, fddDoc?.content ?? '', (await db.organizationTemplates.where('type').equals('tdd').first())?.markdownHeadings ?? '', signal);
      const d = doc ?? await createDocument(project.id, type, `${project.name} - ${type.toUpperCase()}`);
      await db.transaction('rw', [db.deliveryDocuments, db.deliveryDocumentVersions], async () => {
        if (d.content) await db.deliveryDocumentVersions.add({ id: newId(), documentId: d.id, version: d.version, content: d.content, note: 'Before regeneration', createdAt: nowIso() });
        await db.deliveryDocuments.update(d.id, { content: result.markdown, version: d.version + 1, updatedAt: nowIso(), status: 'draft', generatedAt: nowIso() });
      });
      setRun(result);
      setNotice(`Generated with ${result.model || 'AI'}: ${result.tokens.prompt.toLocaleString()} input and ${result.tokens.output.toLocaleString()} output tokens.${flowArtifact ? '' : ' No future-state flow exists yet, so the model drew the process in section 2.1.'}`);
    });
  };

  const makeStories = () => {
    if (!projectId) return;
    void guard('stories', async (signal) => {
      const approved = reqs.filter((r) => r.status === 'approved');
      if (!approved.length) throw new Error('Approve at least one requirement in the project backlog first. Stories are written from approved requirements only.');
      const covered = new Set(stories.flatMap((s) => s.requirementIds));
      const todo = approved.filter((r) => !covered.has(r.id));
      if (!todo.length) { setNotice('Every approved requirement already has a story.'); return; }
      const out = await generateStories(todo, stories, signal);
      const saved = await saveGeneratedStories(projectId, out.drafts);
      setNotice(`The AI wrote ${saved.created} stor${saved.created === 1 ? 'y' : 'ies'} for ${todo.length} requirement${todo.length === 1 ? '' : 's'}${saved.skipped ? `; ${saved.skipped} skipped as duplicates` : ''}${out.ignored ? `; ${out.ignored} unusable item${out.ignored === 1 ? '' : 's'} ignored` : ''}.`);
    });
  };

  const revise = () => {
    if (!instruction.trim() || !text.trim()) return;
    void guard('revise', async (signal) => {
      const r = await reviseDocument(text, instruction, signal);
      if (!r.applied.length) { setNotice(r.note || `No section was changed.${r.skipped.length ? ` Skipped: ${r.skipped.slice(0, 2).join('; ')}.` : ''}`); return; }
      setUndoStack((s) => [...s.slice(-9), text]);
      setText(r.markdown);
      setDirty(true);
      setInstruction('');
      setNotice(`Changed ${r.applied.length} section${r.applied.length === 1 ? '' : 's'}: ${r.applied.slice(0, 4).join(', ')}${r.applied.length > 4 ? '…' : ''}. ${r.tokens.prompt != null ? `${r.tokens.prompt} input and ${r.tokens.output ?? 0} output tokens. ` : ''}${r.skipped.length ? `${r.skipped.length} skipped. ` : ''}Save a version to keep it.`);
    });
  };

  const save = async () => {
    if (!doc) return;
    await saveDocumentVersion(doc.id, text, 'Manual save');
    setDirty(false);
    setNotice('Saved as a new version.');
  };

  const downloadDocx = () => {
    if (!project || !text.trim()) return;
    void guard('docx', async () => {
      const images = await collectImages(text);
      const bytes = markdownToDocx(text, { title: `${project.name}: ${LABEL[type]}`, subtitle: `Version ${doc?.version ?? 1}`, headerText: project.name, images });
      downloadBlob(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), `${slug(project.name)}-${type}.docx`);
    });
  };

  const exportRtm = () =>
    downloadBlob(new Blob([`# Requirements Traceability Matrix\n\n| Requirement | Story | Design Component | Document | Test Cases |\n|---|---|---|---|---|\n${rtm.map((x) => `|${esc(reqs.find((r) => r.id === x.requirementId)?.title ?? x.requirementId)}|${esc(stories.find((s) => s.id === x.storyId)?.title ?? 'not documented')}|${esc(x.designComponentId || 'not documented')}|${esc(x.documentId || 'not documented')}|${x.testCaseIds.length}|`).join('\n')}`], { type: 'text/markdown' }), `${slug(project?.name ?? 'project')}-rtm.md`);

  if (!projects) return <PageSkeleton />;

  return (
    <div>
      <PageHeader title="FDD / TDD Studio" description="Generate, edit, revise with AI, version, approve and download delivery documents. The FDD always follows the five-section template." />
      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">Project
          <select className="input mt-1 block min-w-64" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Select a project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Document
          <select className="input mt-1 block" value={type} onChange={(e) => setType(e.target.value as DeliveryDocumentType)}>
            <option value="frd">{LABEL.frd}</option>
            <option value="tdd">{LABEL.tdd}</option>
          </select>
        </label>
        <label className="text-sm">Detail sent to the AI
          <select className="input mt-1 block" value={level} onChange={(e) => setLevel(e.target.value as DigestLevel)}>
            {(Object.keys(DIGEST_LABEL) as DigestLevel[]).map((l) => <option key={l} value={l}>{DIGEST_LABEL[l]}</option>)}
          </select>
        </label>
        {working && busy !== 'docx' ? (
          <button type="button" className="btn btn-secondary" onClick={cancel}><Loader2 size={15} className="animate-spin" aria-hidden />Cancel</button>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" disabled={!projectId || !apiKey || working} onClick={makeStories}><Users size={15} aria-hidden />Write user stories</button>
            <button type="button" className="btn btn-primary" disabled={!projectId || !apiKey || working || !source} onClick={generate}>
              {doc?.content ? <RefreshCw size={15} aria-hidden /> : <FileText size={15} aria-hidden />}{doc?.content ? 'Regenerate' : 'Generate'}
            </button>
          </>
        )}
        <button type="button" className="btn btn-secondary" disabled={!doc || !dirty || working} onClick={() => void save()}>Save version</button>
        <button type="button" className="btn btn-secondary" disabled={!text.trim() || working} onClick={downloadDocx}><Download size={15} aria-hidden />DOCX</button>
        <button type="button" className="btn btn-secondary" disabled={!text.trim()} onClick={() => downloadBlob(new Blob([text], { type: 'text/markdown' }), `${slug(project?.name ?? 'project')}-${type}.md`)}><Download size={15} aria-hidden />Markdown</button>
        <button type="button" className="btn btn-secondary" disabled={!projectId} onClick={exportRtm}><Table2 size={15} aria-hidden />RTM</button>
      </div>
      {!apiKey && <p className="mb-4 text-body-md text-on-surface-variant">Unlock or configure AI in Settings to generate and revise. Editing, versions, approval and downloads work without it.</p>}
      {progress && (
        <div role="status" className="mb-4 rounded border border-outline-variant bg-surface-low p-3 text-body-md">
          <div className="mb-2 flex justify-between"><span>{progress.label}</span><span className="tabular-nums">{progress.done} of {progress.total}</span></div>
          <div className="h-1.5 overflow-hidden rounded bg-surface-container"><div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} /></div>
        </div>
      )}
      {notice && <p role="status" className="mb-4 rounded border border-outline-variant bg-surface-low p-3 text-body-md">{notice}</p>}
      {run?.notes.map((n) => <p key={n} className="mb-2 text-body-md text-on-surface-variant">{n}</p>)}
      {run && run.missing.length > 0 && (
        <details className="mb-4 rounded border border-outline-variant">
          <summary className="cursor-pointer px-4 py-2 text-body-md font-medium">{run.missing.length} section{run.missing.length === 1 ? '' : 's'} had no supporting information</summary>
          <ul className="list-disc space-y-1 border-t border-outline-variant py-3 pl-8 pr-4 text-body-md text-on-surface-variant">{run.missing.map((m) => <li key={m}>{m}</li>)}</ul>
        </details>
      )}
      {error && <div role="alert" className="mb-4 rounded border border-error bg-error-container p-3 text-body-md text-error">{error}</div>}

      {!project ? <div className="card">Select a project to begin.</div> : (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <section className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div role="group" aria-label="View" className="flex rounded border border-outline-variant">
                {(['preview', 'edit'] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`px-3 py-1.5 text-body-md first:rounded-l last:rounded-r ${view === v ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'}`}>{v === 'edit' ? 'Edit Markdown' : 'Preview'}</button>
                ))}
              </div>
              {undoStack.length > 0 && <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={() => { const prev = undoStack[undoStack.length - 1]; setUndoStack((s) => s.slice(0, -1)); setText(prev); setDirty(true); }}>Undo last AI change</button>}
            </div>
            {view === 'edit' || !text.trim() ? (
              <textarea aria-label="Document Markdown" className="min-h-[640px] w-full border-0 bg-transparent font-mono text-sm outline-none" value={text} onChange={(e) => { setText(e.target.value); setDirty(true); }} placeholder={`Generate a ${LABEL[type]} or write Markdown here.`} />
            ) : (
              <div className="max-h-[75dvh] overflow-auto rounded border border-outline-variant bg-white p-5"><MarkdownPreview markdown={text} /></div>
            )}
            <form className="flex flex-wrap items-end gap-2 border-t border-outline-variant pt-3" onSubmit={(e) => { e.preventDefault(); revise(); }}>
              <div className="min-w-[240px] flex-1">
                <label htmlFor="doc-instruction" className="field-label">Ask AI to change this document</label>
                <input id="doc-instruction" className="input" maxLength={800} value={instruction} onChange={(e) => setInstruction(e.target.value)} disabled={!apiKey || !text.trim()} placeholder="e.g. Add a rule that payments above 10,000 need a second approver" />
              </div>
              <button type="submit" className="btn btn-primary" disabled={!apiKey || !instruction.trim() || !text.trim() || working}>{busy === 'revise' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}Revise</button>
            </form>
          </section>
          <aside className="space-y-4">
            <section className="card">
              <h2 className="font-semibold">Approval</h2>
              <p className="mt-2 text-sm">Status: {doc?.status ?? 'draft'}{dirty ? ' (unsaved edits)' : ''}</p>
              {doc?.status === 'draft' && <button type="button" className="btn btn-primary mt-3 w-full" disabled={dirty} onClick={() => void submitDocument(doc.id)}>Submit for approval</button>}
              {doc?.status === 'draft' && dirty && <p className="mt-1 text-xs text-on-surface-variant">Save a version before submitting.</p>}
              {doc?.status === 'in-review' && (
                <>
                  <select aria-label="Approver role" className="input mt-3 w-full" value={role} onChange={(e) => setRole(e.target.value as DeliveryApprovalRole)}>
                    {DEFAULT_APPROVAL_MATRIX.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                  </select>
                  <input aria-label="Reviewer name" className="input mt-2 w-full" placeholder="Reviewer name" value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
                  <textarea aria-label="Comment" className="input mt-2 w-full" placeholder="Comment" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="btn btn-primary" onClick={() => void decideDocument(doc.id, role, reviewer, 'approved', comment).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not record the decision.'))}><CheckCircle2 size={14} aria-hidden />Approve</button>
                    <button type="button" className="btn btn-secondary" onClick={() => void decideDocument(doc.id, role, reviewer, 'rejected', comment).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not record the decision.'))}><XCircle size={14} aria-hidden />Reject</button>
                  </div>
                </>
              )}
              {approvals.map((a) => <p key={a.id} className="mt-2 border-t pt-2 text-xs">{a.role}: {a.decision}, {a.approverName || 'system'}<br />{a.comment}</p>)}
            </section>
            <section className="card">
              <h2 className="flex items-center gap-2 font-semibold"><History size={15} aria-hidden />Version history</h2>
              {versions.length === 0 && <p className="mt-2 text-xs text-on-surface-variant">No earlier versions.</p>}
              {versions.map((v) => (
                <div key={v.id} className="mt-2 flex items-center justify-between gap-2 border-t pt-2 text-xs">
                  <span>v{v.version} · {v.note}</span>
                  {doc && <button type="button" className="underline" onClick={() => void restoreDocumentVersion(doc.id, v.id)}>Restore</button>}
                </div>
              ))}
            </section>
            <section className="card"><h2 className="font-semibold">Outline</h2><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs">{headings || 'No document yet.'}</pre></section>
            <section className="card"><h2 className="font-semibold">Traceability</h2><p className="mt-1 text-sm">{rtm.length} trace record(s)</p><p className="text-xs text-on-surface-variant">Stories: {stories.length} · Requirements: {reqs.length}</p></section>
          </aside>
        </div>
      )}
    </div>
  );
}
