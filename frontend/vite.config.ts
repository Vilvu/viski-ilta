/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:7071',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/test/**',
        'src/i18n/locales/**',
        '**/*.module.css',
        // Route wiring only (composition, no branching logic of its own).
        'src/App.tsx',
        // Presentational pages outside this plan's "logic-heavy subset
        // only" scope (see plan Locked Decisions / Out of Scope). Left
        // untested deliberately; excluded here so the threshold measures
        // coverage of the code this plan actually targets rather than
        // failing on pages nothing in Phase 5 was asked to cover.
        'src/pages/EventsPage.tsx',
        'src/pages/EventDetailPage.tsx',
        'src/pages/CatalogWhiskeyDetailPage.tsx',
        'src/pages/RankingPage.tsx',
        'src/pages/NotFoundPage.tsx',
      ],
      thresholds: {
        lines: 60,
        statements: 60,
        functions: 60,
        branches: 55,
      },
    },
  },
});
