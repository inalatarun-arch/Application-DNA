import type { LucideIcon } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';

interface Props {
  title: string;
  description: string;
  icon: LucideIcon;
  planned: string[];
}

/** Placeholder for modules that ship in later steps. */
export default function ModulePage({ title, description, icon: Icon, planned }: Props) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <section className="card flex flex-col items-start gap-4 md:flex-row md:items-start">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-outline-variant text-on-surface-variant">
          <Icon size={20} aria-hidden />
        </span>
        <div>
          <h2 className="text-headline-md">Not built yet</h2>
          <p className="mt-1 text-body-md text-on-surface-variant">This module is scheduled for a later step. It will include:</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-body-md">
            {planned.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
