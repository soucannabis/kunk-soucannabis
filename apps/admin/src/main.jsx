import React from 'react';
import { createRoot } from 'react-dom/client';
import { installGlobalErrorListeners } from '@kunk/api-client';
import { getPublicConfig } from '@kunk/config';
import { installWebVitalsReporter } from './lib/installWebVitals.js';
import App from './App.jsx';
import '@kunk/theme/brand-fonts.css';
import './styles/admin.css';

const bootstrap = getPublicConfig();
installGlobalErrorListeners({ app: 'admin', baseUrl: bootstrap.apiUrl });
installWebVitalsReporter({ app: 'admin', baseUrl: bootstrap.apiUrl });

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
