import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';

export interface FieldRow {
  field: string;
  description: string;
}

interface Props {
  rows: FieldRow[];
  onChange: (rows: FieldRow[]) => void;
}

/** Two-column editor: field name + what it means / how it behaves. */
export default function FieldListEditor({ rows, onChange }: Props) {
  const nameRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  useEffect(() => {
    if (focusIndex !== null) {
      nameRefs.current[focusIndex]?.focus();
      setFocusIndex(null);
    }
  }, [focusIndex, rows.length]);

  const setRow = (i: number, patch: Partial<FieldRow>) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="field-label mb-0">Fields</span>
        <button
          type="button"
          className="btn btn-secondary px-2 py-1 text-label-md"
          onClick={() => {
            onChange([...rows, { field: '', description: '' }]);
            setFocusIndex(rows.length);
          }}
        >
          <Plus size={14} aria-hidden />
          Add field
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-outline-variant px-3 py-3 text-body-md text-on-surface-variant">No fields documented yet.</p>
      ) : (
        <>
          <div className="mb-1 hidden grid-cols-[220px_1fr_36px] gap-2 text-label-md text-on-surface-variant md:grid">
            <span>Field name</span>
            <span>Description and behaviour</span>
            <span />
          </div>
          <ul className="space-y-2">
            {rows.map((row, i) => (
              <li key={i} className="grid grid-cols-[1fr_36px] gap-2 md:grid-cols-[220px_1fr_36px]">
                <input
                  ref={(el) => { nameRefs.current[i] = el; }}
                  className="input"
                  value={row.field}
                  placeholder="e.g. Supplier Name"
                  aria-label={`Field name ${i + 1}`}
                  onChange={(e) => setRow(i, { field: e.target.value })}
                />
                <button type="button" className="icon-btn md:order-last" onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label={`Remove field ${i + 1}`}>
                  <X size={16} aria-hidden />
                </button>
                <textarea
                  className="input min-h-[38px] col-span-2 md:col-span-1"
                  rows={1}
                  value={row.description}
                  placeholder="What it holds, rules, defaults…"
                  aria-label={`Field description ${i + 1}`}
                  onChange={(e) => setRow(i, { description: e.target.value })}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
