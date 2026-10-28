import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Content-Security-Policy for the production build, added as a <meta> tag because GitHub Pages cannot send headers.
 * - script-src 'self': only the app's own bundled files may run, so injected script cannot read the unlocked API key.
 * - connect-src https: : the AI provider, an OpenAI-compatible base URL and the optional proxy are chosen by the user
 *   at run time, so any https host (and localhost for local models) must stay reachable.
 * Not applied in `npm run dev`, where Vite needs inline scripts for hot reload.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:* http://[::1]:*",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const cspPlugin = (): Plugin => ({
  name: 'eih-csp',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
  ],
});

// `base: './'` + HashRouter lets the same build run from a domain root,
// a GitHub Pages sub-path, or any static host with no rewrite rules.
export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: { sourcemap: true },
});
