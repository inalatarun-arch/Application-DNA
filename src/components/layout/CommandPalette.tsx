import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppWindow, Boxes, ListChecks, Search, type LucideIcon } from 'lucide-react';
import { NAV_ITEMS } from '@/config/nav';
import { loadCatalogData, searchCatalog, type CatalogData } from '@/lib/catalogSearch';
import { cn } from '@/lib/cn';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Item {
  key: string;
  label: string;
  sublabel: string;
  to: string;
  icon: LucideIcon;
}

/** Quick jump: pages, plus every documented screen, functionality and technical component once you type two characters. */
export default function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setIndex(0);
    let cancelled = false;
    void loadCatalogData().then((d) => !cancelled && setCatalog(d));
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  const pages = useMemo<Item[]>(
    () =>
      NAV_ITEMS.filter((i) => !q || `${i.label} ${i.description}`.toLowerCase().includes(q.toLowerCase())).map((i) => ({
        key: i.to,
        label: i.label,
        sublabel: i.description,
        to: i.to,
        icon: i.icon,
      })),
    [q],
  );

  const content = useMemo<Item[]>(() => {
    if (!catalog || q.length < 2) return [];
    return searchCatalog(catalog, { query: q, limit: 8 }).map((h) => ({
      key: `${h.kind}-${h.id}`,
      label: h.name || 'Untitled',
      sublabel: h.matchedIn ? `${h.path} · matched in ${h.matchedIn.toLowerCase()}` : h.path,
      to: h.to,
      icon: h.kind === 'screen' ? AppWindow : h.kind === 'functionality' ? ListChecks : Boxes,
    }));
  }, [catalog, q]);

  if (!open) return null;

  const flat = [...pages, ...content];
  const go = (to: string) => {
    navigate(to);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flat[index]) go(flat[index].to);
  };

  const row = (item: Item, i: number) => (
    <li key={item.key} role="option" aria-selected={i === index}>
      <button type="button" onClick={() => go(item.to)} onMouseEnter={() => setIndex(i)} className={cn('flex w-full items-center gap-3 rounded px-3 py-2 text-left', i === index && 'bg-surface-container')}>
        <item.icon size={18} aria-hidden className="shrink-0 text-on-surface-variant" />
        <span className="min-w-0">
          <span className="block truncate text-body-md font-medium">{item.label}</span>
          <span className="block truncate text-label-md font-normal text-on-surface-variant">{item.sublabel}</span>
        </span>
      </button>
    </li>
  );

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
            placeholder="Search pages, screens, functionalities and components…"
            aria-label="Search"
            className="h-12 w-full bg-transparent text-body-lg text-on-surface placeholder:text-outline focus-visible:outline-none"
          />
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {flat.length === 0 && <p className="px-3 py-6 text-center text-body-md text-on-surface-variant">No matches.</p>}
          {pages.length > 0 && (
            <>
              <p className="px-3 py-1 text-label-md text-on-surface-variant">Pages</p>
              <ul role="listbox" aria-label="Pages">{pages.map((item, i) => row(item, i))}</ul>
            </>
          )}
          {content.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-2 text-label-md text-on-surface-variant">Catalog</p>
              <ul role="listbox" aria-label="Catalog results">{content.map((item, i) => row(item, pages.length + i))}</ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
