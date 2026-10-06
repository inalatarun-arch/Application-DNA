import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { NAV_ITEMS } from '@/config/nav';
import { cn } from '@/lib/cn';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Quick navigation today. Repository-wide content search plugs in here once data exists. */
export default function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return NAV_ITEMS.filter((i) => !q || `${i.label} ${i.description}`.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  if (!open) return null;

  const go = (to: string) => {
    navigate(to);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[index]) go(results[index].to);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[15vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="w-full max-w-lg rounded border-2 border-primary bg-surface-lowest"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-outline-variant px-4">
          <Search size={16} aria-hidden className="text-on-surface-variant" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a page…"
            aria-label="Search pages"
            className="h-12 w-full bg-transparent text-body-lg text-on-surface placeholder:text-outline focus-visible:outline-none"
          />
        </div>
        <ul className="max-h-80 overflow-y-auto p-2" role="listbox">
          {results.length === 0 && <li className="px-3 py-6 text-center text-body-md text-on-surface-variant">No matching pages.</li>}
          {results.map((item, i) => (
            <li key={item.to} role="option" aria-selected={i === index}>
              <button
                type="button"
                onClick={() => go(item.to)}
                onMouseEnter={() => setIndex(i)}
                className={cn('flex w-full items-center gap-3 rounded px-3 py-2 text-left', i === index && 'bg-surface-container')}
              >
                <item.icon size={18} aria-hidden className="shrink-0 text-on-surface-variant" />
                <span className="min-w-0">
                  <span className="block text-body-md font-medium">{item.label}</span>
                  <span className="block truncate text-label-md font-normal text-on-surface-variant">{item.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
