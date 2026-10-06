/**
 * Explicit colors for canvas and SVG drawing. Canvas/SVG can't read the CSS variables used by the rest of the UI
 * (and exported images must be self-contained), so both themes are spelled out here.
 */
export interface Palette {
  bg: string;
  panel: string;
  panelAlt: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  edge: string;
}

export const LIGHT: Palette = {
  bg: '#ffffff',
  panel: '#f8f9fb',
  panelAlt: '#f3f4f6',
  border: '#c6c6cd',
  text: '#191c1e',
  muted: '#45464c',
  accent: '#111827',
  onAccent: '#ffffff',
  edge: '#76777d',
};

export const DARK: Palette = {
  bg: '#131c31',
  panel: '#0f172a',
  panelAlt: '#1e293b',
  border: '#334155',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#f1f5f9',
  onAccent: '#0f172a',
  edge: '#64748b',
};

export const paletteFor = (theme: 'light' | 'dark'): Palette => (theme === 'dark' ? DARK : LIGHT);
