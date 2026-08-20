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
      '@kunk/theme/registration.css': path.resolve(root, 'packages/theme/src/registration.css'),
      '@kunk/theme/brand-fonts.css': path.resolve(root, 'packages/theme/src/brand-fonts.css'),
      '@kunk/theme': path.resolve(root, 'packages/theme/src/index.js'),
      '@kunk/ui': path.resolve(root, 'packages/ui/src/index.jsx'),
      '@kunk/forms': path.resolve(root, 'packages/forms/src/index.jsx'),
    },
  },
  server: {
    host: true,
    port: 4255,
    watch: {
      usePolling: true,
      interval: 1000,
    },
    proxy: {
      // Same-origin /api so associate_session cookie persists across reloads
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8056',
        changeOrigin: true,
      },
    },
  },
});
