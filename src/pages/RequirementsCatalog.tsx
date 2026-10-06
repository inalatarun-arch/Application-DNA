import { useMemo, useState } from 'react';
import { Sparkles, ChevronDown, ChevronRight, Plus, Trash2, Loader2, AlertTriangle, Download, Layers, Boxes, FileText } from 'lucide-react';
import { db, nowIso, useLive } from '../db/deliveryDb';
import type { Epic, Feature, Story, Requirement, MoSCoW, StoryStatus, Complexity, ImpactRecord, ImpactReport } from '../db/deliveryDb';
import { generateJson } from '../lib/gemini';
import { STORY_SYSTEM, buildStoriesPrompt } from '../lib/prompts';
import { gatherKnowledge, getKnowledgeDbName } from '../lib/knowledge';
import { downloadText } from '../lib/exporters';
import { useVault } from '../components/useVault';
import { PriorityBadge, StatusTag, ComplexityChip, Chip } from '../components/Badges';
import { btnPrimary, btnSecondary, btnGhost, card, cardTight, h2, h3, input, label, muted } from '../components/ui';

const PRIORITIES: MoSCoW[] = ['Must', 'Should', 'Could', "Won't"];
const STATUSES: StoryStatus[] = ['Backlog', 'Ready', 'In Progress', 'Done', 'Blocked'];
const SIZES: Complexity[] = ['XS', 'S', 'M', 'L', 'XL'];
const POINTS: Record<Complexity, number> = { XS: 1, S: 2, M: 3, L: 5, XL: 8 };

type Sel = { kind: 'epic' | 'feature' | 'story'; id: number } | null;

/* ---------- normalising Gemini output ---------- */
interface RawStory {
  title?: unknown; requirementIds?: unknown; asA?: unknown; iWant?: unknown; soThat?: unknown;
  acceptanceCriteria?: unknown; businessRules?: unknown; priority?: unknown; complexity?: unknown; storyPoints?: unknown;
}
interface RawFeature { title?: unknown; description?: unknown; stories?: unknown }
interface RawEpic { title?: unknown; description?: unknown; features?: unknown }
interface RawResult { epics?: unknown }

