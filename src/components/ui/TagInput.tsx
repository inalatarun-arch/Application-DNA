import { useId, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  id?: string;
  ariaLabel?: string;
}

/** Chip input: Enter or comma adds, Backspace on an empty field removes the last chip. */
export default function TagInput({ value, onChange, placeholder = 'Type and press Enter', suggestions, id, ariaLabel }: Props) {
  const [text, setText] = useState('');
  const listId = useId();

  const add = (raw: string) => {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setText('');
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded border border-outline-variant bg-surface-lowest p-1.5 focus-within:border-primary">
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded border border-outline-variant bg-surface-low py-0.5 pl-2 pr-1 text-label-md">
          {tag}
          <button type="button" aria-label={`Remove ${tag}`} className="rounded p-0.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface" onClick={() => onChange(value.filter((v) => v !== tag))}>
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
      <input
        id={id}
        aria-label={ariaLabel}
        list={suggestions ? listId : undefined}
        value={text}
        placeholder={value.length === 0 ? placeholder : ''}
        className="min-w-[140px] flex-1 bg-transparent p-1 text-body-md text-on-surface placeholder:text-outline focus-visible:outline-none"
        onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => add(text)}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
    </div>
  );
}
