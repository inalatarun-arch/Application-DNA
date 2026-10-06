import { useCallback, useEffect, useRef, useState } from 'react';
import type { Table } from 'dexie';
import { nowIso } from '@/db/db';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** A list row whose text fields are all blank (a row that was added but never filled in). */
function isBlankRow(v: unknown): boolean {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const strings = Object.values(v).filter((x): x is string => typeof x === 'string');
  return strings.length > 0 && strings.every((s) => !s.trim());
}

/**
 * Removes blank list rows from what is persisted. The on-screen draft keeps them so a row
 * you just added doesn't vanish while you're typing into it.
 */
function clean(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(clean).filter((item) => (typeof item === 'string' ? item.trim() !== '' : !isBlankRow(item)));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
  }
  return value;
}

/**
 * Local draft + debounced write-through to Dexie.
 * - `update(patch)` changes the draft immediately and schedules a save.
 * - Only the fields that were changed are written, so another editor (or a background job such as the
 *   transcript pipeline) updating other fields of the same record is never overwritten.
 * - Pending changes are flushed on unmount (e.g. navigating away) and when the page is hidden.
 * - Uses `update`, not `put`, so a record deleted in the meantime is never resurrected.
 * Mount the consumer with `key={record.id}` so switching records resets the draft.
 */
export function useAutosave<T extends { id: string }>(table: Table<T, string>, initial: T, delayMs = 600) {
  const [draft, setDraft] = useState<T>(initial);
  const [state, setState] = useState<SaveState>('idle');
  const latest = useRef<T>(draft);
  const dirty = useRef(false);
  const dirtyKeys = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    if (!dirty.current) return;
    dirty.current = false;
    const keys = [...dirtyKeys.current];
    dirtyKeys.current = new Set();
    if (mounted.current) setState('saving');
    try {
      const source = latest.current as unknown as Record<string, unknown>;
      const changes = clean(Object.fromEntries([...keys.map((k) => [k, source[k]] as const), ['updatedAt', nowIso()] as const]));
      await table.update(latest.current.id, changes as never);
      if (mounted.current) setState(dirty.current ? 'dirty' : 'saved');
    } catch {
      // Keep the changes so the next save retries them.
      keys.forEach((k) => dirtyKeys.current.add(k));
      dirty.current = true;
      if (mounted.current) setState('error');
    }
  }, [table]);

  const update = useCallback(
    (patch: Partial<T>) => {
      const next = { ...latest.current, ...patch };
      latest.current = next;
      setDraft(next);
      for (const k of Object.keys(patch)) dirtyKeys.current.add(k);
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
