import {
  Navigate,
  Route,
  Routes,
  useOutletContext
} from 'react-router-dom';


import ClientLayout
  from '../layouts/ClientLayout';


import HomePage
  from '../pages/client/HomePage';


import ReservaPage
  from '../pages/client/ReservaPage';


import MisTurnosPage
  from '../pages/client/MisTurnosPage';


import ProfilePage
  from '../pages/client/ProfilePage';

import {
  obtenerRutasCliente
} from './rutasAplicacion';


/*
 * ============================================================
 * PÁGINA CLIENTE
 * ============================================================
 *
 * Las páginas hijas reciben el contexto generado
 * por ClientLayout mediante Outlet.
 */

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

      activeView={
        activeView
      }

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


/*
 * ============================================================
 * ROUTER DEL CLIENTE
 * ============================================================
 *
 * Este componente recibe:
 *
 * /empresa/sacarturno/*
 *
 * desde la navegación del perfil cliente.
 *
 * Las rutas declaradas aquí son RELATIVAS.
 *
 * NO poner:
 *
 * /empresa/sacarturno/reserva
 *
 * dentro de path.
 *
 * Solamente:
 *
 * reserva
 *
 */

export default function RutasCliente(
  props
) {

  return (

    <Routes>

      <Route

        element={

          <ClientLayout
            {...props}
          />

        }

      >

        {/* ==================================================
            INICIO
            ================================================== */}

        <Route

          index

          element={

            <PaginaCliente

              {...props}

              activeView="home"

              Page={
                HomePage
              }

            />

          }

        />


        {/* ==================================================
            INICIO EXPLÍCITO
            ================================================== */}

        <Route

          path="inicio"

          element={

            <PaginaCliente

              {...props}

              activeView="home"

              Page={
                HomePage
              }

            />

          }

        />


        {/* ==================================================
            RESERVA / PEDIDO
            ================================================== */}

        <Route

          path="reserva"

          element={

            <PaginaCliente

              {...props}

              activeView="reserve"

              Page={
                ReservaPage
              }

            />

          }

        />


        {/* ==================================================
            MIS TURNOS / PEDIDOS
            ================================================== */}

        <Route

          path="mis-turnos"

          element={

            <PaginaCliente

              {...props}

              activeView="mis-turnos"

              Page={
                MisTurnosPage
              }

            />

          }

        />


        {/* ==================================================
            PERFIL
            ================================================== */}

        <Route

          path="perfil"

          element={

            <PaginaCliente

              {...props}

              activeView="perfil"

              Page={
                ProfilePage
              }

            />

          }

        />


        {/* ==================================================
            FALLBACK
            ==================================================
            
            Cualquier ruta desconocida dentro de
            /empresa/sacarturno/* vuelve a Inicio.

            replace evita llenar el historial.
        */}

        <Route
          path="*"
          element={
            <Navigate
              to={
                obtenerRutasCliente(
                  props.companySlug
                ).inicio
              }
              replace
            />
          }
        />

      </Route>

    </Routes>

  );

}
