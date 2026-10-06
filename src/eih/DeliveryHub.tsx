import { useEffect, useState } from 'react';
import { Sparkles, ListChecks, FileText, KeyRound } from 'lucide-react';
import { ProjectBar } from '../components/ProjectBar';
import { AiKeyBanner } from '../components/AiKeyBanner';
import { AiSettingsPanel } from '../components/AiSettingsPanel';
import { ImpactAssessment } from '../pages/ImpactAssessment';
import { RequirementsCatalog } from '../pages/RequirementsCatalog';
import { DocumentStudio } from '../pages/DocumentStudio';
import { tryAutoUnlock } from '../lib/vault';
import { h1, muted } from '../components/ui';

type Tab = 'impact' | 'catalog' | 'studio' | 'settings';
const LS_PROJECT = 'eih.currentProjectId';

const TABS: { id: Tab; label: string; icon: typeof Sparkles }[] = [
  { id: 'impact', label: 'Impact Assessment', icon: Sparkles },
  { id: 'catalog', label: 'Requirements Catalog', icon: ListChecks },
  { id: 'studio', label: 'Document Studio (FRD / TDD)', icon: FileText },
  { id: 'settings', label: 'AI Settings', icon: KeyRound },
];

/**
 * Steps 6 & 7 in one self-contained component. Mount it on a single route/sidebar item:
 *   <Route path="/delivery" element={<DeliveryHub />} />
 * It brings its own project picker, tabs and AI key banner.
 */
export function DeliveryHub() {
  const [tab, setTab] = useState<Tab>('impact');
  const [projectId, setProjectId] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(LS_PROJECT);
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    void tryAutoUnlock();
  }, []);

  const select = (id: number | null) => {
    setProjectId(id);
    try {
      if (id) localStorage.setItem(LS_PROJECT, String(id));
      else localStorage.removeItem(LS_PROJECT);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 bg-[#F8F9FB] p-4 font-[Inter,system-ui,sans-serif] md:p-8">
      <div>
        <h1 className={h1}>Delivery Intelligence</h1>
        <p className={muted}>AI impact assessment, requirements catalog, FRD / TDD generation and approvals.</p>
      </div>

      <ProjectBar projectId={projectId} onSelect={select} />

      <nav className="flex flex-wrap gap-1 border-b border-[#D1D5DB]" aria-label="Delivery sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2 text-[14px] ${tab === id ? 'border-[#111827] font-semibold text-[#111827]' : 'border-transparent font-medium text-[#6B7280] hover:text-[#111827]'}`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </nav>

      {tab !== 'settings' && <AiKeyBanner onOpenSettings={() => setTab('settings')} />}

      {tab === 'impact' && <ImpactAssessment projectId={projectId} />}
      {tab === 'catalog' && <RequirementsCatalog projectId={projectId} />}
      {tab === 'studio' && <DocumentStudio projectId={projectId} />}
      {tab === 'settings' && <AiSettingsPanel />}
    </div>
  );
}

export default DeliveryHub;
