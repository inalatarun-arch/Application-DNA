import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useApiKey, useGeminiStatus } from '@/hooks/useApiKey';
import { cn } from '@/lib/cn';
import { PROVIDERS } from '@/config/providers';
import { getActiveProvider } from '@/services/apiKeyStore';

type Tone = 'ok' | 'busy' | 'warn' | 'error';

/**
 * AI connection indicator. While everything works it is a quiet dot; it grows a label only when
 * the connection needs attention (no key, untested, quota, error), so it never competes with page content.
 */
export default function GeminiStatusPill() {
  useApiKey(); // re-render on key or provider changes
  const name = PROVIDERS[getActiveProvider()].short;
  const status = useGeminiStatus();

  const view = ((): { text: string; title: string; tone: Tone } => {
    switch (status.phase) {
      case 'connected':
        return { text: 'Connected', title: `${name} connected (${status.model ?? 'model'})${status.latencyMs ? `, ${status.latencyMs} ms` : ''}`, tone: 'ok' };
      case 'checking':
        return { text: 'Checking…', title: `Testing the ${name} connection`, tone: 'busy' };
      case 'retrying':
        return { text: status.message ?? 'Retrying…', title: status.message ?? `${name} request is being retried`, tone: 'busy' };
      case 'quota':
        return { text: 'Quota reached', title: status.message ?? `${name} quota reached`, tone: 'error' };
      case 'error':
        return { text: 'Connection error', title: status.message ?? `${name} connection error`, tone: 'error' };
      case 'untested':
        return { text: 'Key not verified', title: 'A key is saved but has not been tested. Open Settings to test it.', tone: 'warn' };
      default:
        return { text: 'No API key', title: `Add a ${name} API key in Settings`, tone: 'warn' };
    }
  })();

  const quiet = view.tone === 'ok';

  return (
    <Link
      to="/settings"
      title={view.title}
      aria-label={`${name} status: ${view.text}. Open AI settings.`}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-full border text-label-md transition-colors',
        quiet ? 'w-9 justify-center border-transparent hover:bg-surface-container' : 'px-3',
        view.tone === 'warn' && 'border-warning/40 bg-warning-container text-warning',
        view.tone === 'error' && 'border-error/40 bg-error-container text-error',
        view.tone === 'busy' && 'border-outline-variant text-on-surface-variant',
      )}
    >
      {view.tone === 'busy' ? (
        <Loader2 size={12} className="animate-spin" aria-hidden />
      ) : (
        <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', view.tone === 'ok' && 'bg-success', view.tone === 'warn' && 'bg-warning', view.tone === 'error' && 'bg-error')} />
      )}
      {!quiet && (
        <span className="hidden whitespace-nowrap font-semibold sm:inline">
          {name} · {view.text}
        </span>
      )}
    </Link>
  );
}
