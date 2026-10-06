import type { AppModule, Application } from '@/db/types';

interface Props {
  applications: Application[];
  modules: AppModule[];
  applicationIds: string[];
  moduleIds: string[];
  onChange: (applicationIds: string[], moduleIds: string[]) => void;
}

/** Choose impacted applications and, within them, specific modules. No module chosen means the whole application. */
export default function ScopePicker({ applications, modules, applicationIds, moduleIds, onChange }: Props) {
  const apps = [...applications].sort((a, b) => a.name.localeCompare(b.name));
  const toggleApp = (id: string, on: boolean) => {
    if (on) onChange([...applicationIds, id], moduleIds);
    else onChange(applicationIds.filter((x) => x !== id), moduleIds.filter((m) => modules.find((mod) => mod.id === m)?.applicationId !== id));
  };
  const toggleModule = (mod: AppModule, on: boolean) => {
    if (on) onChange(applicationIds.includes(mod.applicationId) ? applicationIds : [...applicationIds, mod.applicationId], [...moduleIds, mod.id]);
    else onChange(applicationIds, moduleIds.filter((m) => m !== mod.id));
  };

  if (apps.length === 0) {
    return <p className="rounded border border-dashed border-outline-variant px-3 py-3 text-body-md text-on-surface-variant">No applications documented yet. Add applications first, or load the sample data in Settings.</p>;
  }

  return (
    <ul className="max-h-72 divide-y divide-outline-variant overflow-y-auto rounded border border-outline-variant">
      {apps.map((app) => {
        const checked = applicationIds.includes(app.id);
        const mods = modules.filter((m) => m.applicationId === app.id).sort((a, b) => a.name.localeCompare(b.name));
        return (
          <li key={app.id} className="px-3 py-2">
            <label className="flex items-center gap-2 text-body-md font-medium">
              <input type="checkbox" checked={checked} onChange={(e) => toggleApp(app.id, e.target.checked)} />
              {app.name}
              <span className="text-label-md font-normal text-on-surface-variant">{app.domain}</span>
            </label>
            {checked && mods.length > 0 && (
              <div className="ml-6 mt-1">
                <p className="text-label-md font-normal text-on-surface-variant">Limit to modules (leave empty for the whole application)</p>
                <ul className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {mods.map((m) => (
                    <li key={m.id}>
                      <label className="flex items-center gap-2 text-body-md">
                        <input type="checkbox" checked={moduleIds.includes(m.id)} onChange={(e) => toggleModule(m, e.target.checked)} />
                        {m.name}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
