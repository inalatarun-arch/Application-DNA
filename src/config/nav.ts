import {
  Blocks,
  FileText,
  FlaskConical,
  FolderKanban,
  LayoutDashboard,
  MessageSquareText,
  Network,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  group: 'main' | 'footer';
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', description: 'Overview of the workspace', icon: LayoutDashboard, group: 'main' },
  { to: '/applications', label: 'Applications', description: 'Applications, modules, screens and functionalities', icon: Blocks, group: 'main' },
  { to: '/knowledge-graph', label: 'Knowledge Graph', description: 'Relationship map across the repository', icon: Network, group: 'main' },
  { to: '/projects', label: 'Projects & Delivery', description: 'Projects, transcripts, requirements and approvals', icon: FolderKanban, group: 'main' },
  { to: '/studio', label: 'FRD/TDD Studio', description: 'Generate and edit design documents', icon: FileText, group: 'main' },
  { to: '/testing', label: 'Testing & RTM', description: 'Test cases, traceability and defects', icon: FlaskConical, group: 'main' },
  { to: '/copilot', label: 'Copilot', description: 'Ask questions about your documented systems', icon: MessageSquareText, group: 'main' },
  { to: '/settings', label: 'Settings', description: 'AI configuration and data management', icon: Settings, group: 'footer' },
];
