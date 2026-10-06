import { useCallback, useEffect, useRef, useState } from 'react';
import type { Table } from 'dexie';
import { nowIso } from '@/db/db';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface FieldRow {
  field: string;
  description: string;
}
const isFieldRow = (v: unknown): v is FieldRow =>
  typeof v === 'object' && v !== null && typeof (v as FieldRow).field === 'string' && typeof (v as FieldRow).description === 'string';

/**
 * Removes blank list rows from what is persisted. The on-screen draft keeps them so a row
 * you just added doesn't vanish while you're typing into it.
 */
function clean(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(clean)
      .filter((item) => (typeof item === 'string' ? item.trim() !== '' : !(isFieldRow(item) && !item.field.trim() && !item.description.trim())));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
  }
  return value;
}

/**
 * Local draft + debounced write-through to Dexie.
 * - `update(patch)` changes the draft immediately and schedules a save.
 * - Pending changes are flushed on unmount (e.g. navigating away) and when the page is hidden.
 * - Uses `update`, not `put`, so a record deleted in the meantime is never resurrected.
 * Mount the consumer with `key={record.id}` so switching records resets the draft.
 */
export function useAutosave<T extends { id: string }>(table: Table<T, string>, initial: T, delayMs = 600) {
  const [draft, setDraft] = useState<T>(initial);
  const [state, setState] = useState<SaveState>('idle');
  const latest = useRef<T>(draft);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    if (!dirty.current) return;
    dirty.current = false;
    if (mounted.current) setState('saving');
    try {
      const record = clean({ ...latest.current, updatedAt: nowIso() }) as T;
      await table.update(record.id, record as never);
      if (mounted.current) setState(dirty.current ? 'dirty' : 'saved');
    } catch {
      if (mounted.current) setState('error');
    }
  }, [table]);

  const update = useCallback(
    (patch: Partial<T>) => {
      const next = { ...latest.current, ...patch };
      latest.current = next;
      setDraft(next);
      dirty.current = true;
      setState('dirty');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delayMs);
    },
    [flush, delayMs],
  );

  useEffect(() => {
    mounted.current = true;
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    return () => {
      mounted.current = false;
      window.removeEventListener('pagehide', onHide);
      void flush();
    };
  }, [flush]);

  return { draft, update, state, flush };
}
