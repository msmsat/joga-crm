import { preview } from 'vite';

const port = Number(process.env.MINIAPP_E2E_PREVIEW_PORT ?? '4174');
await preview({
  preview: { host: '127.0.0.1', port, strictPort: true, open: false },
  plugins: [{
    name: 'isolated-browser-fixture-shutdown',
    configurePreviewServer(server) {
      server.middlewares.use('/__test/shutdown', (request, response, next) => {
        if (request.method !== 'POST') return next();
        response.end('ok');
        setTimeout(() => {
          server.httpServer.close(() => process.exit(0));
          server.httpServer.closeIdleConnections?.();
        }, 50);
      });
    },
  }],
});
