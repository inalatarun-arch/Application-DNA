import { useEffect, useState } from 'react';
import { useWorkspace } from '@/db/settings';

export default function WorkspaceCard() {
  const [workspace, saveWorkspace] = useWorkspace();
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description);

  useEffect(() => {
    setName(workspace.name);
    setDescription(workspace.description);
  }, [workspace.name, workspace.description]);

  const dirty = name.trim() !== workspace.name || description !== workspace.description;

  return (
    <section id="workspace" className="card scroll-mt-4" aria-labelledby="workspace-title">
      <h2 id="workspace-title" className="text-headline-md">Workspace</h2>
      <p className="mt-1 text-body-md text-on-surface-variant">The name shown in the header. Data is stored locally in this browser.</p>
      <div className="mt-4 grid max-w-xl gap-4">
        <div>
          <label htmlFor="ws-name" className="field-label">Workspace name</label>
          <input id="ws-name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ws-desc" className="field-label">Description</label>
          <textarea id="ws-desc" className="input min-h-[72px]" value={description} maxLength={240} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!dirty || !name.trim()}
            onClick={() => void saveWorkspace({ name: name.trim(), description })}
          >
            Save workspace
          </button>
        </div>
      </div>
    </section>
  );
}
