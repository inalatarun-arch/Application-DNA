import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, FileUp, Loader2, Plus, Sparkles, Square, Trash2, X } from 'lucide-react';
import { db, nowIso } from '@/db/db';
import { useAiSettings } from '@/db/settings';
import { addCandidates, clearUnreviewedCandidates, deleteMeeting } from '@/db/projects';
import type { Meeting, MeetingAction, MeetingDecision, Project } from '@/db/types';
import { useApiKey } from '@/hooks/useApiKey';
import { useAutosave } from '@/hooks/useAutosave';
import { useGraphSource } from '@/hooks/useGraphSource';
import SaveStatus from '@/components/ui/SaveStatus';
import Section from '@/components/ui/Section';
import StatusBadge from '@/components/ui/StatusBadge';
import StringListEditor from '@/components/ui/StringListEditor';
import TagInput from '@/components/ui/TagInput';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { saveText, meetingToMarkdown, fileBase } from '@/lib/exporters';
import { computeScope } from '@/lib/projectScope';
import { ACCEPTED_TRANSCRIPT_TYPES, approxTokens, readTranscriptFile } from '@/lib/transcript';
import { describeError, isGeminiError } from '@/services/geminiService';
import { extractFromTranscript, MAX_TRANSCRIPT_CHARS } from '@/services/transcriptAI';

interface Props {
  meeting: Meeting;
  project: Project;
  onReview: () => void;
  onDeleted: () => void;
}

const MIN_TRANSCRIPT_CHARS = 80;

