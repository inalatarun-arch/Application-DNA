import RouteTabs from '@/components/ui/RouteTabs';

const TABS = [
  { to: '/knowledge-graph', label: 'Graph', end: true },
  { to: '/knowledge-graph/flows', label: 'Process flows', end: false },
];

export default function KnowledgeTabs() {
  return <RouteTabs tabs={TABS} label="Knowledge graph views" />;
}
