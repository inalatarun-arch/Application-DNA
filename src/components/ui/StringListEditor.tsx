import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';

interface Props {
  label: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  addLabel?: string;
  placeholder?: string;
  /** Shows step numbers and up/down reorder buttons. */
  ordered?: boolean;
  multiline?: boolean;
}

/** Dynamic list of text rows: add, edit inline, remove, optionally reorder. Enter adds a row below. */
export default function StringListEditor({ label, hint, items, onChange, addLabel = 'Add item', placeholder, ordered, multiline }: Props) {
  const refs = useRef<Array<HTMLInputElement | HTMLTextAreaElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  useEffect(() => {
    if (focusIndex !== null) {
      refs.current[focusIndex]?.focus();
      setFocusIndex(null);
    }
  }, [focusIndex, items.length]);

  const setItem = (i: number, text: string) => onChange(items.map((v, idx) => (idx === i ? text : v)));
  const insertAfter = (i: number) => {
    const next = [...items];
    next.splice(i + 1, 0, '');
    onChange(next);
    setFocusIndex(i + 1);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="field-label mb-0">{label}</span>
        <button type="button" className="btn btn-secondary px-2 py-1 text-label-md" onClick={() => insertAfter(items.length - 1)}>
          <Plus size={14} aria-hidden />
          {addLabel}
        </button>
      </div>
      {hint && <p className="field-hint mb-2 mt-0">{hint}</p>}
      {items.length === 0 ? (
        <p className="rounded border border-dashed border-outline-variant px-3 py-3 text-body-md text-on-surface-variant">Nothing added yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              {ordered && <span className="w-6 shrink-0 pt-2 text-right text-label-md tabular-nums text-on-surface-variant">{i + 1}.</span>}
              {multiline ? (
                <textarea
                  ref={(el) => { refs.current[i] = el; }}
                  className="input min-h-[64px]"
                  value={item}
                  placeholder={placeholder}
                  aria-label={`${label} ${i + 1}`}
                  onChange={(e) => setItem(i, e.target.value)}
                />
              ) : (
                <input
                  ref={(el) => { refs.current[i] = el; }}
                  className="input"
                  value={item}
                  placeholder={placeholder}
                  aria-label={`${label} ${i + 1}`}
                  onChange={(e) => setItem(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      insertAfter(i);
                    }
                  }}
                />
              )}
              {ordered && (
                <span className="flex shrink-0">
                  <button type="button" className="icon-btn h-9 w-8" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${label} ${i + 1} up`}>
                    <ArrowUp size={14} aria-hidden />
                  </button>
                  <button type="button" className="icon-btn h-9 w-8" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move ${label} ${i + 1} down`}>
                    <ArrowDown size={14} aria-hidden />
                  </button>
                </span>
              )}
              <button type="button" className="icon-btn shrink-0" onClick={() => onChange(items.filter((_, idx) => idx !== i))} aria-label={`Remove ${label} ${i + 1}`}>
                <X size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
