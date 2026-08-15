import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import './index.css';

import AppRoutes from './routes/AppRoutes.jsx';
import AppAlertHost from './components/AppAlertHost.jsx';

createRoot(
  document.getElementById('root')
).render(
  <StrictMode>
    <BrowserRouter>
      <AppRoutes />
      <AppAlertHost />
    </BrowserRouter>
  </StrictMode>
);