const s = (v: unknown, d = ''): string => (typeof v === 'string' ? v.trim() : v == null ? d : String(v));
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => s(x)).filter(Boolean) : []);
const arrOf = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function toPriority(v: unknown): MoSCoW {
  const t = s(v).toLowerCase().replace(/[’`]/g, "'");
  if (t.startsWith('must')) return 'Must';
  if (t.startsWith('should')) return 'Should';
  if (t.startsWith('could')) return 'Could';
  if (t.startsWith("won't") || t.startsWith('wont') || t.startsWith('will not')) return "Won't";
  return 'Should';
}
function toSize(v: unknown): Complexity {
  const t = s(v).toUpperCase();
  return (SIZES.find((x) => x === t) as Complexity | undefined) ?? 'M';
}

export function RequirementsCatalog({ projectId }: { projectId: number | null }) {
  const vault = useVault();
  const epics = useLive(() => (projectId ? db.epics.where('projectId').equals(projectId).sortBy('id') : Promise.resolve([] as Epic[])), [projectId], [] as Epic[]);
  const features = useLive(() => (projectId ? db.features.where('projectId').equals(projectId).sortBy('id') : Promise.resolve([] as Feature[])), [projectId], [] as Feature[]);
  const stories = useLive(() => (projectId ? db.stories.where('projectId').equals(projectId).sortBy('id') : Promise.resolve([] as Story[])), [projectId], [] as Story[]);
  const reqs = useLive(() => (projectId ? db.requirements.where('projectId').equals(projectId).sortBy('id') : Promise.resolve([] as Requirement[])), [projectId], [] as Requirement[]);

  const [sel, setSel] = useState<Sel>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [fPriority, setFPriority] = useState<MoSCoW | ''>('');
  const [fStatus, setFStatus] = useState<StoryStatus | ''>('');
  const [search, setSearch] = useState('');
  const [genOpen, setGenOpen] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const approved = reqs.filter((r) => r.status === 'Approved');
  const pending = approved.filter((r) => !r.storiesGeneratedAt);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const storyMatches = (st: Story) =>
    (!fPriority || st.priority === fPriority) &&
    (!fStatus || st.status === fStatus) &&
    (!search || `${st.title} ${st.asA} ${st.iWant} ${st.soThat}`.toLowerCase().includes(search.toLowerCase()));
  const filtering = !!(fPriority || fStatus || search);

  const totals = useMemo(() => ({ points: stories.reduce((a, x) => a + x.storyPoints, 0), must: stories.filter((x) => x.priority === 'Must').length }), [stories]);

  if (!projectId) return <div className={card}><p className={muted}>Select or create a project above to start.</p></div>;

  /* ---------------- generation ---------------- */
  const generate = async () => {
    const chosen = approved.filter((r) => r.id && picked.has(r.id));
    if (chosen.length === 0) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      const project = await db.projects.get(projectId);
      if (!project) throw new Error('Project not found.');
      const impacts = new Map<number, ImpactReport>();
      for (const r of chosen) {
        const latest: ImpactRecord | undefined = (await db.impactReports.where('requirementId').equals(r.id as number).reverse().sortBy('createdAt'))[0];
        if (latest) impacts.set(r.id as number, latest.report);
      }
      const g = await gatherKnowledge(chosen.map((r) => `${r.title} ${r.text}`).join('\n'), { dbName: getKnowledgeDbName(), maxSnippets: 12 });
      const raw = await generateJson<RawResult>({
        feature: 'userStories',
        system: STORY_SYSTEM,
        prompt: buildStoriesPrompt(project, chosen, impacts, g.snippets),
        temperature: 0.3,
        maxOutputTokens: 16000,
      });
      const validIds = new Set(chosen.map((r) => r.id as number));
      let storyCount = 0;

      await db.transaction('rw', [db.epics, db.features, db.stories, db.requirements], async () => {
        const existingEpics = await db.epics.where('projectId').equals(projectId).toArray();
        const existingFeatures = await db.features.where('projectId').equals(projectId).toArray();
        for (const re of arrOf<RawEpic>(raw.epics)) {
          const eTitle = s(re.title, 'Untitled epic');
          let epic = existingEpics.find((e) => e.title.toLowerCase() === eTitle.toLowerCase());
          if (!epic) {
            const id = await db.epics.add({ projectId, title: eTitle, description: s(re.description), createdAt: nowIso() });
            epic = { id, projectId, title: eTitle, description: s(re.description), createdAt: nowIso() };
            existingEpics.push(epic);
          }
          for (const rf of arrOf<RawFeature>(re.features)) {
            const fTitle = s(rf.title, 'Untitled feature');
            let feat = existingFeatures.find((f) => f.epicId === epic!.id && f.title.toLowerCase() === fTitle.toLowerCase());
            if (!feat) {
              const id = await db.features.add({ projectId, epicId: epic.id as number, title: fTitle, description: s(rf.description), createdAt: nowIso() });
              feat = { id, projectId, epicId: epic.id as number, title: fTitle, description: s(rf.description), createdAt: nowIso() };
              existingFeatures.push(feat);
            }
            for (const rs of arrOf<RawStory>(rf.stories)) {
              const size = toSize(rs.complexity);
              const pts = Number(rs.storyPoints);
              const reqIds = (Array.isArray(rs.requirementIds) ? rs.requirementIds : [])
                .map((x) => Number(String(x).replace(/\D/g, '')))
                .filter((n) => validIds.has(n));
              const ac = list(rs.acceptanceCriteria);
              await db.stories.add({
                projectId,
                featureId: feat.id as number,
                requirementIds: reqIds.length ? reqIds : chosen.length === 1 ? [chosen[0].id as number] : [],
                title: s(rs.title, 'Untitled story'),
                asA: s(rs.asA),
                iWant: s(rs.iWant),
                soThat: s(rs.soThat),
                acceptanceCriteria: ac.length ? ac : ['TBC - acceptance criteria not generated'],
                businessRules: list(rs.businessRules),
                priority: toPriority(rs.priority),
                status: 'Backlog',
                complexity: size,
                storyPoints: Number.isFinite(pts) && pts > 0 ? Math.min(pts, 21) : POINTS[size],
                createdAt: nowIso(),
                updatedAt: nowIso(),
              });
              storyCount++;
            }
          }
        }
        for (const r of chosen) await db.requirements.update(r.id as number, { storiesGeneratedAt: nowIso() });
      });
      if (storyCount === 0) throw new Error('Gemini returned no stories. Try again or add more detail to the requirements.');
      setNote(`Created ${storyCount} user stories from ${chosen.length} requirement(s).`);
      setPicked(new Set());
      setGenOpen(false);
      const allEpics = await db.epics.where('projectId').equals(projectId).toArray();
      const allFeatures = await db.features.where('projectId').equals(projectId).toArray();
      setOpen(new Set([...allEpics.map((e) => `e${e.id}`), ...allFeatures.map((f) => `f${f.id}`)]));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Story generation failed.');
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- manual CRUD ---------------- */
  const addEpic = async () => {
    const title = window.prompt('Epic title');
    if (title?.trim()) {
      const id = await db.epics.add({ projectId, title: title.trim(), description: '', createdAt: nowIso() });
      setSel({ kind: 'epic', id });
    }
  };
  const addFeature = async (epicId: number) => {
    const title = window.prompt('Feature title');
    if (title?.trim()) {
      const id = await db.features.add({ projectId, epicId, title: title.trim(), description: '', createdAt: nowIso() });
      setOpen((p) => new Set(p).add(`e${epicId}`));
      setSel({ kind: 'feature', id });
    }
  };
  const addStory = async (featureId: number) => {
    const title = window.prompt('Story title');
    if (title?.trim()) {
      const id = await db.stories.add({
        projectId, featureId, requirementIds: [], title: title.trim(), asA: '', iWant: '', soThat: '',
        acceptanceCriteria: [], businessRules: [], priority: 'Should', status: 'Backlog', complexity: 'M', storyPoints: 3,
        createdAt: nowIso(), updatedAt: nowIso(),
      });
      setOpen((p) => new Set(p).add(`f${featureId}`));
      setSel({ kind: 'story', id });
    }
  };
  const removeSel = async () => {
    if (!sel) return;
    if (!window.confirm(`Delete this ${sel.kind}${sel.kind !== 'story' ? ' and everything under it' : ''}?`)) return;
    await db.transaction('rw', [db.epics, db.features, db.stories], async () => {
      if (sel.kind === 'story') await db.stories.delete(sel.id);
      if (sel.kind === 'feature') {
        await db.stories.where('featureId').equals(sel.id).delete();
        await db.features.delete(sel.id);
      }
      if (sel.kind === 'epic') {
        const fs = await db.features.where('epicId').equals(sel.id).toArray();
        for (const f of fs) await db.stories.where('featureId').equals(f.id as number).delete();
        await db.features.where('epicId').equals(sel.id).delete();
        await db.epics.delete(sel.id);
      }
    });
    setSel(null);
  };

  const exportMd = () => {
    const lines: string[] = ['# Requirements Catalog', ''];
    for (const e of epics) {
      lines.push(`## Epic: ${e.title}`, e.description, '');
      for (const f of features.filter((x) => x.epicId === e.id)) {
        lines.push(`### Feature: ${f.title}`, f.description, '');
        for (const st of stories.filter((x) => x.featureId === f.id)) {
          lines.push(`#### US-${st.id}: ${st.title}  [${st.priority} | ${st.status} | ${st.complexity}/${st.storyPoints}pt]`);
          lines.push(`As a ${st.asA}, I want ${st.iWant}, so that ${st.soThat}.`, '', '**Acceptance Criteria**');
          st.acceptanceCriteria.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
          if (st.businessRules.length) {
            lines.push('', '**Business Rules**');
            st.businessRules.forEach((b) => lines.push(`- ${b}`));
          }
          lines.push('');
        }
      }
    }
    downloadText('requirements_catalog.md', lines.join('\n'));
  };

  /* ---------------- detail editor ---------------- */
  const selEpic = sel?.kind === 'epic' ? epics.find((e) => e.id === sel.id) : undefined;
  const selFeature = sel?.kind === 'feature' ? features.find((f) => f.id === sel.id) : undefined;
  const selStory = sel?.kind === 'story' ? stories.find((x) => x.id === sel.id) : undefined;

  const patchStory = (changes: Partial<Story>) => selStory?.id && db.stories.update(selStory.id, { ...changes, updatedAt: nowIso() });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={h2}>Requirements Catalog</h2>
          <p className={muted}>
            {epics.length} epics · {features.length} features · {stories.length} stories · {totals.points} pts · {totals.must} Must-have
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary} onClick={() => setGenOpen((o) => !o)} disabled={!vault.unlocked} title={vault.unlocked ? '' : 'Unlock your AI key first'}>
            <Sparkles size={14} /> Generate stories with Gemini
            {pending.length > 0 && <span className="rounded bg-white px-1 text-[11px] font-semibold text-[#111827]">{pending.length}</span>}
          </button>
          <button className={btnSecondary} onClick={() => void addEpic()}><Plus size={14} /> Epic</button>
          <button className={btnSecondary} onClick={exportMd} disabled={stories.length === 0}><Download size={14} /> Export</button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded border-2 border-[#111827] bg-white px-3 py-2 text-[13px]">
          <AlertTriangle size={16} className="mt-[1px]" /> <span>{error}</span>
        </div>
      )}
      {note && <div className="rounded border border-[#9CA3AF] bg-[#F3F4F6] px-3 py-2 text-[13px]">{note}</div>}

      {genOpen && (
        <div className={card}>
          <h3 className={`${h3} mb-1`}>Approved requirements</h3>
          <p className={`${muted} mb-3`}>Only requirements marked <strong>Approved</strong> (set on the Impact Assessment tab) can be turned into stories. Already-converted ones are marked.</p>
          {approved.length === 0 ? (
            <p className="text-[13px]">No approved requirements yet.</p>
          ) : (
            <ul className="mb-4 space-y-2">
              {approved.map((r) => (
                <li key={r.id} className="flex items-start gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={picked.has(r.id as number)}
                    onChange={(e) =>
                      setPicked((p) => {
                        const n = new Set(p);
                        if (e.target.checked) n.add(r.id as number);
                        else n.delete(r.id as number);
                        return n;
                      })
                    }
                  />
                  <span>
                    <strong>REQ-{r.id}</strong> {r.title} {r.storiesGeneratedAt && <Chip>stories exist</Chip>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <button className={btnPrimary} disabled={busy || picked.size === 0} onClick={() => void generate()}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate ({picked.size})
            </button>
            <button className={btnSecondary} onClick={() => setPicked(new Set(pending.map((r) => r.id as number)))} disabled={pending.length === 0}>Select all not yet converted</button>
          </div>
          {busy && <p className={`${muted} mt-3`}>Gemini is writing the backlog - this can take up to a minute.</p>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(340px,480px)_1fr]">
        {/* tree */}
        <div className={cardTight}>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <input className={`${input} col-span-2`} placeholder="Search stories..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className={input} value={fPriority} onChange={(e) => setFPriority(e.target.value as MoSCoW | '')}>
              <option value="">All priorities</option>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
            <select className={input} value={fStatus} onChange={(e) => setFStatus(e.target.value as StoryStatus | '')}>
              <option value="">All statuses</option>
              {STATUSES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          {epics.length === 0 && <p className={muted}>The catalog is empty. Approve requirements, then generate stories - or add an epic manually.</p>}
          <ul className="space-y-1">
            {epics.map((e) => {
              const fs = features.filter((f) => f.epicId === e.id);
              const visibleStories = (fid: number) => stories.filter((x) => x.featureId === fid && storyMatches(x));
              if (filtering && !fs.some((f) => visibleStories(f.id as number).length)) return null;
              const isOpen = filtering || open.has(`e${e.id}`);
              return (
                <li key={e.id}>
                  <div className={`flex items-center gap-1 rounded px-1 py-1 ${sel?.kind === 'epic' && sel.id === e.id ? 'bg-[#F3F4F6]' : ''}`}>
                    <button onClick={() => toggle(`e${e.id}`)} aria-label="Toggle epic">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                    <Layers size={14} />
                    <button className="flex-1 truncate text-left text-[13px] font-semibold" onClick={() => setSel({ kind: 'epic', id: e.id as number })}>{e.title}</button>
                    <button className={btnGhost} onClick={() => void addFeature(e.id as number)} aria-label="Add feature"><Plus size={12} /></button>
                  </div>
                  {isOpen && (
                    <ul className="ml-5 border-l border-[#D1D5DB] pl-2">
                      {fs.map((f) => {
                        const vs = visibleStories(f.id as number);
                        if (filtering && vs.length === 0) return null;
                        const fOpen = filtering || open.has(`f${f.id}`);
                        return (
                          <li key={f.id}>
                            <div className={`flex items-center gap-1 rounded px-1 py-1 ${sel?.kind === 'feature' && sel.id === f.id ? 'bg-[#F3F4F6]' : ''}`}>
                              <button onClick={() => toggle(`f${f.id}`)} aria-label="Toggle feature">{fOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                              <Boxes size={13} />
                              <button className="flex-1 truncate text-left text-[13px] font-medium" onClick={() => setSel({ kind: 'feature', id: f.id as number })}>{f.title}</button>
                              <span className="text-[11px] text-[#6B7280]">{vs.length}</span>
                              <button className={btnGhost} onClick={() => void addStory(f.id as number)} aria-label="Add story"><Plus size={12} /></button>
                            </div>
                            {fOpen && (
                              <ul className="ml-5 border-l border-[#E5E7EB] pl-2">
                                {vs.map((st) => (
                                  <li key={st.id}>
                                    <button
                                      onClick={() => setSel({ kind: 'story', id: st.id as number })}
                                      className={`my-[2px] flex w-full flex-col gap-1 rounded border px-2 py-2 text-left ${sel?.kind === 'story' && sel.id === st.id ? 'border-2 border-[#111827]' : 'border-[#E5E7EB] hover:bg-[#F9FAFB]'}`}
                                    >
                                      <span className="flex items-start gap-1 text-[13px]"><FileText size={13} className="mt-[2px] shrink-0" /> <span>US-{st.id} · {st.title}</span></span>
                                      <span className="flex flex-wrap gap-1">
                                        <PriorityBadge value={st.priority} />
                                        <StatusTag value={st.status} />
                                        <ComplexityChip size={st.complexity} points={st.storyPoints} />
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* detail */}
        <div className={card}>
          {!sel && <p className={muted}>Select an epic, feature or story to view and edit it.</p>}

          {selEpic && (
            <div className="space-y-3" key={`epic-${selEpic.id}`}>
              <div className="flex items-center justify-between"><h3 className={h2}>Epic</h3><button className={btnSecondary} onClick={() => void removeSel()}><Trash2 size={14} /></button></div>
              <div><label className={label}>Title</label><input className={input} defaultValue={selEpic.title} onBlur={(e) => void db.epics.update(selEpic.id as number, { title: e.target.value })} /></div>
              <div><label className={label}>Description</label><textarea className={input} rows={4} defaultValue={selEpic.description} onBlur={(e) => void db.epics.update(selEpic.id as number, { description: e.target.value })} /></div>
            </div>
          )}

          {selFeature && (
            <div className="space-y-3" key={`feat-${selFeature.id}`}>
              <div className="flex items-center justify-between"><h3 className={h2}>Feature</h3><button className={btnSecondary} onClick={() => void removeSel()}><Trash2 size={14} /></button></div>
              <div><label className={label}>Title</label><input className={input} defaultValue={selFeature.title} onBlur={(e) => void db.features.update(selFeature.id as number, { title: e.target.value })} /></div>
              <div><label className={label}>Description</label><textarea className={input} rows={4} defaultValue={selFeature.description} onBlur={(e) => void db.features.update(selFeature.id as number, { description: e.target.value })} /></div>
            </div>
          )}

          {selStory && (
            <div className="space-y-4" key={`story-${selStory.id}`}>
              <div className="flex items-center justify-between">
                <h3 className={h2}>US-{selStory.id}</h3>
                <button className={btnSecondary} onClick={() => void removeSel()}><Trash2 size={14} /></button>
              </div>
              <div className="flex flex-wrap gap-2">
                <PriorityBadge value={selStory.priority} />
                <StatusTag value={selStory.status} />
                <ComplexityChip size={selStory.complexity} points={selStory.storyPoints} />
                {selStory.requirementIds.map((id) => <Chip key={id}>REQ-{id}</Chip>)}
              </div>
              <div><label className={label}>Title</label><input className={input} defaultValue={selStory.title} onBlur={(e) => void patchStory({ title: e.target.value })} /></div>
              <div className="grid gap-3 md:grid-cols-3">
                <div><label className={label}>As a</label><input className={input} defaultValue={selStory.asA} onBlur={(e) => void patchStory({ asA: e.target.value })} /></div>
                <div><label className={label}>I want to</label><input className={input} defaultValue={selStory.iWant} onBlur={(e) => void patchStory({ iWant: e.target.value })} /></div>
                <div><label className={label}>So that</label><input className={input} defaultValue={selStory.soThat} onBlur={(e) => void patchStory({ soThat: e.target.value })} /></div>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div><label className={label}>Priority (MoSCoW)</label>
                  <select className={input} value={selStory.priority} onChange={(e) => void patchStory({ priority: e.target.value as MoSCoW })}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></div>
                <div><label className={label}>Status</label>
                  <select className={input} value={selStory.status} onChange={(e) => void patchStory({ status: e.target.value as StoryStatus })}>{STATUSES.map((p) => <option key={p}>{p}</option>)}</select></div>
                <div><label className={label}>Complexity</label>
                  <select className={input} value={selStory.complexity} onChange={(e) => void patchStory({ complexity: e.target.value as Complexity, storyPoints: POINTS[e.target.value as Complexity] })}>{SIZES.map((p) => <option key={p}>{p}</option>)}</select></div>
                <div><label className={label}>Story points</label>
                  <input type="number" min={1} max={21} className={input} defaultValue={selStory.storyPoints} onBlur={(e) => void patchStory({ storyPoints: Math.max(1, Number(e.target.value) || 1) })} /></div>
              </div>
              <div>
                <label className={label}>Acceptance criteria (one per line)</label>
                <textarea className={input} rows={7} defaultValue={selStory.acceptanceCriteria.join('\n')} onBlur={(e) => void patchStory({ acceptanceCriteria: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
              </div>
              <div>
                <label className={label}>Business rules (one per line)</label>
                <textarea className={input} rows={3} defaultValue={selStory.businessRules.join('\n')} onBlur={(e) => void patchStory({ businessRules: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
