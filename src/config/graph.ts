import { Blocks, Boxes, ClipboardList, Layers, ListChecks, AppWindow, type LucideIcon } from 'lucide-react';

export type NodeType = 'application' | 'module' | 'screen' | 'functionality' | 'component' | 'requirement';

export interface NodeMeta {
  label: string;
  plural: string;
  /** Categorical color. Shape and glyph carry the same information, so color is never the only cue. */
  color: string;
  icon: LucideIcon;
  group: 'functional' | 'technical';
}

export const NODE_META: Record<NodeType, NodeMeta> = {
  application: { label: 'Application', plural: 'Applications', color: '#2563eb', icon: Blocks, group: 'functional' },
  module: { label: 'Module', plural: 'Modules', color: '#7c3aed', icon: Layers, group: 'functional' },
  screen: { label: 'Screen', plural: 'Screens', color: '#0891b2', icon: AppWindow, group: 'functional' },
  functionality: { label: 'Functionality', plural: 'Functionalities', color: '#16a34a', icon: ListChecks, group: 'functional' },
  component: { label: 'Technical component', plural: 'Technical components', color: '#d97706', icon: Boxes, group: 'technical' },
  requirement: { label: 'Requirement', plural: 'Requirements', color: '#db2777', icon: ClipboardList, group: 'functional' },
};

export const NODE_ORDER: NodeType[] = ['application', 'module', 'screen', 'functionality', 'component', 'requirement'];

export type Preset = 'all' | 'functional' | 'technical' | 'custom';

/** Applications stay in every preset so the clusters keep their anchor. */
export const PRESET_TYPES: Record<Exclude<Preset, 'custom'>, NodeType[]> = {
  all: NODE_ORDER,
  functional: ['application', 'module', 'screen', 'functionality', 'requirement'],
  technical: ['application', 'component'],
};
