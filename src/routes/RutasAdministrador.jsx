import {
  Navigate,
  Route,
  Routes
} from 'react-router-dom';

import AgendaPage from '../pages/admin/AgendaPage';
import ClientesPage from '../pages/admin/ClientesPage';
import EmpleadosPage from '../pages/admin/EmpleadosPage';
import ServiciosPage from '../pages/admin/ServiciosPage';
import SucursalesPage from '../pages/admin/SucursalesPage';
import PacksPage from '../pages/admin/PacksPage';
import ConfiguracionPage from '../pages/admin/ConfiguracionPage';
import PedidosPage from '../pages/admin/PedidosPage';
import PendientesPage from '../pages/admin/PendientesPage';
import CerrarAtencionPage from '../pages/admin/CerrarAtencionPage';
import DisponibilidadPage from '../pages/admin/DisponibilidadPage';

import {
  obtenerRutasAdministrador
} from './rutasAplicacion';

export default function RutasAdministrador({
  companySlug,
  user,
  companyContext,
  adminProfileSummary,
  refreshKey,
  promotions,
  esModoPedido,
  preciosHabilitados,
  sucursalesHabilitadas,
  bundlesHabilitados,
  packsHabilitados,
  promocionesHabilitadas,
  onRequestNewBooking,
  onDataChanged,
  onBranchesChanged,
  onBookingsChanged,
  onCloseAttentionPageClose,
  onCompanyContextRefresh
}) {
  const rutas =
    obtenerRutasAdministrador(companySlug);

  const propsBase = {
    user,
    companySlug,
    companyContext,
    adminProfileSummary
  };

  return (
    <Routes>
      <Route
        path={rutas.agenda}
        element={
          esModoPedido ? (
            <PedidosPage
              {...propsBase}
              refreshKey={refreshKey}
            />
          ) : (
            <AgendaPage
              {...propsBase}
              refreshKey={refreshKey}
              promotions={promotions}
              onRequestNewBooking={
                onRequestNewBooking
              }
            />
          )
        }
      />

      <Route
        path={rutas.pedidos}
        element={
          esModoPedido ? (
            <PedidosPage
              {...propsBase}
              refreshKey={refreshKey}
            />
          ) : (
            <Navigate
              to={rutas.agenda}
              replace
            />
          )
        }
      />

      <Route
        path={rutas.clientes}
        element={
          <ClientesPage
            {...propsBase}
            onDataChanged={onDataChanged}
          />
        }
      />

      <Route
        path={rutas.empleados}
        element={
          <EmpleadosPage
            {...propsBase}
            onDataChanged={onDataChanged}
          />
        }
      />

      <Route
        path={rutas.servicios}
        element={
          <ServiciosPage
            {...propsBase}
            onDataChanged={onDataChanged}
          />
        }
      />

      <Route
        path={rutas.sucursales}
        element={
          sucursalesHabilitadas ? (
            <SucursalesPage
              {...propsBase}
              onDataChanged={
                onBranchesChanged
              }
            />
          ) : (
            <Navigate
              to={rutas.agenda}
              replace
            />
          )
        }
      />

      <Route
        path={rutas.bundles}
        element={
          bundlesHabilitados ? (
            <PacksPage
              {...propsBase}
              onDataChanged={
                onBranchesChanged
              }
              packsHabilitados={
                packsHabilitados
              }
              promosHabilitadas={
                promocionesHabilitadas
              }
            />
          ) : (
            <Navigate
              to={rutas.agenda}
              replace
            />
          )
        }
      />

      <Route
        path={rutas.configuracion}
        element={
          <ConfiguracionPage
            {...propsBase}
            onCompanyContextRefresh={
              onCompanyContextRefresh
            }
          />
        }
      />

      <Route
        path={rutas.pendientes}
        element={
          !esModoPedido ? (
            <PendientesPage
              {...propsBase}
              refreshKey={refreshKey}
              promotions={promotions}
            />
          ) : (
            <Navigate
              to={rutas.agenda}
              replace
            />
          )
        }
      />

      <Route
        path={rutas.cerrarAtencion}
        element={
          preciosHabilitados ? (
            <CerrarAtencionPage
              {...propsBase}
              refreshKey={refreshKey}
              promotions={promotions}
              onCloseAttentionPageClose={
                onCloseAttentionPageClose
              }
              onBookingsChanged={
                onBookingsChanged
              }
            />
          ) : (
            <Navigate
              to={rutas.agenda}
              replace
            />
          )
        }
      />

      <Route
        path={rutas.disponibilidad}
        element={
          !esModoPedido ? (
            <DisponibilidadPage
              {...propsBase}
              mode="admin"
              onAvailabilityChanged={
                onDataChanged
              }
            />
          ) : (
            <Navigate
              to={rutas.agenda}
              replace
            />
          )
        }
      />

      <Route
        path="*"
        element={
          <Navigate
            to={rutas.agenda}
            replace
          />
        }
      />
    </Routes>
  );
}