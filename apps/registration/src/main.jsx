import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installGlobalErrorListeners } from '@kunk/api-client';
import { getPublicConfig } from '@kunk/config';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@kunk/theme/brand-fonts.css';
import '@kunk/theme/registration.css';
import './index.css';
import App from './App.jsx';

const bootstrap = getPublicConfig();
installGlobalErrorListeners({ app: 'registration', baseUrl: bootstrap.apiUrl });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
