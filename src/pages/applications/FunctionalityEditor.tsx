import { Trash2 } from 'lucide-react';
import { db } from '@/db/db';
import type { Functionality } from '@/db/types';
import { useAutosave } from '@/hooks/useAutosave';
import SaveStatus from '@/components/ui/SaveStatus';
import TagInput from '@/components/ui/TagInput';
import StringListEditor from '@/components/ui/StringListEditor';
import RelatedPicker, { type RelatedOption } from '@/components/ui/RelatedPicker';
import LinkedComponentsPanel from '@/components/technical/LinkedComponentsPanel';

interface Props {
  functionality: Functionality;
  relatedOptions: RelatedOption[];
  onDelete: () => void;
}

/** Full editor for one functionality. Mount with key={id}; changes auto-save to Dexie. */
export default function FunctionalityEditor({ functionality, relatedOptions, onDelete }: Props) {
  const { draft, update, state } = useAutosave(db.functionalities, functionality);
  const id = (s: string) => `fn-${functionality.id}-${s}`;
  const setException = (key: keyof Functionality['exceptions'], items: string[]) => update({ exceptions: { ...draft.exceptions, [key]: items } });

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SaveStatus state={state} />
        <button type="button" className="btn btn-secondary px-3 py-1" onClick={onDelete}>
          <Trash2 size={14} aria-hidden />
          Delete functionality
        </button>
      </div>

      <div className="grid gap-4">
        <div>
          <label htmlFor={id('name')} className="field-label">Name</label>
          <input id={id('name')} className="input" value={draft.name} onChange={(e) => update({ name: e.target.value })} />
        </div>
        <div>
          <label htmlFor={id('desc')} className="field-label">Description</label>
          <textarea id={id('desc')} className="input min-h-[80px]" value={draft.description} onChange={(e) => update({ description: e.target.value })} />
        </div>
        <div>
          <label htmlFor={id('purpose')} className="field-label">Business purpose</label>
          <textarea id={id('purpose')} className="input min-h-[64px]" value={draft.businessPurpose} onChange={(e) => update({ businessPurpose: e.target.value })} placeholder="The business outcome this functionality protects or enables" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label htmlFor={id('roles')} className="field-label">User roles</label>
          <TagInput id={id('roles')} value={draft.userRoles} onChange={(v) => update({ userRoles: v })} placeholder="Who can perform this — press Enter to add" />
        </div>
        <div className="md:col-span-2">
          <StringListEditor label="Business triggers" items={draft.triggers} onChange={(v) => update({ triggers: v })} addLabel="Add trigger" placeholder="What starts this functionality" />
        </div>
        <StringListEditor label="Inputs" items={draft.inputs} onChange={(v) => update({ inputs: v })} addLabel="Add input" placeholder="Data or documents required" />
        <StringListEditor label="Outputs" items={draft.outputs} onChange={(v) => update({ outputs: v })} addLabel="Add output" placeholder="Records, messages or events produced" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor={id('up')} className="field-label">Upstream systems</label>
          <TagInput id={id('up')} value={draft.upstreamSystems} onChange={(v) => update({ upstreamSystems: v })} placeholder="Systems that feed this" />
        </div>
        <div>
          <label htmlFor={id('down')} className="field-label">Downstream systems</label>
          <TagInput id={id('down')} value={draft.downstreamSystems} onChange={(v) => update({ downstreamSystems: v })} placeholder="Systems that consume the result" />
        </div>
        <div className="md:col-span-2">
          <RelatedPicker label="Related functionalities" options={relatedOptions} value={draft.relatedFunctionalityIds} onChange={(ids) => update({ relatedFunctionalityIds: ids })} />
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-body-md font-semibold">Exception scenarios</h4>
        <div className="grid gap-4 md:grid-cols-2">
          <StringListEditor label="Validation failures" items={draft.exceptions.validation} onChange={(v) => setException('validation', v)} addLabel="Add" />
          <StringListEditor label="Error conditions" items={draft.exceptions.error} onChange={(v) => setException('error', v)} addLabel="Add" />
          <StringListEditor label="Business exceptions" items={draft.exceptions.business} onChange={(v) => setException('business', v)} addLabel="Add" />
          <StringListEditor label="System exceptions" items={draft.exceptions.system} onChange={(v) => setException('system', v)} addLabel="Add" />
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-body-md font-semibold">Linked technical components</h4>
        <LinkedComponentsPanel target="functionality" targetId={functionality.id} applicationId={functionality.applicationId} />
      </div>

      <div>
        <label htmlFor={id('flow')} className="field-label">Process flow (Mermaid)</label>
        <textarea id={id('flow')} className="input min-h-[120px] font-mono text-code" spellCheck={false} value={draft.processFlow} onChange={(e) => update({ processFlow: e.target.value })} placeholder={'flowchart TD\n  A[Request] --> B{Valid?}\n  B -- Yes --> C[Create record]'} />
        <p className="field-hint">Stored as text. Diagram rendering arrives with the Knowledge Graph step.</p>
      </div>
    </div>
  );
}
