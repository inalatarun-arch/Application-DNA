import { useState } from 'react';
import { MessageSquareText, Sparkles } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import CopilotPanel from '@/components/layout/CopilotPanel';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export default function CopilotPage() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <PageHeader title="Copilot" description="Ask questions in plain language, grounded in your local application knowledge repository." />
      <section className="card">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container text-primary">
            <MessageSquareText size={20} aria-hidden />
          </span>
          <div>
            <h2 className="text-headline-md">Copilot</h2>
            <p className="text-body-md text-on-surface-variant">Open it from any screen with {isMac ? '⌘J' : 'Ctrl J'}, or here.</p>
          </div>
          <button type="button" className="btn btn-primary ml-auto" onClick={() => setOpen(true)}>
            <Sparkles size={16} aria-hidden /> Open Copilot
          </button>
        </div>
      </section>
      <CopilotPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
