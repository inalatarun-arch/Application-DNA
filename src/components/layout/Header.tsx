import { Link } from 'react-router-dom';
import { Building2, Menu, Moon, Search, Sun } from 'lucide-react';
import Logo from '@/components/brand/Logo';
import { useTheme } from '@/context/ThemeContext';
import { useWorkspace } from '@/db/settings';
import GeminiStatusPill from './GeminiStatusPill';

interface Props {
  isMobile: boolean;
  onOpenMenu: () => void;
  onOpenSearch: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Slim top bar: workspace on the left, search in the middle, status and theme on the right. Page titles live in each page, not here. */
export default function Header({ isMobile, onOpenMenu, onOpenSearch }: Props) {
  const { theme, toggleTheme } = useTheme();
  const [workspace] = useWorkspace();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-outline-variant bg-surface/85 px-4 backdrop-blur-md md:px-8">
      {isMobile && (
        <>
          <button type="button" className="icon-btn -ml-2" onClick={onOpenMenu} aria-label="Open navigation" aria-controls="app-sidebar">
            <Menu size={20} aria-hidden />
          </button>
          <Logo size={24} />
        </>
      )}

      <Link
        to="/settings#workspace"
        title="Active workspace"
        className="hidden max-w-[220px] items-center gap-2 rounded px-2 py-1.5 text-body-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface md:inline-flex"
      >
        <Building2 size={16} aria-hidden className="shrink-0" />
        <span className="truncate">{workspace.name}</span>
      </Link>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onOpenSearch}
        aria-label="Search"
        aria-keyshortcuts="Control+K Meta+K"
        className="inline-flex items-center gap-2 rounded border border-outline-variant bg-surface-lowest px-3 py-1.5 text-body-md text-on-surface-variant transition-colors hover:border-outline md:w-64"
      >
        <Search size={16} aria-hidden />
        <span className="hidden flex-1 text-left md:inline">Search everything</span>
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
