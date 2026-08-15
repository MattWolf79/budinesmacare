import {
  Navigate,
  Route,
  Routes
} from 'react-router-dom';


import AgendaPage
  from '../pages/admin/AgendaPage';

import ClientesPage
  from '../pages/admin/ClientesPage';

import EmpleadosPage
  from '../pages/admin/EmpleadosPage';

import ServiciosPage
  from '../pages/admin/ServiciosPage';

import SucursalesPage
  from '../pages/admin/SucursalesPage';

import PacksPage
  from '../pages/admin/PacksPage';

import ConfiguracionPage
  from '../pages/admin/ConfiguracionPage';

import PedidosPage
  from '../pages/admin/PedidosPage';

import PendientesPage
  from '../pages/admin/PendientesPage';

import CerrarAtencionPage
  from '../pages/admin/CerrarAtencionPage';

import DisponibilidadPage
  from '../pages/admin/DisponibilidadPage';


import {
  rutasAdministrador
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


  const propsBase = {

    user,

    companySlug,

    companyContext,

    adminProfileSummary

  };


  return (

    <Routes>

      {/* =========================
          AGENDA
          ========================= */}

      <Route
        path={
          rutasAdministrador.agenda
        }
        element={

          esModoPedido ? (

            <PedidosPage
              {...propsBase}
              refreshKey={
                refreshKey
              }
            />

          ) : (

            <AgendaPage
              {...propsBase}

              refreshKey={
                refreshKey
              }

              promotions={
                promotions
              }

              onRequestNewBooking={
                onRequestNewBooking
              }
            />

          )

        }
      />


      {/* =========================
          PEDIDOS
          ========================= */}

      <Route
        path={
          rutasAdministrador.pedidos
        }
        element={

          esModoPedido ? (

            <PedidosPage
              {...propsBase}

              refreshKey={
                refreshKey
              }
            />

          ) : (

            <Navigate
              to="../agenda"
              replace
            />

          )

        }
      />


      {/* =========================
          CLIENTES
          ========================= */}

      <Route
        path={
          rutasAdministrador.clientes
        }
        element={

          <ClientesPage
            {...propsBase}

            onDataChanged={
              onDataChanged
            }
          />

        }
      />


      {/* =========================
          EMPLEADOS
          ========================= */}

      <Route
        path={
          rutasAdministrador.empleados
        }
        element={

          <EmpleadosPage
            {...propsBase}

            onDataChanged={
              onDataChanged
            }
          />

        }
      />


      {/* =========================
          SERVICIOS / PRODUCTOS
          ========================= */}

      <Route
        path={
          rutasAdministrador.servicios
        }
        element={

          <ServiciosPage
            {...propsBase}

            onDataChanged={
              onDataChanged
            }
          />

        }
      />


      {/* =========================
          SUCURSALES
          ========================= */}

      <Route
        path={
          rutasAdministrador.sucursales
        }
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
              to="../agenda"
              replace
            />

          )

        }
      />


      {/* =========================
          PACKS / PROMOS
          ========================= */}

      <Route
        path={
          rutasAdministrador.bundles
        }
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
              to="../agenda"
              replace
            />

          )

        }
      />


      {/* =========================
          CONFIGURACIÓN
          ========================= */}

      <Route
        path={
          rutasAdministrador.configuracion
        }
        element={

          <ConfiguracionPage
            {...propsBase}

            onCompanyContextRefresh={
              onCompanyContextRefresh
            }
          />

        }
      />


      {/* =========================
          PENDIENTES
          ========================= */}

      <Route
        path={
          rutasAdministrador.pendientes
        }
        element={

          !esModoPedido ? (

            <PendientesPage
              {...propsBase}

              refreshKey={
                refreshKey
              }

              promotions={
                promotions
              }
            />

          ) : (

            <Navigate
              to="../agenda"
              replace
            />

          )

        }
      />


      {/* =========================
          CERRAR ATENCIÓN
          ========================= */}

      <Route
        path={
          rutasAdministrador.cerrarAtencion
        }
        element={

          preciosHabilitados ? (

            <CerrarAtencionPage
              {...propsBase}

              refreshKey={
                refreshKey
              }

              promotions={
                promotions
              }

              onCloseAttentionPageClose={
                onCloseAttentionPageClose
              }

              onBookingsChanged={
                onBookingsChanged
              }
            />

          ) : (

            <Navigate
              to="../agenda"
              replace
            />

          )

        }
      />


      {/* =========================
          DISPONIBILIDAD
          ========================= */}

      <Route
        path={
          rutasAdministrador.disponibilidad
        }
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
              to="../agenda"
              replace
            />

          )

        }
      />


      {/* =========================
          FALLBACK
          ========================= */}

      <Route
        path="*"
        element={

          <Navigate
            to="agenda"
            replace
          />

        }
      />

    </Routes>

  );
}