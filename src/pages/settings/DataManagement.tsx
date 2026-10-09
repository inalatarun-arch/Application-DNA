import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Download, Upload } from 'lucide-react';
import { db } from '@/db/db';
import {
  BackupError,
  exportDatabaseToFile,
  readBackupFile,
  restoreBackup,
  countRows,
  type BackupFile,
} from '@/db/backup';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';

type Message = { tone: 'ok' | 'error'; text: string } | null;

const TABLE_LABELS: Record<string, string> = {
  applications: 'Applications',
  modules: 'Modules',
  screens: 'Screens',
  screenMedia: 'Screen images',
  functionalities: 'Functionalities',
  technicalComponents: 'Technical components',
  projects: 'Projects',
  meetings: 'Meetings',
  candidates: 'Requirement suggestions',
  requirements: 'Requirements',
  artifacts: 'Artifacts',
  testCases: 'Test cases',
  defects: 'Defects',
  settings: 'Settings',
};

export default function DataManagement() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [includeKey, setIncludeKey] = useState(false);
  const [restoreKey, setRestoreKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ name: string; backup: BackupFile } | null>(null);
  const [message, setMessage] = useState<Message>(null);

  const counts = useLiveQuery(async () => {
    const out: Record<string, number> = {};
    for (const t of db.tables) out[t.name] = await t.count();
    return out;
  }, []);

  const onExport = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { filename, counts: exported } = await exportDatabaseToFile({ includeApiKey: includeKey });
      const total = Object.values(exported).reduce((a, b) => a + b, 0);
      setMessage({ tone: 'ok', text: `Exported ${total} records to ${filename}.` });
    } catch (err) {
      setMessage({ tone: 'error', text: `Export failed: ${err instanceof Error ? err.message : 'unknown error'}` });
    } finally {
      setBusy(false);
    }
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    setPending(null);
    try {
      setPending({ name: file.name, backup: await readBackupFile(file) });
      setRestoreKey(false);
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof BackupError ? err.message : 'Could not read that file.' });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const onRestore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const restored = await restoreBackup(pending.backup, { restoreApiKey: restoreKey });
      const total = Object.values(restored).reduce((a, b) => a + b, 0);
      setMessage({ tone: 'ok', text: `Restored ${total} records from ${pending.name}.` });
      setPending(null);
    } catch (err) {
      setMessage({ tone: 'error', text: `Restore failed and no changes were applied: ${err instanceof Error ? err.message : 'unknown error'}` });
    } finally {
      setBusy(false);
    }
  };

  const pendingCounts = pending ? countRows(pending.backup) : null;

  return (
    <section className="card" aria-labelledby="data-title">
      <h2 id="data-title" className="text-headline-md">Data management</h2>
      <p className="mt-1 text-body-md text-on-surface-variant">
        Everything lives in this browser&apos;s IndexedDB. Export a backup regularly, and before clearing browser data.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[320px] text-body-md">
          <caption className="sr-only">Records stored locally</caption>
          <tbody className="divide-y divide-outline-variant">
            {Object.entries(TABLE_LABELS).map(([key, label]) => (
              <tr key={key}>
                <th scope="row" className="py-2 pr-4 text-left font-normal text-on-surface-variant">{label}</th>
                <td className="py-2 text-right font-medium tabular-nums">{counts ? counts[key] ?? 0 : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <hr className="my-6 border-outline-variant" />

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="text-body-lg font-semibold">Export database to JSON</h3>
          <p className="mt-1 text-body-md text-on-surface-variant">Downloads every table as a single backup file.</p>
          <label className="mt-3 flex items-start gap-2 text-body-md">
            <input type="checkbox" className="mt-1" checked={includeKey} onChange={(e) => setIncludeKey(e.target.checked)} />
            <span>
              Include my Gemini API key
              <span className="field-hint block">Off by default. Anyone with the file could use the key.</span>
            </span>
          </label>
          <button type="button" className="btn btn-primary mt-4" onClick={onExport} disabled={busy}>
            <Download size={16} aria-hidden />
            Export database
          </button>
        </div>

        <div>
          <h3 className="text-body-lg font-semibold">Import / restore database</h3>
          <p className="mt-1 text-body-md text-on-surface-variant">Replaces all local data with the contents of a backup file.</p>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            id="backup-file"
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />
          <label htmlFor="backup-file" className="btn btn-secondary mt-4 cursor-pointer focus-within:outline focus-within:outline-2">
            <Upload size={16} aria-hidden />
            Choose backup file
          </label>
        </div>
      </div>

      {pending && pendingCounts && (
        <div className="mt-6 rounded-lg border border-primary p-4" role="alertdialog" aria-labelledby="restore-title">
          <p id="restore-title" className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={18} aria-hidden /> Replace all local data?
          </p>
          <p className="mt-1 text-body-md text-on-surface-variant">
            <span className="font-medium text-on-surface">{pending.name}</span>, exported {formatDateTime(pending.backup.exportedAt)} with{' '}
            {Object.values(pendingCounts).reduce((a, b) => a + b, 0)} records. Your current data will be overwritten and cannot be recovered
            unless you have exported it.
          </p>
          {pending.backup.secrets?.geminiApiKey && (
            <label className="mt-3 flex items-center gap-2 text-body-md">
              <input type="checkbox" checked={restoreKey} onChange={(e) => setRestoreKey(e.target.checked)} />
              Also restore the API key stored in this backup
            </label>
          )}
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn btn-primary" onClick={onRestore} disabled={busy}>Replace local data</button>
            <button type="button" className="btn btn-secondary" onClick={() => setPending(null)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}

      <div aria-live="polite" className="mt-4">
        {message && (
          <p className={cn('rounded border p-3 text-body-md', message.tone === 'ok' ? 'border-outline-variant bg-surface-low' : 'border-error bg-error-container text-error')}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}
