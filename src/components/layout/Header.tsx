import { Link, useLocation } from 'react-router-dom';
import { Building2, Menu, Moon, Search, Sun } from 'lucide-react';
import { NAV_ITEMS } from '@/config/nav';
import { useTheme } from '@/context/ThemeContext';
import { useWorkspace } from '@/db/settings';
import GeminiStatusPill from './GeminiStatusPill';

interface Props {
  isMobile: boolean;
  onOpenMenu: () => void;
  onOpenSearch: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export default function Header({ isMobile, onOpenMenu, onOpenSearch }: Props) {
  const { theme, toggleTheme } = useTheme();
  const [workspace] = useWorkspace();
  const { pathname } = useLocation();
  const current = NAV_ITEMS.find((i) => (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to)));

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-low px-4 md:px-8">
      {isMobile && (
        <button type="button" className="icon-btn -ml-2" onClick={onOpenMenu} aria-label="Open navigation" aria-controls="app-sidebar">
          <Menu size={20} aria-hidden />
        </button>
      )}

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 truncate text-body-md">
        <span className="hidden text-on-surface-variant sm:inline">Enterprise Intelligence Hub / </span>
        <span className="font-semibold">{current?.label ?? 'Not found'}</span>
      </nav>

      <Link
        to="/settings#workspace"
        title="Active workspace"
        className="hidden max-w-[200px] items-center gap-2 rounded border border-outline-variant bg-surface-lowest px-3 py-1.5 text-body-md hover:bg-surface-container md:inline-flex"
      >
        <Building2 size={16} aria-hidden className="shrink-0 text-on-surface-variant" />
        <span className="truncate">{workspace.name}</span>
      </Link>

      <button
        type="button"
        onClick={onOpenSearch}
        aria-label="Search"
        className="inline-flex items-center gap-2 rounded border border-outline-variant bg-surface-lowest px-3 py-1.5 text-body-md text-on-surface-variant hover:bg-surface-container md:w-56"
      >
        <Search size={16} aria-hidden />
        <span className="hidden flex-1 text-left md:inline">Search…</span>
        <kbd className="hidden rounded border border-outline-variant px-1.5 font-mono text-label-md md:inline">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>

      <GeminiStatusPill />

      <button
        type="button"
        className="icon-btn"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
      >
        {theme === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
      </button>
    </header>
  );
}
