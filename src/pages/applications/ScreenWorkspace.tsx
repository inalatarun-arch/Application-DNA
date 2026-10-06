import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppWindow, Trash2 } from 'lucide-react';
import { db } from '@/db/db';
import { deleteScreen } from '@/db/catalog';
import type { Screen } from '@/db/types';
import { useAutosave } from '@/hooks/useAutosave';
import SaveStatus from '@/components/ui/SaveStatus';
import Tabs from '@/components/ui/Tabs';
import ConfirmModal from '@/components/ui/ConfirmModal';
import EmptyState from '@/components/ui/EmptyState';
import ScreenOverviewTab from './ScreenOverviewTab';
import ScreenMediaTab from './ScreenMediaTab';
import BusinessLogicTab from './BusinessLogicTab';
import FunctionalitiesTab from './FunctionalitiesTab';

const TAB_IDS = ['overview', 'ui', 'logic', 'functionalities'] as const;
type TabId = (typeof TAB_IDS)[number];

export default function ScreenWorkspace() {
  const { appId = '', screenId = '' } = useParams();
  const screen = useLiveQuery(() => db.screens.get(screenId).then((s) => s ?? null), [screenId]);

  if (screen === undefined) return <p className="text-body-md text-on-surface-variant">Loading…</p>;
  if (screen === null) {
    return (
      <EmptyState icon={AppWindow} title="Screen not found" description="It may have been deleted.">
        <Link to={`/applications/${appId}`} className="btn btn-secondary">Back to application</Link>
      </EmptyState>
    );
  }
  return <ScreenEditor key={screen.id} screen={screen} />;
}

function ScreenEditor({ screen }: { screen: Screen }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { draft, update, state } = useAutosave(db.screens, screen);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const requested = params.get('tab');
  const tab: TabId = (TAB_IDS as readonly string[]).includes(requested ?? '') ? (requested as TabId) : 'overview';

  const mediaCount = useLiveQuery(() => db.screenMedia.where('screenId').equals(screen.id).count(), [screen.id]);
  const fnCount = useLiveQuery(() => db.functionalities.where('screenId').equals(screen.id).count(), [screen.id]);

  const selectTab = (id: TabId) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', id);
        next.delete('open');
        return next;
      },
      { replace: true },
    );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="screen-name" className="sr-only">Screen name</label>
          <input id="screen-name" className="input text-headline-md" value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="Screen name" />
          <div className="mt-2"><SaveStatus state={state} /></div>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={16} aria-hidden />
          Delete screen
        </button>
      </header>

      <Tabs
        label="Screen documentation"
        active={tab}
        onChange={selectTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'ui', label: 'UI documentation', count: mediaCount },
          { id: 'logic', label: 'Business logic' },
          { id: 'functionalities', label: 'Functionalities', count: fnCount },
        ]}
      />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && <ScreenOverviewTab screen={draft} update={update} />}
        {tab === 'ui' && <ScreenMediaTab screen={draft} />}
        {tab === 'logic' && <BusinessLogicTab screen={draft} update={update} />}
        {tab === 'functionalities' && <FunctionalitiesTab screen={draft} />}
      </div>

      <ConfirmModal
        open={confirmDelete}
        title="Delete screen?"
        confirmLabel="Delete screen"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteScreen(screen.id);
          navigate(`/applications/${screen.applicationId}`);
        }}
        message={<p><strong className="text-on-surface">{draft.name || 'This screen'}</strong> will be removed with its {fnCount ?? 0} functionalities and {mediaCount ?? 0} images. This cannot be undone.</p>}
      />
    </div>
  );
}
