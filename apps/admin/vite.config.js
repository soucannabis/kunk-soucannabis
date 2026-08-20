import { defineConfig } from 'vite';
import { viteHealthPlugin } from '../../packages/vite-health-plugin.js';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

export default defineConfig({
  plugins: [react(), viteHealthPlugin()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
    alias: {
      react: path.resolve(root, 'node_modules/react'),
      'react-dom': path.resolve(root, 'node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(root, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(root, 'node_modules/react/jsx-dev-runtime.js'),
      '@kunk/config': path.resolve(root, 'packages/config/src/index.js'),
      '@kunk/api-client': path.resolve(root, 'packages/api-client/src/index.js'),
      '@kunk/auth-session': path.resolve(root, 'packages/auth-session/src/index.jsx'),
      '@kunk/theme/brand-fonts.css': path.resolve(root, 'packages/theme/src/brand-fonts.css'),
      '@kunk/theme': path.resolve(root, 'packages/theme/src/index.js'),
      'react-markdown': path.resolve(root, 'node_modules/react-markdown'),
      'remark-gfm': path.resolve(root, 'node_modules/remark-gfm'),
      'web-vitals': path.resolve(root, 'node_modules/web-vitals'),
    },
  },
  server: {
    fs: {
      allow: [root],
    },
    host: true,
    port: 4256,
    watch: {
      usePolling: true,
      interval: 1000,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8056',
        changeOrigin: true,
        headers: { 'X-Kunk-App': 'admin' },
      },
    },
  },
});
