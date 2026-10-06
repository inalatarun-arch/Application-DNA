import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import type { Screen } from '@/db/types';
import Section from '@/components/ui/Section';
import TagInput from '@/components/ui/TagInput';
import RelatedPicker from '@/components/ui/RelatedPicker';

interface Props {
  screen: Screen;
  update: (patch: Partial<Screen>) => void;
}

export default function ScreenOverviewTab({ screen, update }: Props) {
  const modules = useLiveQuery(() => db.modules.where('applicationId').equals(screen.applicationId).toArray(), [screen.applicationId]);
  const screens = useLiveQuery(() => db.screens.where('applicationId').equals(screen.applicationId).toArray(), [screen.applicationId]);
  const moduleName = new Map((modules ?? []).map((m) => [m.id, m.name]));

  return (
    <div className="space-y-6">
      <Section title="Screen details" description="What this screen is for and who is accountable for it.">
        <div>
          <label htmlFor="s-purpose" className="field-label">Purpose</label>
          <textarea id="s-purpose" className="input min-h-[72px]" value={screen.purpose} onChange={(e) => update({ purpose: e.target.value })} placeholder="Why users open this screen" />
        </div>
        <div>
          <label htmlFor="s-desc" className="field-label">Description</label>
          <textarea id="s-desc" className="input min-h-[96px]" value={screen.description} onChange={(e) => update({ description: e.target.value })} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="s-bp" className="field-label">Business process</label>
            <input id="s-bp" className="input" value={screen.businessProcess} onChange={(e) => update({ businessProcess: e.target.value })} placeholder="e.g. Procure to Pay" />
          </div>
          <div>
            <label htmlFor="s-module" className="field-label">Module</label>
            <select id="s-module" className="input" value={screen.moduleId ?? ''} onChange={(e) => {
                const moduleId = e.target.value || undefined;
                update({ moduleId });
                // Keep the screen's functionalities in the same module.
                void db.functionalities.where('screenId').equals(screen.id).modify({ moduleId });
              }}>
              <option value="">No module</option>
              {(modules ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="s-bo" className="field-label">Business owner</label>
            <input id="s-bo" className="input" value={screen.businessOwner} onChange={(e) => update({ businessOwner: e.target.value })} />
          </div>
          <div>
            <label htmlFor="s-fo" className="field-label">Functional owner</label>
            <input id="s-fo" className="input" value={screen.functionalOwner} onChange={(e) => update({ functionalOwner: e.target.value })} />
          </div>
        </div>
        <div>
          <label htmlFor="s-nav" className="field-label">Navigation path</label>
          <input id="s-nav" className="input" value={screen.navigationPath} onChange={(e) => update({ navigationPath: e.target.value })} placeholder="e.g. Payables > Suppliers > Maintain Suppliers" />
          <p className="field-hint">The menu route a user follows to reach this screen.</p>
        </div>
      </Section>

      <Section title="Dependencies" description="Systems and screens this screen depends on or feeds.">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="s-up" className="field-label">Upstream systems</label>
            <TagInput id="s-up" value={screen.upstreamSystems} onChange={(v) => update({ upstreamSystems: v })} placeholder="Systems that send data in" />
          </div>
          <div>
            <label htmlFor="s-down" className="field-label">Downstream systems</label>
            <TagInput id="s-down" value={screen.downstreamSystems} onChange={(v) => update({ downstreamSystems: v })} placeholder="Systems that receive data" />
          </div>
        </div>
        <RelatedPicker
          label="Related screens"
          value={screen.relatedScreenIds}
          onChange={(ids) => update({ relatedScreenIds: ids })}
          options={(screens ?? []).filter((s) => s.id !== screen.id).map((s) => ({ id: s.id, label: s.name, sublabel: s.moduleId ? moduleName.get(s.moduleId) : undefined }))}
        />
      </Section>
    </div>
  );
}