function DecisionRows({ rows, onChange }: { rows: MeetingDecision[]; onChange: (rows: MeetingDecision[]) => void }) {
  const set = (i: number, patch: Partial<MeetingDecision>) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="field-label mb-0">Decisions made</span>
        <button type="button" className="btn btn-secondary px-2 py-1 text-label-md" onClick={() => onChange([...rows, { text: '', owner: '' }])}>
          <Plus size={14} aria-hidden />
          Add decision
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-outline-variant px-3 py-3 text-body-md text-on-surface-variant">No decisions recorded.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="grid grid-cols-[1fr_36px] gap-2 md:grid-cols-[1fr_220px_36px]">
              <textarea className="input min-h-[38px]" rows={2} value={r.text} placeholder="What was decided" aria-label={`Decision ${i + 1}`} onChange={(e) => set(i, { text: e.target.value })} />
              <button type="button" className="icon-btn md:order-last" aria-label={`Remove decision ${i + 1}`} onClick={() => onChange(rows.filter((_, idx) => idx !== i))}>
                <X size={16} aria-hidden />
              </button>
              <input className="input col-span-2 md:col-span-1" value={r.owner} placeholder="Owner" aria-label={`Decision ${i + 1} owner`} onChange={(e) => set(i, { owner: e.target.value })} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActionRows({ rows, onChange }: { rows: MeetingAction[]; onChange: (rows: MeetingAction[]) => void }) {
  const set = (i: number, patch: Partial<MeetingAction>) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="field-label mb-0">Action items</span>
        <button type="button" className="btn btn-secondary px-2 py-1 text-label-md" onClick={() => onChange([...rows, { task: '', assignee: '', due: '', done: false }])}>
          <Plus size={14} aria-hidden />
          Add action
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-outline-variant px-3 py-3 text-body-md text-on-surface-variant">No action items recorded.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="grid grid-cols-[28px_1fr_36px] items-start gap-2 md:grid-cols-[28px_1fr_170px_150px_36px]">
              <input type="checkbox" className="mt-3" checked={r.done} aria-label={`Action ${i + 1} done`} onChange={(e) => set(i, { done: e.target.checked })} />
              <textarea className={`input min-h-[38px] ${r.done ? 'text-on-surface-variant line-through' : ''}`} rows={2} value={r.task} placeholder="Task" aria-label={`Action ${i + 1} task`} onChange={(e) => set(i, { task: e.target.value })} />
              <input className="input col-span-2 col-start-2 md:col-span-1 md:col-start-auto" value={r.assignee} placeholder="Assignee" aria-label={`Action ${i + 1} assignee`} onChange={(e) => set(i, { assignee: e.target.value })} />
              <input type="date" className="input col-span-2 col-start-2 md:col-span-1 md:col-start-auto" value={r.due} aria-label={`Action ${i + 1} due date`} onChange={(e) => set(i, { due: e.target.value })} />
              <button type="button" className="icon-btn col-start-3 row-start-1 md:col-start-auto md:row-start-auto" aria-label={`Remove action ${i + 1}`} onClick={() => onChange(rows.filter((_, idx) => idx !== i))}>
                <X size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MeetingEditor({ meeting, project, onReview, onDeleted }: Props) {
  const { draft, update, state } = useAutosave(db.meetings, meeting);
  const apiKey = useApiKey();
  const [ai] = useAiSettings();
  const source = useGraphSource();
  const suggestions = useLiveQuery(() => db.candidates.where('meetingId').equals(meeting.id).toArray(), [meeting.id]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fileError, setFileError] = useState('');
  const [pendingFile, setPendingFile] = useState<{ name: string; text: string } | null>(null);
  const [confirmRun, setConfirmRun] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const model = ai.featureModels.transcript ?? ai.defaultModel;
  const chars = draft.transcript.length;
  const readyToRun = !!apiKey && chars >= MIN_TRANSCRIPT_CHARS && !busy && !!source;
  const hasResults = !!(draft.summary || draft.keyPoints.length || draft.decisions.length || draft.actionItems.length || draft.openQuestions.length);
  const toReview = (suggestions ?? []).filter((c) => c.decision === 'pending' || c.decision === 'accepted').length;
  const replaceable = (suggestions ?? []).filter((c) => c.decision === 'pending' || c.decision === 'rejected').length;

  const applyFile = (name: string, text: string) => {
    const base = name.replace(/\.[^.]+$/, '');
    update({ transcript: text, source: 'upload', fileName: name, ...(draft.title === 'Untitled meeting' ? { title: base } : {}) });
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError('');
    try {
      const text = await readTranscriptFile(file);
      if (!text.trim()) throw new Error(`${file.name} has no readable text.`);
      if (draft.transcript.trim()) setPendingFile({ name: file.name, text });
      else applyFile(file.name, text);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  const run = async () => {
    if (!source) return;
    setBusy(true);
    setError('');
    setNotice('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      const scope = computeScope(project, source, []);
      const result = await extractFromTranscript(
        {
          project,
          meeting: draft,
          applications: source.applications.filter((a) => (project.applicationIds ?? []).includes(a.id)),
          modules: source.modules.filter((m) => (project.moduleIds ?? []).includes(m.id)),
          functionalities: scope.functionalities.length > 0 ? scope.functionalities : source.functionalities,
        },
        controller.signal,
      );
      await clearUnreviewedCandidates(meeting.id);
      await addCandidates(project.id, meeting.id, result.requirements);
      const patch = {
        summary: result.summary,
        keyPoints: result.keyPoints,
        decisions: result.decisions,
        actionItems: result.actionItems,
        openQuestions: result.openQuestions,
        status: 'processed' as const,
        error: '',
        model: result.model,
        processedAt: nowIso(),
      };
      // Written straight to the database so the result survives even if you navigate away, then mirrored into the editor.
      await db.meetings.update(meeting.id, { ...patch, updatedAt: nowIso() });
      update(patch);
      setNotice(
        `Done with ${result.model}: ${result.decisions.length} decisions, ${result.actionItems.length} action items and ${result.requirements.length} suggested requirements.` +
          (result.truncated ? ` The transcript is longer than ${MAX_TRANSCRIPT_CHARS.toLocaleString()} characters, so only the beginning was read.` : '') +
          (result.outputCut ? ' The reply was cut off, so some later items may be missing. Split the transcript into parts and process each.' : ''),
      );
    } catch (err) {
      if (isGeminiError(err) && err.code === 'ABORTED') {
        setNotice('Processing was cancelled. Nothing was changed.');
      } else {
        const message = describeError(err);
        setError(message);
        await db.meetings.update(meeting.id, { status: 'error', error: message, updatedAt: nowIso() });
        update({ status: 'error', error: message });
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const start = () => (replaceable > 0 || draft.status === 'processed' ? setConfirmRun(true) : void run());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <SaveStatus state={state} />
          {draft.status !== 'draft' && <StatusBadge status={draft.status} label={draft.status === 'processed' ? 'Processed' : 'Failed'} />}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={() => saveText(`${fileBase(draft.title, 'minutes')}.md`, meetingToMarkdown(draft, project))} disabled={!hasResults}>
            <Download size={14} aria-hidden />
            Download minutes
          </button>
          <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} aria-hidden />
            Delete meeting
          </button>
        </div>
      </div>

      <Section title="Meeting">
        <div className="grid gap-4 md:grid-cols-[1fr_180px]">
          <div>
            <label htmlFor="m-title" className="field-label">Title</label>
            <input id="m-title" className="input" value={draft.title} onChange={(e) => update({ title: e.target.value })} />
          </div>
          <div>
            <label htmlFor="m-date" className="field-label">Date</label>
            <input id="m-date" type="date" className="input" value={draft.meetingDate} onChange={(e) => update({ meetingDate: e.target.value })} />
          </div>
        </div>
        <div>
          <label htmlFor="m-attendees" className="field-label">Attendees</label>
          <TagInput id="m-attendees" value={draft.attendees} onChange={(v) => update({ attendees: v })} placeholder="Type a name and press Enter" />
        </div>
      </Section>

      <Section title="Transcript" description="Paste text from Teams, Zoom or workshop notes, or upload a .txt, .vtt or .srt file. Timestamps and markup are removed automatically.">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()}>
            <FileUp size={16} aria-hidden />
            Upload file
          </button>
          <input ref={fileInput} type="file" accept={ACCEPTED_TRANSCRIPT_TYPES} className="sr-only" aria-label="Choose a transcript file" onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ''; }} />
          {draft.fileName && <span className="text-label-md font-normal text-on-surface-variant">Loaded from {draft.fileName}</span>}
        </div>
        {fileError && <p role="alert" className="rounded border border-error bg-error-container p-3 text-body-md text-error">{fileError}</p>}
        <div>
          <label htmlFor="m-transcript" className="sr-only">Transcript text</label>
          <textarea
            id="m-transcript"
            className="input min-h-[240px] font-mono text-code"
            spellCheck={false}
            value={draft.transcript}
            placeholder={'Paste the transcript here, or drop a file onto this box.\n\nJane Doe: Thanks everyone. The goal today is to agree how suppliers are onboarded…'}
            onChange={(e) => update({ transcript: e.target.value, source: 'paste', fileName: '' })}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void handleFile(e.dataTransfer.files?.[0]);
            }}
          />
          <p className="field-hint">{chars.toLocaleString()} characters · about {approxTokens(draft.transcript).toLocaleString()} tokens</p>
        </div>

        <div className="rounded border border-outline-variant bg-surface-low p-4">
          {!apiKey ? (
            <p className="text-body-md">
              Add your AI API key to process transcripts. <Link to="/settings" className="font-semibold underline">Open settings</Link>
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {busy ? (
                <button type="button" className="btn btn-secondary" onClick={() => abort.current?.abort()}>
                  <Square size={14} aria-hidden />
                  Cancel
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={start} disabled={!readyToRun}>
                  <Sparkles size={16} aria-hidden />
                  Process with AI
                </button>
              )}
              <p className="min-w-0 flex-1 text-body-md text-on-surface-variant" aria-live="polite">
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" aria-hidden />
                    Reading the transcript with {model}. Long sessions can take a minute or two.
                  </span>
                ) : chars < MIN_TRANSCRIPT_CHARS ? (
                  'Add a transcript to enable processing.'
                ) : (
                  `Uses ${model}. The transcript is sent to your selected AI provider with your key.`
                )}
              </p>
            </div>
          )}
        </div>

        {error && <p role="alert" className="rounded border border-error bg-error-container p-3 text-body-md text-error">{error}</p>}
        {notice && <p role="status" className="rounded border border-outline-variant bg-surface-low p-3 text-body-md">{notice}</p>}
      </Section>

      {(hasResults || draft.status === 'processed') && (
        <Section title="Meeting notes" description={draft.processedAt ? `Generated by ${draft.model || 'AI'}. Everything below is editable and saves automatically.` : 'Everything below is editable and saves automatically.'}>
          <div>
            <label htmlFor="m-summary" className="field-label">Executive summary</label>
            <textarea id="m-summary" className="input min-h-[120px]" value={draft.summary} onChange={(e) => update({ summary: e.target.value })} />
          </div>
          <StringListEditor label="Key discussion points" items={draft.keyPoints} onChange={(v) => update({ keyPoints: v })} addLabel="Add point" placeholder="One discussion topic" multiline />
          <DecisionRows rows={draft.decisions} onChange={(rows) => update({ decisions: rows })} />
          <ActionRows rows={draft.actionItems} onChange={(rows) => update({ actionItems: rows })} />
          <StringListEditor label="Open questions" items={draft.openQuestions} onChange={(v) => update({ openQuestions: v })} addLabel="Add question" placeholder="An unresolved question or risk" />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-outline-variant bg-surface-low p-4">
            <p className="text-body-md">
              {toReview > 0 ? <><strong>{toReview}</strong> suggested requirement{toReview === 1 ? '' : 's'} waiting for your review.</> : 'No suggested requirements waiting for review.'}
            </p>
            <button type="button" className="btn btn-primary" onClick={onReview}>Review requirements</button>
          </div>
        </Section>
      )}

      <ConfirmModal
        open={confirmRun}
        title="Process this transcript again?"
        confirmLabel="Process again"
        onCancel={() => setConfirmRun(false)}
        onConfirm={async () => {
          setConfirmRun(false);
          await run();
        }}
        message={
          <>
            <p>The meeting notes below will be replaced by a fresh extraction, including any edits you made to them.</p>
            <p className="mt-2">{replaceable > 0 ? `${replaceable} suggested requirement${replaceable === 1 ? '' : 's'} that you have not accepted will be replaced. ` : ''}Accepted suggestions and anything already in the backlog are kept.</p>
          </>
        }
      />

      <ConfirmModal
        open={!!pendingFile}
        title="Replace the transcript?"
        confirmLabel="Replace"
        onCancel={() => setPendingFile(null)}
        onConfirm={() => {
          if (pendingFile) applyFile(pendingFile.name, pendingFile.text);
          setPendingFile(null);
        }}
        message={<p>The text in the transcript box will be replaced with the contents of <strong className="text-on-surface">{pendingFile?.name}</strong>.</p>}
      />

      <ConfirmModal
        open={confirmDelete}
        title="Delete meeting?"
        confirmLabel="Delete meeting"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteMeeting(meeting.id);
          onDeleted();
        }}
        message={<p><strong className="text-on-surface">{draft.title || 'This meeting'}</strong>, its notes and its {(suggestions ?? []).length} requirement suggestions will be removed. Requirements already in the backlog are kept.</p>}
      />
    </div>
  );
}
