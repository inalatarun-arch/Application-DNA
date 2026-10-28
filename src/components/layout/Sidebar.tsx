import { Fragment, useLayoutEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NAV_ITEMS, type NavItem } from '@/config/nav';
import Logo from '@/components/brand/Logo';
import { cn } from '@/lib/cn';
import { EASE, gsap } from '@/lib/motion';

interface Props {
  /** Icon-only rail (desktop collapsed, or tablet). */
  rail: boolean;
  isMobile: boolean;
  mobileOpen: boolean;
  canToggleRail: boolean;
  onCloseMobile: () => void;
  onToggleRail: () => void;
}

const EXPANDED = 264;
const RAIL = 64;

export default function Sidebar({ rail, isMobile, mobileOpen, canToggleRail, onCloseMobile, onToggleRail }: Props) {
  const showLabels = isMobile || !rail;
  const asideRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const { pathname } = useLocation();

  /** Width and label opacity are tweened together so collapsing feels like one movement, not a snap. */
  useLayoutEffect(() => {
    const aside = asideRef.current;
    if (!aside || isMobile) return;
    const labels = aside.querySelectorAll('[data-nav-label]');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = showLabels ? EXPANDED : RAIL;
    if (first.current || reduce) {
      gsap.set(aside, { width: target });
      gsap.set(labels, { autoAlpha: showLabels ? 1 : 0 });
      return;
    }
    const tl = gsap.timeline({ defaults: { ease: EASE.inOut } });
    tl.to(aside, { width: target, duration: 0.34 }, 0);
    tl.to(labels, { autoAlpha: showLabels ? 1 : 0, duration: 0.2, delay: showLabels ? 0.14 : 0 }, 0);
    return () => {
      tl.kill();
    };
  }, [showLabels, isMobile]);

  /** One highlight pill slides to whichever link is active, so the eye follows navigation. */
  useLayoutEffect(() => {
    const nav = navRef.current;
    const pill = pillRef.current;
    if (!nav || !pill) return;
    const place = (animate: boolean) => {
      const active = nav.querySelector<HTMLElement>('a[aria-current="page"]');
      if (!active) {
        gsap.to(pill, { autoAlpha: 0, duration: 0.15 });
        return;
      }
      const props = { y: active.offsetTop, height: active.offsetHeight, autoAlpha: 1 };
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!animate || reduce) gsap.set(pill, props);
      else gsap.to(pill, { ...props, duration: 0.4, ease: EASE.out, overwrite: 'auto' });
    };
    place(!first.current);
    first.current = false;
    const onResize = () => place(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pathname, showLabels, mobileOpen]);

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
          'relative z-10 flex h-9 items-center gap-3 overflow-hidden rounded px-[11px] text-body-md transition-colors',
          isActive ? 'font-semibold text-on-surface' : 'text-on-surface-variant hover:bg-surface-container/70 hover:text-on-surface',
        )
      }
    >
      <item.icon size={18} aria-hidden className="shrink-0" />
      <span data-nav-label className="truncate whitespace-nowrap">{item.label}</span>
    </NavLink>
  );

  const main = NAV_ITEMS.filter((i) => i.group === 'main');
  const footer = NAV_ITEMS.filter((i) => i.group === 'footer');

  return (
    <>
      {isMobile && mobileOpen && <div className="fixed inset-0 z-30 bg-on-surface/40 backdrop-blur-[2px]" onClick={onCloseMobile} aria-hidden />}
      <aside
        ref={asideRef}
        id="app-sidebar"
        aria-label="Primary"
        style={isMobile ? undefined : { width: showLabels ? EXPANDED : RAIL }}
        className={cn(
          'z-40 flex shrink-0 flex-col overflow-hidden border-r border-outline-variant bg-surface-low',
          isMobile && 'fixed inset-y-0 left-0 w-[264px] transition-transform duration-300 ease-out',
          isMobile && !mobileOpen && 'invisible -translate-x-full',
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-3 px-[18px]">
          <Logo size={28} />
          <div data-nav-label className="min-w-0 whitespace-nowrap leading-tight">
            <p className="font-display text-[1.0625rem] font-medium tracking-tight">Application DNA</p>
          </div>
        </div>

        <nav ref={navRef} className="relative flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2 pb-2 pt-1" aria-label="Main navigation">
          <div
            ref={pillRef}
            aria-hidden
            className="pointer-events-none absolute inset-x-2 top-0 z-0 rounded bg-surface-container opacity-0 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-primary"
          />
          {main.map((item, i) => (
            <Fragment key={item.to}>
              {item.section &&
                (i === 0 ? null : (
                  <div className="mx-3 mb-1 mt-3 h-px bg-outline-variant" aria-hidden={showLabels ? undefined : true} />
                ))}
              {item.section && (
                <p data-nav-label className={cn('eyebrow px-3 pb-1 pt-1 text-[0.6875rem]', !showLabels && 'invisible h-0 p-0')}>
                  {item.section}
                </p>
              )}
              {renderItem(item)}
            </Fragment>
          ))}
          <div className="mt-auto flex flex-col gap-0.5 border-t border-outline-variant pt-2">{footer.map(renderItem)}</div>
        </nav>

        {canToggleRail && !isMobile && (
          <div className="border-t border-outline-variant p-2">
            <button
              type="button"
              onClick={onToggleRail}
              aria-expanded={!rail}
              aria-controls="app-sidebar"
              title={rail ? 'Expand sidebar' : 'Collapse sidebar'}
              className="flex h-9 w-full items-center gap-3 overflow-hidden rounded px-[11px] text-body-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              {rail ? <PanelLeftOpen size={18} aria-hidden className="shrink-0" /> : <PanelLeftClose size={18} aria-hidden className="shrink-0" />}
              <span data-nav-label className="whitespace-nowrap">Collapse</span>
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
