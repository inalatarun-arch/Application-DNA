import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ImagePlus, Loader2, Sparkles, Trash2, UploadCloud } from 'lucide-react';
import { db, newId, nowIso } from '@/db/db';
import type { Screen, ScreenMedia } from '@/db/types';
import Modal from '@/components/ui/Modal';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { processImage } from '@/lib/image';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useApiKey } from '@/hooks/useApiKey';
import { extractScreenFromFiles } from '@/services/screenAI';
import { describeError, isGeminiError } from '@/services/geminiService';

type Kind = ScreenMedia['kind'];

function MediaCard({ item, onOpen, onDelete }: { item: ScreenMedia; onOpen: () => void; onDelete: () => void }) {
  const [caption, setCaption] = useState(item.caption);
  useEffect(() => setCaption(item.caption), [item.caption]);

  return (
    <li className="flex flex-col overflow-hidden rounded border border-outline-variant bg-surface-lowest">
      <button type="button" onClick={onOpen} className="flex h-44 items-center justify-center bg-surface-low" aria-label={`Preview ${item.name}`}>
        <img src={item.dataUrl} alt={item.caption || item.name} className="max-h-full max-w-full object-contain" loading="lazy" />
      </button>
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-body-md font-medium" title={item.name}>{item.name}</p>
          <span className="shrink-0 text-label-md font-normal text-on-surface-variant">{formatBytes(item.sizeBytes)}</span>
        </div>
        <input
          className="input py-1.5"
          value={caption}
          placeholder="Add a caption"
          aria-label={`Caption for ${item.name}`}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => caption !== item.caption && void db.screenMedia.update(item.id, { caption, updatedAt: nowIso() })}
        />
        <div className="flex items-center justify-between gap-2">
          <select
            className="input w-auto py-1"
            value={item.kind}
            aria-label={`Type of ${item.name}`}
            onChange={(e) => void db.screenMedia.update(item.id, { kind: e.target.value as Kind, updatedAt: nowIso() })}
          >
            <option value="screenshot">Screenshot</option>
            <option value="wireframe">Wireframe</option>
          </select>
          <button type="button" className="icon-btn" onClick={onDelete} aria-label={`Delete ${item.name}`}>
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );
}

export default function ScreenMediaTab({ screen }: { screen: Screen }) {
  const media = useLiveQuery(async () => (await db.screenMedia.where('screenId').equals(screen.id).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [screen.id]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>('screenshot');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<ScreenMedia | null>(null);
  const [toDelete, setToDelete] = useState<ScreenMedia | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [analysisNotice, setAnalysisNotice] = useState('');
  const apiKey = useApiKey();

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setBusy(true);
      const problems: string[] = [];
      for (const file of files) {
        try {
          const img = await processImage(file);
          const t = nowIso();
          await db.screenMedia.add({
            id: newId(),
            createdAt: t,
            updatedAt: t,
            screenId: screen.id,
            applicationId: screen.applicationId,
            kind,
            name: file.name || `pasted-image-${t.slice(11, 19).replace(/:/g, '')}.png`,
            caption: '',
            mimeType: img.mimeType,
            sizeBytes: img.sizeBytes,
            dataUrl: img.dataUrl,
          });
        } catch (err) {
          problems.push(err instanceof Error ? err.message : `Could not add ${file.name}.`);
        }
      }
      setErrors(problems);
      setBusy(false);
    },
    [screen.id, screen.applicationId, kind],
  );

  // Paste a screenshot straight from the clipboard (ignored while typing in a field).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="media-kind" className="field-label">Upload as</label>
          <select id="media-kind" className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="screenshot">Screenshot</option>
            <option value="wireframe">Wireframe</option>
          </select>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()} disabled={busy || analyzing}>
          <ImagePlus size={16} aria-hidden />
          {busy ? 'Adding…' : 'Add images'}
        </button>
        <input ref={fileInput} type="file" accept="image/*" multiple className="sr-only" aria-label="Choose image files" onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(Array.from(e.dataTransfer.files)); }}
        className={cn('flex flex-col items-center rounded border-2 border-dashed px-6 py-8 text-center transition-colors', dragging ? 'border-primary bg-surface-container' : 'border-outline-variant')}
      >
        <UploadCloud size={24} aria-hidden className="text-on-surface-variant" />
        <p className="mt-2 text-body-md font-medium">Drop images here, or paste a screenshot with Ctrl/⌘+V</p>
        <p className="text-label-md font-normal text-on-surface-variant">PNG, JPEG, WebP, GIF or SVG up to 15 MB. Large images are resized to 1920 px.</p>
      </div>

      {analysisNotice && <p role="status" className="rounded border border-outline-variant bg-surface-low p-3 text-body-md">{analysisNotice}</p>}
      {analysisError && <p role="alert" className="rounded border border-error bg-error-container p-3 text-body-md text-error">{analysisError}</p>}
      {!apiKey && <p className="field-hint">Configure Gemini in Settings to analyze screenshots with AI.</p>}

      {errors.length > 0 && (
        <ul role="alert" className="rounded border border-error bg-error-container p-3 text-body-md text-error">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      {media && media.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">No screenshots or wireframes yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {media?.map((m) => <MediaCard key={m.id} item={m} onOpen={() => setPreview(m)} onDelete={() => setToDelete(m)} />)}
        </ul>
      )}

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.name ?? 'Preview'} size="xl">
        {preview && (
          <figure>
            <img src={preview.dataUrl} alt={preview.caption || preview.name} className="mx-auto max-h-[70vh] max-w-full object-contain" />
            {preview.caption && <figcaption className="mt-3 text-center text-body-md text-on-surface-variant">{preview.caption}</figcaption>}
          </figure>
        )}
      </Modal>

      <ConfirmModal
        open={!!toDelete}
        title="Delete image?"
        message={<p><strong className="text-on-surface">{toDelete?.name}</strong> will be removed from this screen.</p>}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) await db.screenMedia.delete(toDelete.id);
          setToDelete(null);
        }}
      />
    </div>
  );
}
