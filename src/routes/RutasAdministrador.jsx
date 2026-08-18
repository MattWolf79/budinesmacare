import {
  Navigate,
  Route,
  Routes,
  useOutletContext
} from 'react-router-dom';

import Dashboard
  from '../pages/Dashboard';

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
  obtenerRutasAdministrador,
  rutasAdministrador
} from './rutasAplicacion';


function RutasAdministradorContenido() {

  const {
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
  } = useOutletContext();

  const rutasCompletas =
    obtenerRutasAdministrador(
      companySlug
    );

  const propsBase = {

    user,

    companySlug,

    companyContext,

    adminProfileSummary

  };


  /*
   * IMPORTANTE
   *
   * Las páginas viven dentro del layout
   * administrativo y reciben sus datos
   * mediante Outlet context.
   *
   * Por eso las rutas de <Route> deben ser
   * RELATIVAS.
   *
   * Las URLs completas son responsabilidad
   * de obtenerRutasAdministrador(), que usan
   * Navbar y AdminSidebar para los NavLink.
   *
   * Ejemplo:
   *
   * AdminSidebar:
   * /empresa/admin/clientes
   *
   * RutasAdministrador:
   * clientes
   *
   * Esto permite que React Router resuelva
   * correctamente la página.
   */


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

              to={
                rutasCompletas.agenda
              }

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

              to={
                rutasCompletas.agenda
              }

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

              to={
                rutasCompletas.agenda
              }

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

              to={
                rutasCompletas.agenda
              }

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

              to={
                rutasCompletas.agenda
              }

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

              to={
                rutasCompletas.agenda
              }

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

              to={
                rutasCompletas.agenda
              }

            replace

          />

        }

      />

    </Routes>

  );

}

/*
 * Punto de entrada del portal administrador.
 * Dashboard actúa como layout y las páginas reciben el estado compartido
 * mediante Outlet, no por una relación Dashboard -> router.
 */
export default function RutasAdministrador(
  props
) {
  return (
    <Routes>
      <Route
        element={<Dashboard {...props} />}
      >
        <Route
          path="*"
          element={<RutasAdministradorContenido />}
        />
      </Route>
    </Routes>
  );
}
