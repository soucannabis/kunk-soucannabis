/**
 * Vite plugin: GET /health → { ok: true } (dev + preview).
 */
export function viteHealthPlugin() {
  function mount(middlewares) {
    middlewares.use((req, res, next) => {
      const pathOnly = String(req.url || '').split('?')[0];
      if (pathOnly !== '/health') {
        next();
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({ ok: true }));
    });
  }

  return {
    name: 'kunk-vite-health',
    configureServer(server) {
      mount(server.middlewares);
    },
    configurePreviewServer(server) {
      mount(server.middlewares);
    },
  };
}
