import RouteTabs from '@/components/ui/RouteTabs';

const TABS = [
  { to: '/applications', label: 'Applications', end: true },
  { to: '/applications/catalog', label: 'Search catalog', end: false },
];

/** Route-based tab strip shared by the two top-level Applications views. */
export default function ApplicationsTabs() {
  return <RouteTabs tabs={TABS} label="Applications views" />;
}
