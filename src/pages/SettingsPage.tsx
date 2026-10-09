import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import AiConfiguration from './settings/AiConfiguration';
import WorkspaceCard from './settings/WorkspaceCard';
import DataManagement from './settings/DataManagement';
import SampleDataCard from './settings/SampleDataCard';

export default function SettingsPage() {
  const { hash } = useLocation();

  // HashRouter owns the URL hash, so deep-link to the workspace card manually.
  useEffect(() => {
    if (hash === '#workspace') document.getElementById('workspace')?.scrollIntoView();
  }, [hash]);

  return (
    <>
      <PageHeader title="Settings" description="Configure the AI connection, your workspace and local data." />
      <div className="space-y-6">
        <AiConfiguration />
        <WorkspaceCard />
        <SampleDataCard />
        <DataManagement />
      </div>
    </>
  );
}
