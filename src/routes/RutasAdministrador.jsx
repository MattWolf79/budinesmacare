import {
  Navigate,
  Route,
  Routes,
  useOutletContext
} from 'react-router-dom';


import Dashboard
  from '../pages/Dashboard';

import ClientesPage
  from '../pages/admin/ClientesPage';

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

import CerrarAtencionPage
  from '../pages/admin/CerrarAtencionPage';


import {
  rutasAdministrador
} from './rutasAplicacion';


/*
 * ============================================================
 * CONTENIDO DEL ADMINISTRADOR
 * ============================================================
 *
 * Dashboard funciona como layout.
 *
 * El Outlet de Dashboard recibe este contenido.
 *
 * IMPORTANTE:
 *
 * Las rutas son relativas al portal:
 *
 *   /empresa/admin
 *
 * Por lo tanto:
 *
 *   path="agenda"
 *
 * termina siendo:
 *
 *   /empresa/admin/agenda
 *
 * ============================================================
 */

function RutasAdministradorContenido() {

  const {
    user,
    companySlug,
    companyContext,
    adminProfileSummary,
    refreshKey,
    promotions,
    preciosHabilitados,
    sucursalesHabilitadas,
    bundlesHabilitados,
    packsHabilitados,
    promocionesHabilitadas,
    onDataChanged,
    onBranchesChanged,
    onBookingsChanged,
    onCloseAttentionPageClose,
    onCompanyContextRefresh
  } = useOutletContext();


  /*
   * ==========================================================
   * PROPS COMUNES
   * ==========================================================
   */

  const propsBase = {

    user,

    companySlug,

    companyContext,

    adminProfileSummary

  };


  /*
   * ==========================================================
   * ROUTES
   * ==========================================================
   */

  return (

    <Routes>

      {/* ==================================================
          AGENDA
          ================================================== */}

      <Route

        path={
          rutasAdministrador.pedidos
        }

        element={

          <PedidosPage
            {...propsBase}
            refreshKey={refreshKey}
          />
        }

      />


      {/* ==================================================
          CLIENTES
          ================================================== */}

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


      {/* ==================================================
          SERVICIOS / PRODUCTOS
          ================================================== */}

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


      {/* ==================================================
          SUCURSALES
          ================================================== */}

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


      {/* ==================================================
          PACKS / PROMOS
          ================================================== */}

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


      {/* ==================================================
          CONFIGURACIÓN
          ================================================== */}

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


      {/* ==================================================
          CERRAR ATENCIÓN
          ================================================== */}

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


      {/* ==================================================
          FALLBACK
          ==================================================
          
          Si se llega a una URL desconocida dentro
          del administrador, volvemos a agenda.
          
          Ejemplo:

            /empresa/admin/cualquier-cosa

          termina en:

            /empresa/admin/agenda

          ================================================== */}

      <Route

        path="*"

        element={

          <Navigate

            to="../pedidos"

            replace

          />

        }

      />

    </Routes>

  );

}


/*
 * ============================================================
 * ROUTER PRINCIPAL DEL ADMINISTRADOR
 * ============================================================
 *
 * Dashboard es el layout.
 *
 * Su Outlet recibe RutasAdministradorContenido.
 *
 * ============================================================
 */

export default function RutasAdministrador(
  props
) {

  return (

    <Routes>

      <Route

        element={

          <Dashboard
            {...props}
          />

        }

      >

        <Route

          path="*"

          element={

            <RutasAdministradorContenido />

          }

        />

      </Route>

    </Routes>

  );

}