import { X } from 'lucide-react';

export interface RelatedOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface Props {
  label: string;
  options: RelatedOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

/** Pick related records from a list; selected items show as removable chips. Missing ids are ignored. */
export default function RelatedPicker({ label, options, value, onChange, placeholder = 'Add related…' }: Props) {
  const byId = new Map(options.map((o) => [o.id, o]));
  const selected = value.filter((id) => byId.has(id));
  const available = options.filter((o) => !value.includes(o.id));

  return (
    <div>
      <span className="field-label">{label}</span>
      {selected.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((id) => {
            const o = byId.get(id)!;
            return (
              <li key={id} className="inline-flex items-center gap-1 rounded border border-outline-variant bg-surface-low py-0.5 pl-2 pr-1 text-label-md">
                {o.label}
                <button type="button" aria-label={`Remove ${o.label}`} className="rounded p-0.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface" onClick={() => onChange(value.filter((v) => v !== id))}>
                  <X size={12} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <select
        className="input"
        aria-label={label}
        value=""
        disabled={available.length === 0}
        onChange={(e) => e.target.value && onChange([...value, e.target.value])}
      >
        <option value="">{available.length === 0 ? 'Nothing else to add' : placeholder}</option>
        {available.map((o) => (
          <option key={o.id} value={o.id}>{o.sublabel ? `${o.label} — ${o.sublabel}` : o.label}</option>
        ))}
      </select>
    </div>
  );
}
