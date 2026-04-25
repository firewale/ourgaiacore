import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'API server unavailable' }));
          });
        },
      },
    },
  },
});
