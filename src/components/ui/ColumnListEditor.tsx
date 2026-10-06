import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { ColumnDef } from '@/db/types';

interface Props {
  rows: ColumnDef[];
  onChange: (rows: ColumnDef[]) => void;
}

const BLANK: ColumnDef = { name: '', dataType: '', nullable: true, key: '', references: '', description: '' };

/** Column list for tables and views, including primary and foreign key mappings. */
export default function ColumnListEditor({ rows, onChange }: Props) {
  const nameRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  useEffect(() => {
    if (focusIndex !== null) {
      nameRefs.current[focusIndex]?.focus();
      setFocusIndex(null);
    }
  }, [focusIndex, rows.length]);

  const setRow = (i: number, patch: Partial<ColumnDef>) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const pk = rows.filter((r) => r.key === 'PK' && r.name.trim()).map((r) => r.name.trim());
  const fks = rows.filter((r) => r.key === 'FK' && r.name.trim());

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="field-label mb-0">Columns</span>
        <button
          type="button"
          className="btn btn-secondary px-2 py-1 text-label-md"
          onClick={() => {
            onChange([...rows, { ...BLANK }]);
            setFocusIndex(rows.length);
          }}
        >
          <Plus size={14} aria-hidden />
          Add column
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-outline-variant px-3 py-3 text-body-md text-on-surface-variant">No columns documented yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, i) => (
            <li key={i} className="rounded border border-outline-variant p-3">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-[1.4fr_1fr_90px_80px_1.4fr_36px]">
                <input ref={(el) => { nameRefs.current[i] = el; }} className="input col-span-2 font-mono text-code md:col-span-1" value={row.name} placeholder="COLUMN_NAME" aria-label={`Column name ${i + 1}`} onChange={(e) => setRow(i, { name: e.target.value })} />
                <input className="input font-mono text-code" value={row.dataType} placeholder="VARCHAR2(240)" aria-label={`Data type ${i + 1}`} onChange={(e) => setRow(i, { dataType: e.target.value })} />
                <select className="input" value={row.key} aria-label={`Key type ${i + 1}`} onChange={(e) => setRow(i, { key: e.target.value as ColumnDef['key'], nullable: e.target.value === 'PK' ? false : row.nullable })}>
                  <option value="">No key</option>
                  <option value="PK">Primary</option>
                  <option value="FK">Foreign</option>
                </select>
                <label className="flex items-center gap-2 text-body-md">
                  <input type="checkbox" checked={row.nullable} disabled={row.key === 'PK'} onChange={(e) => setRow(i, { nullable: e.target.checked })} />
                  Nullable
                </label>
                <input className="input font-mono text-code" value={row.references} disabled={row.key !== 'FK'} placeholder={row.key === 'FK' ? 'PARENT_TABLE.COLUMN' : 'Foreign keys only'} aria-label={`References ${i + 1}`} onChange={(e) => setRow(i, { references: e.target.value })} />
                <button type="button" className="icon-btn col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto" onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label={`Remove column ${i + 1}`}>
                  <X size={16} aria-hidden />
                </button>
              </div>
              <input className="input mt-2" value={row.description} placeholder="What this column holds" aria-label={`Column description ${i + 1}`} onChange={(e) => setRow(i, { description: e.target.value })} />
            </li>
          ))}
        </ul>
      )}

      {(pk.length > 0 || fks.length > 0) && (
        <dl className="mt-3 rounded border border-outline-variant bg-surface-low p-3 text-body-md">
          {pk.length > 0 && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold">Primary key:</dt>
              <dd className="font-mono text-code">{pk.join(', ')}</dd>
            </div>
          )}
          {fks.map((f, i) => (
            <div key={i} className="flex flex-wrap gap-x-2">
              <dt className="font-semibold">Foreign key:</dt>
              <dd className="font-mono text-code">{f.name} → {f.references || '(reference not set)'}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
