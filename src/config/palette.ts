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
  panel: '#f6f8f8',
  panelAlt: '#f0f3f3',
  border: '#cbd4d4',
  text: '#141c1c',
  muted: '#424f4f',
  accent: '#0f766e',
  onAccent: '#ffffff',
  edge: '#6e7c7c',
};

export const DARK: Palette = {
  bg: '#111919',
  panel: '#0d1414',
  panelAlt: '#1b2626',
  border: '#2c3c3c',
  text: '#e2eded',
  muted: '#94a8a8',
  accent: '#2dd4bf',
  onAccent: '#042826',
  edge: '#648484',
};

export const paletteFor = (theme: 'light' | 'dark'): Palette => (theme === 'dark' ? DARK : LIGHT);
