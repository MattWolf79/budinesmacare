import {
  Navigate,
  Route,
  Routes,
  useOutletContext
} from 'react-router-dom';

import ClientLayout from '../layouts/ClientLayout';

import HomePage from '../pages/client/HomePage';
import ReservaPage from '../pages/client/ReservaPage';
import MisTurnosPage from '../pages/client/MisTurnosPage';
import ProfilePage from '../pages/client/ProfilePage';

function PaginaCliente({
  activeView,
  Page,
  ...props
}) {
  const layoutContext =
    useOutletContext() || {};

  return (
    <Page
      {...props}
      activeView={activeView}
      selectedPromotion={
        layoutContext.selectedPromotion
      }
      onReservePromotion={
        layoutContext.onReservePromotion
      }
      onReserveTurn={
        layoutContext.onReserveTurn
      }
      onRescheduleDone={
        layoutContext.onRescheduleDone
      }
    />
  );
}

export default function RutasCliente(
  props
) {
  /*
   * Este router está montado por App.jsx en:
   *
   * /:companySlug/sacarturno/*
   *
   * Por eso las rutas de abajo son relativas
   * al portal sacarturno.
   */

  return (
    <Routes>
      <Route
        element={
          <ClientLayout
            {...props}
          />
        }
      >
        <Route
          index
          element={
            <PaginaCliente
              {...props}
              activeView="home"
              Page={HomePage}
            />
          }
        />

        <Route
          path="inicio"
          element={
            <PaginaCliente
              {...props}
              activeView="home"
              Page={HomePage}
            />
          }
        />

        <Route
          path="reserva"
          element={
            <PaginaCliente
              {...props}
              activeView="reserve"
              Page={ReservaPage}
            />
          }
        />

        <Route
          path="mis-turnos"
          element={
            <PaginaCliente
              {...props}
              activeView="mis-turnos"
              Page={MisTurnosPage}
            />
          }
        />

        <Route
          path="perfil"
          element={
            <PaginaCliente
              {...props}
              activeView="perfil"
              Page={ProfilePage}
            />
          }
        />

        <Route
          path="*"
          element={
            <Navigate
              to="inicio"
              replace
            />
          }
        />
      </Route>
    </Routes>
  );
}