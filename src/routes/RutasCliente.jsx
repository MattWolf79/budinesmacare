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

import {
  obtenerRutasCliente
} from './rutasAplicacion';

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
  const rutas =
    obtenerRutasCliente(
      props.companySlug
    );

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
          path={rutas.inicio}
          element={
            <PaginaCliente
              {...props}
              activeView="home"
              Page={HomePage}
            />
          }
        />

        <Route
          path={rutas.reserva}
          element={
            <PaginaCliente
              {...props}
              activeView="reserve"
              Page={ReservaPage}
            />
          }
        />

        <Route
          path={rutas.misTurnos}
          element={
            <PaginaCliente
              {...props}
              activeView="mis-turnos"
              Page={MisTurnosPage}
            />
          }
        />

        <Route
          path={rutas.perfil}
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
              to={rutas.inicio}
              replace
            />
          }
        />
      </Route>
    </Routes>
  );
}