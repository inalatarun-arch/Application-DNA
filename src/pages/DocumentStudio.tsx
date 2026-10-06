import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, Loader2, FileDown, Printer, History, Settings2, Send, Check, X, RotateCcw, Wand2, AlertTriangle,
  ArrowUp, ArrowDown, Plus, Trash2, Mail, Lock, ListTree,
} from 'lucide-react';
import { db, nowIso, useLive, loadMatrix, saveMatrix, DEFAULT_MATRIX } from '../db/deliveryDb';
import type {
  DocumentRecord, DocType, Requirement, Story, Epic, Feature, ImpactReport, ApprovalEntry, ApprovalDecision, ApprovalStage, DocVersion, Project,
} from '../db/deliveryDb';
import { generateText } from '../lib/gemini';
import { FRD_SYSTEM, TDD_SYSTEM, REFINE_SYSTEM, buildFrdPrompt, buildTddPrompt, buildRefinePrompt, PROMPT_VERSION } from '../lib/prompts';
import { gatherKnowledge, getKnowledgeDbName } from '../lib/knowledge';
import { extractHeadings, getSections, getSectionText, replaceSection, stripOuterFence, renderMarkdown } from '../lib/markdown';
import { exportMarkdown, printDocument } from '../lib/exporters';
import { useVault } from '../components/useVault';
import { MarkdownPreview } from '../components/MarkdownPreview';
import { ApprovalStepper } from '../components/ApprovalStepper';
import { btnPrimary, btnSecondary, btnGhost, card, cardTight, h2, h3, input, label, muted, td, th } from '../components/ui';

type ViewMode = 'split' | 'edit' | 'preview';
const LS_REVIEWER = 'eih.reviewerName';

