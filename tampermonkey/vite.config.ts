import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.user.ts',
      userscript: {
        name: 'Pluggable Crawler',
        namespace: 'npm/tampermonkey-crawler',
        match: ['*://*/*'], // Subtle indicator on every page
        grant: ['GM_xmlhttpRequest'],
        connect: ['localhost', '127.0.0.1', 'licdn.com'],
      },
      build: {
        fileName: 'tampermonkey.user.js',
      }
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});
