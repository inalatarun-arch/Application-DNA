import { Route, Routes } from 'react-router-dom';
import { FileText, FlaskConical, FolderKanban, MessageSquareText, Network } from 'lucide-react';
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
          </Route>
        </Route>
        <Route
          path="knowledge-graph"
          element={
            <ModulePage
              title="Knowledge Graph"
              description="An interactive map of how applications, functionality, requirements and technical components relate."
              icon={Network}
              planned={['Zoom, filter, search and navigate relationships', 'Mermaid process-flow diagrams (flowchart, BPMN, swimlane, dependency map)']}
            />
          }
        />
        <Route
          path="projects"
          element={
            <ModulePage
              title="Projects & Delivery"
              description="Manage initiatives from transcript to approved requirements."
              icon={FolderKanban}
              planned={['Projects linked to impacted applications', 'Transcript upload with AI meeting notes and requirement extraction', 'AI impact assessment and approval workflow']}
            />
          }
        />
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
        <Route
          path="testing"
          element={
            <ModulePage
              title="Testing & RTM"
              description="Test cases, end-to-end traceability and defect management."
              icon={FlaskConical}
              planned={['Unit, SIT, regression and UAT test case generation', 'Requirements Traceability Matrix', 'Defect logging with AI-assisted analysis']}
            />
          }
        />
        <Route
          path="copilot"
          element={
            <ModulePage
              title="Copilot"
              description="Ask questions in plain language, answered strictly from your documented repository."
              icon={MessageSquareText}
              planned={['Natural-language queries across applications, requirements and tests', 'Answers grounded in repository context only']}
            />
          }
        />
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
