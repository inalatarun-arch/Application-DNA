import { NavLink } from 'react-router-dom';
import { Network, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NAV_ITEMS, type NavItem } from '@/config/nav';
import { cn } from '@/lib/cn';

interface Props {
  /** Icon-only rail (desktop collapsed, or tablet). */
  rail: boolean;
  isMobile: boolean;
  mobileOpen: boolean;
  canToggleRail: boolean;
  onCloseMobile: () => void;
  onToggleRail: () => void;
}

export default function Sidebar({ rail, isMobile, mobileOpen, canToggleRail, onCloseMobile, onToggleRail }: Props) {
  const showLabels = isMobile || !rail;

  const renderItem = (item: NavItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === '/'}
      title={showLabels ? undefined : item.label}
      aria-label={item.label}
      onClick={isMobile ? onCloseMobile : undefined}
      className={({ isActive }) =>
        cn(
          'relative flex items-center gap-3 rounded px-3 py-2 text-body-md transition-colors',
          isActive
            ? 'bg-surface-container font-semibold text-on-surface'
            : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
          !showLabels && 'justify-center px-0',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span aria-hidden className="absolute inset-y-1 left-0 w-0.5 bg-primary" />}
          <item.icon size={18} aria-hidden className="shrink-0" />
          {showLabels && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );

  return (
    <>
      {isMobile && mobileOpen && <div className="fixed inset-0 z-30 bg-on-surface/40 backdrop-blur-[2px]" onClick={onCloseMobile} aria-hidden />}
      <aside
        id="app-sidebar"
        aria-label="Primary"
        className={cn(
          'z-40 flex shrink-0 flex-col border-r border-outline-variant bg-surface-low transition-[width,transform] duration-200',
          isMobile ? 'fixed inset-y-0 left-0 w-[260px]' : showLabels ? 'w-[260px]' : 'w-16',
          isMobile && !mobileOpen && 'invisible -translate-x-full',
        )}
      >
        <div className={cn('flex h-14 items-center gap-3 border-b border-outline-variant px-4', !showLabels && 'justify-center px-0')}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary text-on-primary">
            <Network size={18} aria-hidden />
          </span>
          {showLabels && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-body-md font-semibold">Enterprise Intelligence Hub</p>
              <p className="truncate text-label-md text-on-surface-variant">Knowledge &amp; delivery</p>
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2" aria-label="Main navigation">
          {NAV_ITEMS.filter((i) => i.group === 'main').map(renderItem)}
          <div className="mt-auto flex flex-col gap-1 border-t border-outline-variant pt-2">
            {NAV_ITEMS.filter((i) => i.group === 'footer').map(renderItem)}
          </div>
        </nav>

        {canToggleRail && !isMobile && (
          <div className="border-t border-outline-variant p-2">
            <button
              type="button"
              onClick={onToggleRail}
              aria-expanded={!rail}
              aria-controls="app-sidebar"
              title={rail ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn(
                'flex w-full items-center gap-3 rounded px-3 py-2 text-body-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface',
                !showLabels && 'justify-center px-0',
              )}
            >
              {rail ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
              {showLabels && <span>Collapse</span>}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
