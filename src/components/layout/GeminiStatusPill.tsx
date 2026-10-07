import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useApiKey, useGeminiStatus } from '@/hooks/useApiKey';
import { cn } from '@/lib/cn';

export default function GeminiStatusPill() {
  useApiKey(); // re-render on key changes
  const status = useGeminiStatus();

  const view = (() => {
    switch (status.phase) {
      case 'connected':
        return { text: `Connected${status.latencyMs ? ` · ${status.latencyMs} ms` : ''}`, title: `Gemini connected (${status.model ?? 'model'})`, dot: 'filled' as const };
      case 'checking':
        return { text: 'Checking…', title: 'Testing the Gemini connection', dot: 'spinner' as const };
      case 'retrying':
        return { text: status.message ?? 'Retrying…', title: status.message ?? 'Gemini request is being retried', dot: 'spinner' as const };
      case 'quota':
        return { text: 'Quota reached', title: status.message ?? 'Gemini quota reached', dot: 'error' as const };
      case 'error':
        return { text: 'Connection error', title: status.message ?? 'Gemini connection error', dot: 'error' as const };
      case 'untested':
        return { text: 'Key not verified', title: 'A key is saved but has not been tested. Open Settings to test it.', dot: 'hollow' as const };
      default:
        return { text: 'No API key', title: 'Add a Gemini API key in Settings', dot: 'hollow' as const };
    }
  })();
  const isError = view.dot === 'error';

  return (
    <Link
      to="/settings"
      title={view.title}
      aria-label={`Gemini status: ${view.text}. Open AI settings.`}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-label-md transition-colors hover:bg-surface-container',
        isError ? 'border-error text-error' : 'border-outline-variant text-on-surface-variant',
      )}
    >
      {view.dot === 'spinner' ? (
        <Loader2 size={12} className="animate-spin" aria-hidden />
      ) : (
        <span
          aria-hidden
          className={cn(
            'h-2 w-2 rounded-full border',
            view.dot === 'filled' && 'border-on-surface bg-on-surface',
            view.dot === 'hollow' && 'border-outline',
            view.dot === 'error' && 'border-error bg-error',
          )}
        />
      )}
      <span className="font-semibold text-on-surface">Gemini</span>
      <span className={cn('hidden sm:inline', isError && 'text-error')}>{view.text}</span>
    </Link>
  );
}
