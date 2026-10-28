import { CheckCircle2, Loader2 } from 'lucide-react';
import type { ApplicationExtraction } from '@/lib/extractionModel';
import { sumCounts, type PlanCounts } from '@/lib/catalogueModel';
import type { IngestionResult } from '@/services/applicationIngestion';

export interface DetailEntry {
  /** The application's name as stored. */
  name: string;
  plan: ApplicationExtraction | null;
  counts: PlanCounts;
  status: 'pending' | 'applied';
  result?: IngestionResult;
}

export interface DetailNotes {
  parts: number;
  skipped: number;
  failed: string[];
  truncated: number;
  unmatched: number;
  repairs: string[];
  model: string;
}

const COLUMNS: Array<[keyof PlanCounts, string]> = [
  ['modules', 'Modules'], ['screens', 'Screens'], ['functionalities', 'Functionalities'], ['integrations', 'Integrations'],
  ['components', 'Components'], ['database', 'Database objects'], ['apis', 'API endpoints'],
];

interface Props {
  entries: DetailEntry[];
  notes: DetailNotes | null;
  error: string;
  busy: boolean;
  onReview: (name: string) => void;
}

/** What the deep read found per application, with the way into the detailed review for each. */
export default function CatalogueSummary({ entries, notes, error, busy, onReview }: Props) {
  const total = sumCounts(entries.map((e) => e.counts));
  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded border border-error bg-error-container p-3 text-body-md text-error">{error}</p>}
      {notes && (
        <div className="rounded border border-outline-variant bg-surface-low p-3 text-body-md">
          <p>Read {notes.parts} part{notes.parts === 1 ? '' : 's'} of the document{notes.model ? ` with ${notes.model}` : ''}. The applications are already saved. Nothing below is saved until you apply it; open <strong>Review</strong> on an application to inspect, edit or drop items first.</p>
          {notes.skipped > 0 && <p className="mt-1 text-label-md font-normal text-on-surface-variant">{notes.skipped} part{notes.skipped === 1 ? '' : 's'} about test cases, defects, approvals or appendices were skipped, because they do not describe the applications themselves.</p>}
          {notes.unmatched > 0 && <p className="mt-1 text-label-md font-normal text-on-surface-variant">{notes.unmatched} item{notes.unmatched === 1 ? '' : 's'} named an application that is not in your list and were left out.</p>}
          {notes.repairs.length > 0 && <details className="mt-1 text-label-md font-normal text-on-surface-variant"><summary className="cursor-pointer">{notes.repairs.length} link{notes.repairs.length === 1 ? ' was' : 's were'} repaired from the document's numbering</summary><ul className="list-disc pl-5">{notes.repairs.map((r) => <li key={r}>{r}</li>)}</ul></details>}
          {notes.truncated > 0 && <p className="mt-1 text-label-md text-error">{notes.truncated} part{notes.truncated === 1 ? '' : 's'} produced more than the AI could return in one reply, so some items may be missing. Split the file and import it in parts to be sure.</p>}
          {notes.failed.length > 0 && <ul className="mt-1 list-disc pl-5 text-label-md text-error">{notes.failed.map((f) => <li key={f}>{f}</li>)}</ul>}
        </div>
      )}
      <div className="overflow-x-auto rounded border border-outline-variant">
        <table className="w-full min-w-[860px] text-left text-body-md">
          <thead className="border-b border-outline-variant bg-surface-low text-label-md text-on-surface-variant">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Application</th>
              {COLUMNS.map(([k, label]) => <th key={k} scope="col" className="px-2 py-2 text-right font-medium">{label}</th>)}
              <th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {entries.map((e) => (
              <tr key={e.name}>
                <th scope="row" className="px-3 py-2 font-semibold">{e.name}</th>
                {COLUMNS.map(([k]) => <td key={k} className="px-2 py-2 text-right tabular-nums">{e.counts[k]}</td>)}
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {e.status === 'applied'
                    ? <span className="inline-flex items-center gap-1 text-label-md text-on-surface-variant"><CheckCircle2 size={14} aria-hidden /> Applied</span>
                    : e.plan ? <button type="button" className="btn btn-secondary px-3 py-1.5" disabled={busy} onClick={() => onReview(e.name)}>Review</button> : <span className="text-label-md text-on-surface-variant">Nothing found</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-outline-variant bg-surface-low font-semibold">
            <tr>
              <th scope="row" className="px-3 py-2">Total</th>
              {COLUMNS.map(([k]) => <td key={k} className="px-2 py-2 text-right tabular-nums">{total[k]}</td>)}
              <td className="px-3 py-2">{busy && <Loader2 size={14} className="animate-spin" aria-label="Working" />}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
