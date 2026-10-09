import type { Config } from 'tailwindcss';

// Semantic tokens come from CSS variables (see src/index.css) so the whole UI
// re-themes by toggling the `dark` class on <html>. Alpha modifiers (bg-primary/40) still work.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: token('surface'),
        'surface-lowest': token('surface-lowest'),
        'surface-low': token('surface-low'),
        'surface-container': token('surface-container'),
        'on-surface': token('on-surface'),
        'on-surface-variant': token('on-surface-variant'),
        outline: token('outline'),
        'outline-variant': token('outline-variant'),
        primary: token('primary'),
        'on-primary': token('on-primary'),
        error: token('error'),
        'error-container': token('error-container'),
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        'headline-lg': ['1.875rem', { lineHeight: '2.375rem', letterSpacing: '-0.02em', fontWeight: '600' }],
        'headline-md': ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        'body-lg': ['1rem', { lineHeight: '1.5rem', fontWeight: '400' }],
        'body-md': ['0.875rem', { lineHeight: '1.25rem', fontWeight: '400' }],
        'label-md': ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.01em', fontWeight: '500' }],
        code: ['0.8125rem', { lineHeight: '1.25rem', fontWeight: '400' }],
      },
      borderRadius: { DEFAULT: '0.375rem', lg: '0.625rem' },
      boxShadow: {
        pop: '0 2px 4px rgb(var(--shadow) / var(--shadow-alpha)), 0 16px 40px -12px rgb(var(--shadow) / calc(var(--shadow-alpha) * 2))',
      },
    },
  },
  plugins: [],
} satisfies Config;
