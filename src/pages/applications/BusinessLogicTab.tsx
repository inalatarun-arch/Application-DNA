import type { Screen } from '@/db/types';
import Section from '@/components/ui/Section';
import FieldListEditor from '@/components/ui/FieldListEditor';
import StringListEditor from '@/components/ui/StringListEditor';

interface Props {
  screen: Screen;
  update: (patch: Partial<Screen>) => void;
}

export default function BusinessLogicTab({ screen, update }: Props) {
  return (
    <div className="space-y-6">
      <Section title="Field descriptions" description="Every field on the screen and how it behaves.">
        <FieldListEditor rows={screen.fieldDescriptions} onChange={(rows) => update({ fieldDescriptions: rows })} />
      </Section>

      <Section title="Validation rules" description="Checks the screen enforces before data is accepted.">
        <StringListEditor
          label="Validation rules"
          items={screen.validationRules}
          onChange={(items) => update({ validationRules: items })}
          addLabel="Add rule"
          placeholder="e.g. Tax ID must match the country format"
        />
      </Section>

      <Section title="Workflow and approvals" description="The order of steps, and who approves what.">
        <StringListEditor
          label="Workflow steps"
          items={screen.workflowSteps}
          onChange={(items) => update({ workflowSteps: items })}
          addLabel="Add step"
          placeholder="Describe the step"
          ordered
        />
        <div>
          <label htmlFor="s-approval" className="field-label">Approval logic</label>
          <textarea id="s-approval" className="input min-h-[88px]" value={screen.approvalLogic} onChange={(e) => update({ approvalLogic: e.target.value })} placeholder="Who approves, thresholds, escalation, delegation" />
        </div>
      </Section>

      <Section title="Exception handling" description="What happens when something goes wrong and how users recover.">
        <StringListEditor
          label="Exception scenarios"
          items={screen.exceptionHandling}
          onChange={(items) => update({ exceptionHandling: items })}
          addLabel="Add scenario"
          placeholder="e.g. Duplicate supplier: show the existing record and block creation"
          multiline
        />
      </Section>
    </div>
  );
}
