import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles, X } from 'lucide-react';
import { describeError, isGeminiError } from '@/services/geminiService';
import { askCopilot } from '@/services/copilotAI';
import { useApiKey } from '@/hooks/useApiKey';
import { useDialogIn } from '@/lib/motion';
import { plural } from '@/lib/plural';

const CHIPS = [
  'Show all integrations connected to Supplier Creation',
  'Which functionalities touch the AP_SUPPLIERS table?',
  'Generate a regression test checklist for Module X',
];

export default function CopilotPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const apiKey = useApiKey();
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const opener = useRef<Element | null>(null);

  useDialogIn(panelRef, open, 'right');

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  const ask = async (q = query) => {
    if (!q.trim() || !apiKey) return;
    setQuery(q);
    setLoading(true);
    setAnswer('');
    try {
      const r = await askCopilot(q);
      setAnswer(`${r.answer}\n\n(${plural(r.sources, 'repository record')} used)`);
    } catch (e) {
      if (!(isGeminiError(e) && e.code === 'ABORTED')) setAnswer(describeError(e));
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <aside ref={panelRef} role="dialog" aria-label="Copilot" className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-[460px] flex-col border-l border-outline-variant bg-surface shadow-pop">
      <header className="flex items-center gap-3 border-b border-outline-variant px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded bg-primary text-on-primary">
          <Sparkles size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Copilot</p>
          <p className="text-label-md font-normal text-on-surface-variant">Answers grounded in your documented applications</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close Copilot">
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <p className="eyebrow mb-2">Try asking</p>
        <div className="flex flex-col gap-1.5">
          {CHIPS.map((c) => (
            <button key={c} className="rounded border border-outline-variant bg-surface-lowest px-3 py-2 text-left text-body-md transition-colors hover:border-primary/50 hover:bg-primary-container disabled:opacity-50" disabled={!apiKey} onClick={() => void ask(c)}>
              {c}
            </button>
          ))}
        </div>
        {!apiKey && <p className="mt-4 rounded border border-warning/40 bg-warning-container p-3 text-body-md text-warning">Add an AI API key in Settings to ask questions.</p>}
        {loading && (
          <div role="status" className="mt-6 flex items-center gap-2 text-body-md text-on-surface-variant">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            Searching your repository and asking the AI…
          </div>
        )}
        {answer && <div className="mt-6 whitespace-pre-wrap rounded-lg border border-outline-variant bg-surface-lowest p-4 text-body-md">{answer}</div>}
      </div>
      <form
        className="border-t border-outline-variant p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <div className="flex gap-2">
          <input ref={inputRef} className="input flex-1" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask about your application knowledge…" aria-label="Question" />
          <button className="btn btn-primary" aria-label="Send" disabled={loading || !query.trim() || !apiKey}>
            <Send size={16} aria-hidden />
          </button>
        </div>
      </form>
    </aside>
  );
}
