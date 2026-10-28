import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AiKeyBanner } from '@/components/AiKeyBanner';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useEnter } from '@/lib/motion';
import Sidebar from './Sidebar';
import Header from './Header';
import CommandPalette from './CommandPalette';
import CopilotPanel from './CopilotPanel';
import GlobalAssistantButton from './GlobalAssistantButton';

export default function AppShell() {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1279px)');
  const [collapsed, setCollapsed] = usePersistentState('eih.sidebar.collapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);
  // Animate between top-level sections, not between tabs inside one record, so working views stay still.
  useEnter(pageRef, pathname.split('/')[1] ?? '');

  // Tablet always shows the icon rail; desktop honours the saved preference.
  const rail = isTablet || collapsed;

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      } else if (key === 'j') {
        e.preventDefault();
        setCopilotOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden bg-surface text-on-surface">
      <a href="#main" className="sr-only z-[70] rounded bg-primary px-3 py-2 text-on-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <Sidebar
        rail={rail}
        isMobile={isMobile}
        mobileOpen={mobileOpen}
        canToggleRail={!isTablet}
        onCloseMobile={() => setMobileOpen(false)}
        onToggleRail={() => setCollapsed((c) => !c)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header isMobile={isMobile} onOpenMenu={() => setMobileOpen(true)} onOpenSearch={() => setSearchOpen(true)} />
        <main id="main" className="flex-1 overflow-y-auto">
          <div ref={pageRef} className="mx-auto w-full max-w-[1280px] p-4 pb-24 md:p-8 md:pb-24">
            <AiKeyBanner onOpenSettings={() => navigate('/settings')} />
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <GlobalAssistantButton onClick={() => setCopilotOpen(true)} hidden={copilotOpen} />
      <CopilotPanel open={copilotOpen} onClose={() => setCopilotOpen(false)} />
    </div>
  );
}