export function DocumentStudio({ projectId }: { projectId: number | null }) {
  const vault = useVault();
  const [docType, setDocType] = useState<DocType>('FRD');
  const [matrix, setMatrix] = useState<ApprovalStage[]>(loadMatrix());
  const [showMatrix, setShowMatrix] = useState(false);

  const project = useLive<Project | undefined>(() => (projectId ? db.projects.get(projectId) : Promise.resolve(undefined)), [projectId], undefined);
  const docs = useLive(() => (projectId ? db.documents.where('projectId').equals(projectId).toArray() : Promise.resolve([] as DocumentRecord[])), [projectId], [] as DocumentRecord[]);
  const doc = docs.find((d) => d.type === docType);
  const frdDoc = docs.find((d) => d.type === 'FRD');

  const audit = useLive(
    async () => (doc?.id ? (await db.approvals.where('documentId').equals(doc.id).sortBy('timestamp')).reverse() : ([] as ApprovalEntry[])),
    [doc?.id],
    [] as ApprovalEntry[],
  );
  const versions = useLive(
    async () => (doc?.id ? (await db.docVersions.where('documentId').equals(doc.id).sortBy('savedAt')).reverse() : ([] as DocVersion[])),
    [doc?.id],
    [] as DocVersion[],
  );

  const [text, setText] = useState('');
  const loadedFor = useRef<number | null>(null);
  const [view, setView] = useState<ViewMode>('split');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [reviewer, setReviewer] = useState(() => {
    try { return localStorage.getItem(LS_REVIEWER) ?? ''; } catch { return ''; }
  });
  const [comments, setComments] = useState('');
  const [refineSection, setRefineSection] = useState('');
  const [refineInstruction, setRefineInstruction] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const N = matrix.length;
  const stageIndex = doc ? Math.min(doc.stageIndex, N + 1) : 0;
  const isDraft = !doc || stageIndex === 0;
  const isApproved = !!doc && stageIndex === N + 1;
  const currentStage = doc && stageIndex >= 1 && stageIndex <= N ? matrix[stageIndex - 1] : null;

  /* load text when switching document */
  useEffect(() => {
    if ((doc?.id ?? null) !== loadedFor.current) {
      loadedFor.current = doc?.id ?? null;
      setText(doc?.content ?? '');
    }
  }, [doc?.id, doc?.content]);
  useEffect(() => {
    setError('');
    setNote('');
    setComments('');
  }, [docType, projectId]);

  /* autosave (Draft only) with flush on unmount */
  const pending = useRef<{ id: number; text: string } | null>(null);
  useEffect(() => {
    if (!doc?.id || loadedFor.current !== doc.id || !isDraft || text === doc.content) return;
    pending.current = { id: doc.id, text };
    const t = setTimeout(() => {
      void db.documents.update(doc.id as number, { content: text, updatedAt: nowIso() });
      pending.current = null;
    }, 600);
    return () => clearTimeout(t);
  }, [text, doc?.id, doc?.content, isDraft]);
  useEffect(
    () => () => {
      if (pending.current) void db.documents.update(pending.current.id, { content: pending.current.text, updatedAt: nowIso() });
    },
    [],
  );

  const headings = useMemo(() => extractHeadings(text), [text]);
  const sections = useMemo(() => getSections(text), [text]);

  if (!projectId || !project) return <div className={card}><p className={muted}>Select or create a project above to start.</p></div>;

  const ensureDoc = async (): Promise<number> => {
    if (doc?.id) return doc.id;
    return db.documents.add({
      projectId,
      type: docType,
      title: `${project.name} - ${docType === 'FRD' ? 'Functional Requirements Document' : 'Technical Design Document'}`,
      version: 1,
      content: '',
      stageIndex: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  };

  const snapshot = async (id: number, version: number, content: string, why: string) => {
    if (!content.trim()) return;
    await db.docVersions.add({ documentId: id, version, content, note: why, savedAt: nowIso() });
  };

  /* --------------------------- AI generation --------------------------- */
  const loadInputs = async () => {
    const reqs: Requirement[] = (await db.requirements.where('projectId').equals(projectId).sortBy('id')).filter((r) => r.status !== 'Rejected');
    const epics: Epic[] = await db.epics.where('projectId').equals(projectId).toArray();
    const features: Feature[] = await db.features.where('projectId').equals(projectId).toArray();
    const storiesAll: Story[] = await db.stories.where('projectId').equals(projectId).sortBy('id');
    const stories = storiesAll
      .map((story) => {
        const feature = features.find((f) => f.id === story.featureId);
        const epic = feature ? epics.find((e) => e.id === feature.epicId) : undefined;
        return feature && epic ? { epic, feature, story } : null;
      })
      .filter((x): x is { epic: Epic; feature: Feature; story: Story } => x !== null);
    const impacts: ImpactReport[] = [];
    for (const r of reqs) {
      const latest = (await db.impactReports.where('requirementId').equals(r.id as number).reverse().sortBy('createdAt'))[0];
      if (latest) impacts.push(latest.report);
    }
    return { reqs, stories, impacts };
  };

  const generate = async () => {
    if (doc?.content.trim() && !window.confirm('Regenerate this document? The current text is saved as a version first, then replaced.')) return;
    setBusy('generate');
    setError('');
    setNote('');
    try {
      const id = await ensureDoc();
      const { reqs, stories, impacts } = await loadInputs();
      if (reqs.length === 0) throw new Error('Add at least one requirement (Impact Assessment tab) before generating a document.');
      const query =
        docType === 'FRD'
          ? `${project.name} ${project.applications} ${reqs.map((r) => `${r.title} ${r.text}`).join(' ')}`
          : `${project.name} ${project.applications} ${impacts.flatMap((i) => i.technicalImpact.components.map((c) => c.name)).join(' ')} ${reqs.map((r) => r.text).join(' ')}`;
      const g = await gatherKnowledge(query, { dbName: getKnowledgeDbName(), maxSnippets: docType === 'FRD' ? 20 : 28 });
      const prompt =
        docType === 'FRD'
          ? buildFrdPrompt(project, reqs, stories, impacts, g.snippets)
          : buildTddPrompt(project, frdDoc, impacts, reqs, g.snippets);
      const out = await generateText({
        feature: docType === 'FRD' ? 'frd' : 'tdd',
        system: docType === 'FRD' ? FRD_SYSTEM : TDD_SYSTEM,
        prompt,
        temperature: 0.3,
        maxOutputTokens: 30000,
      });
      const md = stripOuterFence(out);
      const current = await db.documents.get(id);
      if (current?.content) await snapshot(id, current.version, current.content, 'Before regeneration');
      await db.documents.update(id, { content: md, generatedAt: nowIso(), updatedAt: nowIso(), stageIndex: 0, rejected: false });
      loadedFor.current = id;
      setText(md);
      setNote(`${docType} generated from ${reqs.length} requirement(s), ${stories.length} stories and ${g.snippets.length} repository snippet(s) (prompt v${PROMPT_VERSION}).${g.warning ? ' ' + g.warning : ''}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed.');
    } finally {
      setBusy('');
    }
  };

  const refine = async () => {
    const sec = sections.find((s) => s.heading.slug === refineSection);
    if (!sec || !refineInstruction.trim() || !doc?.id) return;
    setBusy('refine');
    setError('');
    try {
      const original = getSectionText(text, sec);
      const out = await generateText({
        feature: 'sectionRefine',
        system: REFINE_SYSTEM,
        prompt: buildRefinePrompt(docType, text, original, refineInstruction),
        temperature: 0.3,
        maxOutputTokens: 12000,
      });
      const revised = stripOuterFence(out);
      await snapshot(doc.id, doc.version, text, `Before refining "${sec.heading.text}"`);
      const next = replaceSection(text, sec, revised);
      setText(next);
      await db.documents.update(doc.id, { content: next, updatedAt: nowIso() });
      setRefineInstruction('');
      setNote(`Section "${sec.heading.text}" revised.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refinement failed.');
    } finally {
      setBusy('');
    }
  };

  /* ------------------------------ approvals ------------------------------ */
  const record = async (decision: ApprovalDecision, stageLabel: string, role: string, extra: Partial<DocumentRecord>) => {
    if (!doc?.id) return;
    await db.transaction('rw', [db.documents, db.approvals, db.docVersions], async () => {
      await db.approvals.add({
        documentId: doc.id as number,
        version: doc.version,
        stageLabel,
        reviewerName: reviewer.trim(),
        role,
        decision,
        comments: comments.trim(),
        timestamp: nowIso(),
      });
      await db.documents.update(doc.id as number, { ...extra, updatedAt: nowIso() });
    });
    setComments('');
  };

  const needName = (): boolean => {
    if (!reviewer.trim()) {
      setError('Enter your name before recording a decision (it is stored in the audit trail).');
      return false;
    }
    try { localStorage.setItem(LS_REVIEWER, reviewer.trim()); } catch { /* ignore */ }
    setError('');
    return true;
  };

  const submit = async () => {
    if (!doc?.id || !needName()) return;
    if (!text.trim()) return setError('The document is empty.');
    await db.documents.update(doc.id, { content: text });
    await snapshot(doc.id, doc.version, text, 'Submitted for approval');
    await record('Submitted', 'Draft', 'Author', { stageIndex: 1, rejected: false, content: text });
  };

  const decide = async (decision: 'Approved' | 'Changes Requested' | 'Rejected') => {
    if (!doc?.id || !currentStage || !needName()) return;
    if (decision !== 'Approved' && !comments.trim()) return setError('Feedback comments are required when requesting changes or rejecting.');
    await record(decision, currentStage.label, currentStage.role, {
      stageIndex: decision === 'Approved' ? stageIndex + 1 : 0,
      rejected: decision === 'Rejected',
    });
  };

  const reopen = async () => {
    if (!doc?.id || !needName()) return;
    if (!comments.trim()) return setError('Give a reason for reopening (it is stored in the audit trail).');
    await snapshot(doc.id, doc.version, text, `Approved v${doc.version}`);
    await db.transaction('rw', [db.documents, db.approvals], async () => {
      await db.approvals.add({
        documentId: doc.id as number, version: doc.version + 1, stageLabel: 'Approved', reviewerName: reviewer.trim(),
        role: 'Author', decision: 'Reopened', comments: comments.trim(), timestamp: nowIso(),
      });
      await db.documents.update(doc.id as number, { version: doc.version + 1, stageIndex: 0, rejected: false, updatedAt: nowIso() });
    });
    setComments('');
  };

  const restore = async (v: DocVersion) => {
    if (!doc?.id || !isDraft || !window.confirm(`Restore version v${v.version} (${v.note})? Current text is saved first.`)) return;
    await snapshot(doc.id, doc.version, text, 'Before restore');
    setText(v.content);
    await db.documents.update(doc.id, { content: v.content, updatedAt: nowIso() });
  };

  const mailto = (st: ApprovalStage): string =>
    `mailto:${encodeURIComponent(st.email)}?subject=${encodeURIComponent(`Review requested: ${doc?.title} (v${doc?.version})`)}&body=${encodeURIComponent(
      `Hello,\n\nThe ${docType} for "${project.name}" is awaiting your ${st.label}.\nPlease open the Enterprise Intelligence Hub > Document Studio to review it.\n`,
    )}`;

  /* ------------------------------- exports ------------------------------- */
  const doPrint = () => {
    if (!doc) return;
    const html = previewRef.current?.innerHTML ?? renderMarkdown(text);
    const status = isApproved ? 'Approved' : isDraft ? (doc.rejected ? 'Rejected - Draft' : 'Draft') : matrix[stageIndex - 1].label;
    printDocument(html, { title: doc.title, version: doc.version, status, audit: [...audit].reverse() });
  };

  const jumpTo = (slug: string, line: number) => {
    previewRef.current?.querySelector(`#${CSS.escape(slug)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const ta = editorRef.current;
    if (ta) {
      const lines = text.split('\n');
      const offset = lines.slice(0, line).reduce((a, l) => a + l.length + 1, 0);
      ta.focus();
      ta.setSelectionRange(offset, offset);
      ta.scrollTop = Math.max(0, line * 20 - 40);
    }
  };

  /* ------------------------------- matrix UI ------------------------------ */
  const updateStage = (i: number, patch: Partial<ApprovalStage>) => setMatrix((m) => m.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const moveStage = (i: number, d: -1 | 1) =>
    setMatrix((m) => {
      const n = [...m];
      const j = i + d;
      if (j < 0 || j >= n.length) return m;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const persistMatrix = () => {
    const clean = matrix.filter((s) => s.label.trim()).map((s, i) => ({ ...s, key: s.key || `s${i}`, label: s.label.trim(), role: s.role.trim() || s.label.trim() }));
    if (clean.length === 0) return;
    saveMatrix(clean);
    setMatrix(clean);
    setShowMatrix(false);
  };

  const statusText = !doc ? 'Not created' : isApproved ? 'Approved' : isDraft ? (doc.rejected ? 'Rejected (draft)' : 'Draft') : `Awaiting ${matrix[stageIndex - 1].label}`;
  const aiDisabled = !vault.unlocked || !!busy;

  return (
    <div className="space-y-4">
      {/* header */}
      <div className={card}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 inline-flex rounded border border-[#D1D5DB]">
              {(['FRD', 'TDD'] as DocType[]).map((t) => (
                <button key={t} onClick={() => setDocType(t)} className={`px-4 py-1 text-[13px] font-medium ${docType === t ? 'bg-[#111827] text-white' : 'bg-white text-[#111827] hover:bg-[#F3F4F6]'}`}>
                  {t}
                </button>
              ))}
            </div>
            <h2 className={h2}>{doc?.title ?? `${project.name} - ${docType}`}</h2>
            <p className={muted}>{doc ? `Version ${doc.version} · ${statusText}` : 'No document yet - generate one from your requirements.'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} disabled={aiDisabled || !isDraft} onClick={() => void generate()} title={!isDraft ? 'Only drafts can be regenerated' : vault.unlocked ? '' : 'Unlock your AI key first'}>
              {busy === 'generate' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {doc?.content ? 'Regenerate' : 'Generate'} {docType}
            </button>
            <button className={btnSecondary} disabled={!doc?.content} onClick={() => doc && exportMarkdown(doc.title, doc.version, text)}>
              <FileDown size={14} /> Markdown
            </button>
            <button className={btnSecondary} disabled={!doc?.content} onClick={doPrint} title="Opens the print dialog - choose 'Save as PDF' as the destination to export a PDF">
              <Printer size={14} /> PDF / Print
            </button>
            <button className={btnSecondary} onClick={() => setShowMatrix((s) => !s)}>
              <Settings2 size={14} /> Approval matrix
            </button>
          </div>
        </div>
        <ApprovalStepper stages={matrix} stageIndex={stageIndex} rejected={!!doc?.rejected && isDraft} />
      </div>

      {showMatrix && (
        <div className={card}>
          <h3 className={`${h3} mb-1`}>Approval matrix</h3>
          <p className={`${muted} mb-3`}>Review stages between Draft and Approved, in order. Changes apply to all documents; avoid reordering while documents are mid-review.</p>
          <div className="space-y-2">
            {matrix.map((s, i) => (
              <div key={i} className="grid items-center gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                <input className={input} value={s.label} placeholder="Stage name" onChange={(e) => updateStage(i, { label: e.target.value })} />
                <input className={input} value={s.role} placeholder="Reviewer role" onChange={(e) => updateStage(i, { role: e.target.value })} />
                <input className={input} value={s.email} placeholder="Notify email (optional)" onChange={(e) => updateStage(i, { email: e.target.value })} />
                <div className="flex gap-1">
                  <button className={btnGhost} onClick={() => moveStage(i, -1)} aria-label="Move up"><ArrowUp size={14} /></button>
                  <button className={btnGhost} onClick={() => moveStage(i, 1)} aria-label="Move down"><ArrowDown size={14} /></button>
                  <button className={btnGhost} onClick={() => setMatrix((m) => m.filter((_x, idx) => idx !== i))} aria-label="Remove"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button className={btnSecondary} onClick={() => setMatrix((m) => [...m, { key: `s${Date.now()}`, label: '', role: '', email: '' }])}><Plus size={14} /> Add stage</button>
            <button className={btnSecondary} onClick={() => setMatrix(DEFAULT_MATRIX)}>Reset to default</button>
            <button className={btnPrimary} onClick={persistMatrix}>Save matrix</button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded border-2 border-[#111827] bg-white px-3 py-2 text-[13px]">
          <AlertTriangle size={16} className="mt-[1px]" /> <span>{error}</span>
        </div>
      )}
      {note && <div className="rounded border border-[#9CA3AF] bg-[#F3F4F6] px-3 py-2 text-[13px]">{note}</div>}

      {busy === 'generate' && (
        <div className={`${cardTight} flex items-center gap-2 text-[13px]`}>
          <Loader2 size={14} className="animate-spin" /> Gathering requirements, stories, impact reports and repository context, then writing the {docType}. Long documents can take 1-2 minutes.
        </div>
      )}

      {doc && !isDraft && (
        <div className={`${cardTight} flex items-center gap-2 text-[13px]`}>
          <Lock size={14} /> This document is locked while it is in review or approved. Changes can only be made in Draft (a reviewer can request changes, or reopen an approved document as a new version).
        </div>
      )}

      {/* studio */}
      <div className="grid gap-4 xl:grid-cols-[220px_1fr]">
        <div className={`${cardTight} xl:sticky xl:top-4 xl:self-start`}>
          <div className="mb-2 flex items-center gap-2"><ListTree size={14} /><span className={h3}>Sections</span></div>
          {headings.length === 0 ? (
            <p className={muted}>Headings appear here.</p>
          ) : (
            <ul className="max-h-[420px] space-y-[2px] overflow-y-auto">
              {headings.filter((h) => h.level <= 3).map((h) => (
                <li key={h.slug}>
                  <button onClick={() => jumpTo(h.slug, h.line)} className="w-full truncate rounded px-2 py-1 text-left text-[12px] text-[#45464c] hover:bg-[#F3F4F6]" style={{ paddingLeft: 8 + (h.level - 1) * 10 }}>
                    {h.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded border border-[#D1D5DB]">
              {(['edit', 'split', 'preview'] as ViewMode[]).map((v) => (
                <button key={v} onClick={() => setView(v)} className={`px-3 py-1 text-[12px] font-medium capitalize ${view === v ? 'bg-[#111827] text-white' : 'bg-white hover:bg-[#F3F4F6]'}`}>{v}</button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-[12px] text-[#6B7280]">
              {doc && <span>{text.split(/\s+/).filter(Boolean).length} words</span>}
              <button className={btnGhost} onClick={() => setShowHistory((s) => !s)}><History size={14} /> Versions ({versions.length})</button>
            </div>
          </div>

          {!doc?.content && !text ? (
            <div className={card}>
              <p className="text-[14px]">No {docType} yet. Click <strong>Generate {docType}</strong> to draft it from this project's requirements, stories, impact reports and your Knowledge Repository - or start typing below.</p>
              <textarea className={`${input} mt-3 font-mono`} rows={6} placeholder="Start writing in Markdown..." value={text} onChange={async (e) => { if (!doc) await ensureDoc(); setText(e.target.value); }} />
            </div>
          ) : (
            <div className={`grid gap-3 ${view === 'split' ? 'lg:grid-cols-2' : ''}`}>
              {view !== 'preview' && (
                <textarea
                  ref={editorRef}
                  className="min-h-[560px] w-full resize-y rounded border border-[#D1D5DB] bg-white p-3 font-mono text-[13px] leading-5 text-[#111827] focus:border-[#111827] focus:outline-none read-only:bg-[#F9FAFB]"
                  value={text}
                  readOnly={!isDraft}
                  spellCheck
                  onChange={(e) => setText(e.target.value)}
                  aria-label="Markdown editor"
                />
              )}
              {view !== 'edit' && (
                <div className="max-h-[760px] min-h-[560px] overflow-auto rounded border border-[#D1D5DB] bg-white p-6">
                  <MarkdownPreview markdown={text} containerRef={previewRef} />
                </div>
              )}
            </div>
          )}

          {showHistory && (
            <div className={cardTight}>
              <div className={`${h3} mb-2`}>Version history</div>
              {versions.length === 0 ? <p className={muted}>No saved versions yet. Snapshots are taken before regeneration, on submit and on reopen.</p> : (
                <ul className="space-y-1 text-[13px]">
                  {versions.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-2 border-b border-[#E5E7EB] py-1">
                      <span>v{v.version} · {v.note} · <span className={muted}>{new Date(v.savedAt).toLocaleString()}</span></span>
                      <button className={btnGhost} disabled={!isDraft} onClick={() => void restore(v)}><RotateCcw size={12} /> Restore</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {doc?.content && isDraft && (
            <div className={cardTight}>
              <div className="mb-2 flex items-center gap-2"><Wand2 size={14} /><span className={h3}>Refine a section with Gemini</span></div>
              <div className="grid gap-2 md:grid-cols-[220px_1fr_auto]">
                <select className={input} value={refineSection} onChange={(e) => setRefineSection(e.target.value)}>
                  <option value="">Choose section...</option>
                  {sections.map((s) => <option key={s.heading.slug} value={s.heading.slug}>{s.heading.text}</option>)}
                </select>
                <input className={input} placeholder='e.g. "Add a validation rule for duplicate tax IDs and make the table more specific"' value={refineInstruction} onChange={(e) => setRefineInstruction(e.target.value)} />
                <button className={btnSecondary} disabled={aiDisabled || !refineSection || !refineInstruction.trim()} onClick={() => void refine()}>
                  {busy === 'refine' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Revise
                </button>
              </div>
            </div>
          )}

          {/* approvals */}
          {doc && (
            <div className={card}>
              <h3 className={`${h3} mb-3`}>Approval workflow</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className={label}>Your name</label>
                  <input className={input} value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Name recorded in the audit trail" />
                </div>
                <div>
                  <label className={label}>{isApproved ? 'Reason for reopening' : currentStage ? `Feedback comments (${currentStage.role})` : 'Submission note (optional)'}</label>
                  <input className={input} value={comments} onChange={(e) => setComments(e.target.value)} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {isDraft && (
                  <button className={btnPrimary} disabled={!text.trim()} onClick={() => void submit()}>
                    <Send size={14} /> Submit for {matrix[0].label}
                  </button>
                )}
                {currentStage && (
                  <>
                    <button className={btnPrimary} onClick={() => void decide('Approved')}><Check size={14} /> Approve - {currentStage.label}</button>
                    <button className={btnSecondary} onClick={() => void decide('Changes Requested')}>Request changes</button>
                    <button className={btnSecondary} onClick={() => void decide('Rejected')}><X size={14} /> Reject</button>
                    {currentStage.email && <a className={btnGhost} href={mailto(currentStage)}><Mail size={14} /> Notify {currentStage.role}</a>}
                  </>
                )}
                {isApproved && <button className={btnSecondary} onClick={() => void reopen()}><RotateCcw size={14} /> Reopen as v{doc.version + 1}</button>}
              </div>
              <p className={`${muted} mt-2`}>Reviewer names are self-declared (this app has no user accounts yet) - the audit trail records exactly what was entered, with a timestamp.</p>

              <h3 className={`${h3} mb-2 mt-6`}>Audit trail</h3>
              {audit.length === 0 ? <p className={muted}>No approval activity yet.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead><tr>{['Timestamp', 'Version', 'Stage', 'Reviewer', 'Role', 'Decision', 'Comments'].map((c) => <th key={c} className={th}>{c}</th>)}</tr></thead>
                    <tbody>
                      {audit.map((a) => (
                        <tr key={a.id}>
                          <td className={td}>{new Date(a.timestamp).toLocaleString()}</td>
                          <td className={td}>v{a.version}</td>
                          <td className={td}>{a.stageLabel}</td>
                          <td className={td}>{a.reviewerName}</td>
                          <td className={td}>{a.role}</td>
                          <td className={`${td} font-semibold`}>{a.decision}</td>
                          <td className={td}>{a.comments || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
