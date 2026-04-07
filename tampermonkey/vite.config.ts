import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.user.ts',
      userscript: {
        name: 'Pluggable Crawler',
        namespace: 'npm/tampermonkey-crawler',
        match: ['*://*.linkedin.com/*', '*://*.carmax.com/*', '*://*.carvana.com/*'],
        noframes: true,
        grant: ['GM_xmlhttpRequest', 'GM_setValue', 'GM_getValue'],
        connect: ['localhost', '127.0.0.1', 'licdn.com', 'carmax.com', 'carvana.com', 'carvana.io'],
      },
      build: {
        fileName: 'tampermonkey.user.js',
      },
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
