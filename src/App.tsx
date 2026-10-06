import { Route, Routes } from 'react-router-dom';
import { FileText } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import DashboardPage from '@/pages/DashboardPage';
import SettingsPage from '@/pages/SettingsPage';
import ModulePage from '@/pages/ModulePage';
import ApplicationsPage from '@/pages/applications/ApplicationsPage';
import CatalogSearchPage from '@/pages/applications/CatalogSearchPage';
import ApplicationWorkspace from '@/pages/applications/ApplicationWorkspace';
import ApplicationOverview from '@/pages/applications/ApplicationOverview';
import ModuleDetailPage from '@/pages/applications/ModuleDetailPage';
import ScreenWorkspace from '@/pages/applications/ScreenWorkspace';
import TechnicalRegistryPage from '@/pages/applications/TechnicalRegistryPage';
import TechnicalComponentPage from '@/pages/applications/TechnicalComponentPage';
import KnowledgeGraphPage from '@/pages/graph/KnowledgeGraphPage';
import ProcessFlowsPage from '@/pages/graph/ProcessFlowsPage';
import ProjectsPage from '@/pages/projects/ProjectsPage';
import ProjectWorkspace from '@/pages/projects/ProjectWorkspace';
import TestingPage from '@/pages/TestingPage';
import CopilotPage from '@/pages/CopilotPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="applications">
          <Route index element={<ApplicationsPage />} />
          <Route path="catalog" element={<CatalogSearchPage />} />
          <Route path=":appId" element={<ApplicationWorkspace />}>
            <Route index element={<ApplicationOverview />} />
            <Route path="modules/:moduleId" element={<ModuleDetailPage />} />
            <Route path="screens/:screenId" element={<ScreenWorkspace />} />
            <Route path="technical" element={<TechnicalRegistryPage />} />
            <Route path="technical/:componentId" element={<TechnicalComponentPage />} />
          </Route>
        </Route>
        <Route path="knowledge-graph">
          <Route index element={<KnowledgeGraphPage />} />
          <Route path="flows" element={<ProcessFlowsPage />} />
        </Route>
        <Route path="projects">
          <Route index element={<ProjectsPage />} />
          <Route path=":projectId" element={<ProjectWorkspace />} />
        </Route>
        <Route
          path="studio"
          element={
            <ModulePage
              title="FRD/TDD Studio"
              description="Generate and edit Functional Requirements and Technical Design Documents."
              icon={FileText}
              planned={['User story generation with acceptance criteria', 'FRD and TDD generation from approved requirements', 'Versioning and approval history']}
            />
          }
        />
        <Route path="testing" element={<TestingPage />} />
        <Route path="copilot" element={<CopilotPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route
          path="*"
          element={
            <div className="card">
              <h1 className="text-headline-md">Page not found</h1>
              <p className="mt-1 text-on-surface-variant">Use the sidebar to pick a module.</p>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}
