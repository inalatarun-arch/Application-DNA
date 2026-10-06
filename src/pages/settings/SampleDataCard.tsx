import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { DatabaseZap, Trash2 } from 'lucide-react';
import { hasSampleData, loadSampleData, removeSampleData, type SampleSummary } from '@/db/seed';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { cn } from '@/lib/cn';

type Message = { tone: 'ok' | 'error'; text: string } | null;

export default function SampleDataCard() {
  const loaded = useLiveQuery(hasSampleData, []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const load = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const s: SampleSummary = await loadSampleData();
      setMessage({ tone: 'ok', text: `Loaded ${s.applications} applications, ${s.screens} screens, ${s.functionalities} functionalities and ${s.components} technical components.` });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not load the sample data.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="sample-title">
      <h2 id="sample-title" className="text-headline-md">Sample enterprise data</h2>
      <p className="mt-1 max-w-2xl text-body-md text-on-surface-variant">
        Adds a realistic procure-to-pay landscape: an Oracle EBS Supplier Maintenance screen backed by the AP_SUPPLIERS table, Supplier APIs, a queue and PL/SQL packages,
        a Salesforce onboarding front end connected through MuleSoft, an SAP goods receipt screen and a custom requisition portal. Use it to try the registry, the linking
        selectors and the reverse views, and later the knowledge graph and AI features.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" onClick={() => void load()} disabled={busy || loaded === true}>
          <DatabaseZap size={16} aria-hidden />
          {busy ? 'Loading…' : 'Load Sample Enterprise Data'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setConfirmRemove(true)} disabled={busy || loaded !== true}>
          <Trash2 size={16} aria-hidden />
          Remove sample data
        </button>
        <span className="text-label-md font-normal text-on-surface-variant">{loaded ? 'Sample data is loaded.' : 'Not loaded.'}</span>
      </div>

      <div aria-live="polite" className="mt-4">
        {message && (
          <p className={cn('rounded border p-3 text-body-md', message.tone === 'ok' ? 'border-outline-variant bg-surface-low' : 'border-error bg-error-container text-error')}>{message.text}</p>
        )}
      </div>

      <ConfirmModal
        open={confirmRemove}
        title="Remove sample data?"
        confirmLabel="Remove sample data"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={async () => {
          const n = await removeSampleData();
          setConfirmRemove(false);
          setMessage({ tone: 'ok', text: `Removed ${n} sample applications and everything documented under them.` });
        }}
        message={<p>Deletes the sample applications together with their modules, screens, functionalities and technical components. Anything you added to them is deleted as well. Your own applications are not touched.</p>}
      />
    </section>
  );
}
