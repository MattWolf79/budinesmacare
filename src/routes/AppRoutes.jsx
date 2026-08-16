import {
  Navigate,
  Route,
  Routes
} from 'react-router-dom';

import {
  CompanyApp,
  OAuthCallbackRoute,
  LegacyClientRoute,
  LegacyEmployeeRoute
} from '../App';

import PlatformAdmin from '../components/PlatformAdmin';

export default function AppRoutes() {
  return (
    <Routes>
      {/* OAuth / raíz */}
      <Route
        path="/"
        element={
          <OAuthCallbackRoute />
        }
      />

      {/* URLs cortas antiguas */}
      <Route
        path="/sacarturno/*"
        element={
          <LegacyClientRoute />
        }
      />

      <Route
        path="/empleado/*"
        element={
          <LegacyEmployeeRoute />
        }
      />

      {/* Administrador de plataforma */}
      <Route
        path="/admin/*"
        element={
          <PlatformAdmin />
        }
      />

      {/* 
        IMPORTANTE:
        Los portales del tenant tienen su propio
        contexto de React Router.

        Esto es necesario porque RutasCliente,
        RutasEmpleado y RutasAdministrador utilizan
        rutas relativas/absolutas desde su portal.
      */}
      {/* Portal administrador */}
      <Route
        path="/:companySlug/admin/*"
        element={
          <CompanyApp />
        }
      />

      {/* Portal empleado */}
      <Route
        path="/:companySlug/empleado/*"
        element={
          <CompanyApp />
        }
      />

      {/* Portal cliente */}
      <Route
        path="/:companySlug/sacarturno/*"
        element={
          <CompanyApp />
        }
      />

      {/* Entrada directa al tenant */}
      <Route
        path="/:companySlug"
        element={
          <CompanyApp />
        }
      />

      {/* Otras rutas del tenant */}
      <Route
        path="/:companySlug/*"
        element={
          <CompanyApp />
        }
      />

      {/* Ruta desconocida */}
      <Route
        path="*"
        element={
          <Navigate
            to="/"
            replace
          />
        }
      />
    </Routes>
  );
}
