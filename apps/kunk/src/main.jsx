import React from 'react';
import { createRoot } from 'react-dom/client';
import { installGlobalErrorListeners } from '@kunk/api-client';
import { getKunkPublicConfig } from '@kunk/config';
import { installWebVitalsReporter } from './lib/installWebVitals.js';
import App from './App.jsx';
import '@kunk/theme/brand-fonts.css';
import './styles/themeStyles.css';

const bootstrap = getKunkPublicConfig();
installGlobalErrorListeners({ app: 'kunk', baseUrl: bootstrap.apiUrl });
installWebVitalsReporter({ app: 'kunk', baseUrl: bootstrap.apiUrl });

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
