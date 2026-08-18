import {
  Navigate,
  Route,
  Routes,
  useOutletContext
} from 'react-router-dom';


import EmployeeLayout
  from '../layouts/EmployeeLayout';


import EmployeeHomePage
  from '../pages/employee/EmployeeHomePage';


import EmployeeClientsPage
  from '../pages/employee/EmployeeClientsPage';


import EmployeeProductsPage
  from '../pages/employee/EmployeeProductsPage';


import DisponibilidadPage
  from '../pages/employee/DisponibilidadPage';


import {
  rutasEmpleado,
  obtenerRutasEmpleado
} from './rutasAplicacion';


/*
 * ============================================================
 * PÁGINA PRINCIPAL DEL EMPLEADO
 * ============================================================
 */

function PaginaEmpleado({
  activeView,
  ...props
}) {

  const layoutContext =
    useOutletContext() || {};


  return (

    <EmployeeHomePage

      {...props}

      activeView={
        activeView
      }

      onRequestNewBooking={
        layoutContext.onRequestNewBooking
      }

    />

  );

}


/*
 * ============================================================
 * CLIENTES
 * ============================================================
 */

function ClientesEmpleadoPage(
  props
) {

  return (

    <EmployeeClientsPage

      {...props}

      hideHeading

    />

  );

}


/*
 * ============================================================
 * PRODUCTOS
 * ============================================================
 */

function ProductosEmpleadoPage(
  props
) {

  return (

    <EmployeeProductsPage

      {...props}

      onDataChanged={
        () => {}
      }

    />

  );

}


/*
 * ============================================================
 * RUTAS DEL EMPLEADO
 * ============================================================
 *
 * Este router está montado dentro de:
 *
 *   /:companySlug/empleado/*
 *
 * Por eso las rutas declaradas acá son RELATIVAS.
 *
 * Ejemplo:
 *
 *   path="agenda"
 *
 * termina siendo:
 *
 *   /miempresa/empleado/agenda
 *
 * La generación de URLs completas queda a cargo
 * de obtenerRutasEmpleado(), que utilizan los
 * componentes que necesitan navegar desde fuera
 * de este árbol de rutas, como el Sidebar.
 * ============================================================
 */

export default function RutasEmpleado(
  props
) {

  /*
   * ==========================================================
   * URL CANÓNICA DEL PORTAL EMPLEADO
   * ==========================================================
   *
   * Es importante NO utilizar:
   *
   *   <Navigate to="agenda" />
   *
   * en el fallback.
   *
   * "agenda" sería una navegación relativa y podría
   * terminar generando:
   *
   *   /empleado/cualquiercosa/agenda
   *   /empleado/cualquiercosa/agenda/agenda
   *   /empleado/cualquiercosa/agenda/agenda/agenda
   *
   * etc.
   *
   * En cambio, obtenemos la URL completa del portal:
   *
   *   /empresa/empleado
   *
   * y siempre volvemos ahí.
   * ==========================================================
   */

  const employeeRoutes =
    obtenerRutasEmpleado(
      props.companySlug
    );


  const employeeRootPath =
    employeeRoutes.inicio;


  return (

    <Routes>

      <Route
        element={

          <EmployeeLayout
            {...props}
          />

        }
      >

        {/* ==================================================
            INICIO / RESUMEN
            ================================================== */}

        <Route

          index

          element={

            <PaginaEmpleado

              {...props}

              activeView="summary"

            />

          }

        />


        {/* ==================================================
            AGENDA
            ================================================== */}

        <Route

          path={
            rutasEmpleado.agenda
          }

          element={

            <PaginaEmpleado

              {...props}

              activeView="agenda"

            />

          }

        />


        {/* ==================================================
            CLIENTES
            ================================================== */}

        <Route

          path={
            rutasEmpleado.clientes
          }

          element={

            <ClientesEmpleadoPage

              {...props}

            />

          }

        />


        {/* ==================================================
            PRODUCTOS
            ================================================== */}

        <Route

          path={
            rutasEmpleado.productos
          }

          element={

            <ProductosEmpleadoPage

              {...props}

            />

          }

        />


        {/* ==================================================
            DISPONIBILIDAD
            ================================================== */}

        <Route

          path={
            rutasEmpleado.disponibilidad
          }

          element={

            <DisponibilidadPage

              {...props}

            />

          }

        />


        {/* ==================================================
            PERFIL
            ================================================== */}

        <Route

          path={
            rutasEmpleado.perfil
          }

          element={

            <PaginaEmpleado

              {...props}

              activeView="profile"

            />

          }

        />


        {/* ==================================================
            CERRAR ATENCIÓN
            ================================================== */}

        <Route

          path={
            rutasEmpleado.cerrarAtencion
          }

          element={

            <PaginaEmpleado

              {...props}

              activeView="close-attention"

            />

          }

        />


        {/* ==================================================
            NUEVA RESERVA
            ================================================== */}

        <Route

          path={
            rutasEmpleado.nuevaReserva
          }

          element={

            <PaginaEmpleado

              {...props}

              activeView="new-booking"

            />

          }

        />


        {/* ==================================================
            NUEVO PEDIDO
            ================================================== */}

        <Route

          path={
            rutasEmpleado.nuevoPedido
          }

          element={

            <PaginaEmpleado

              {...props}

              activeView="new-booking"

            />

          }

        />


        {/* ==================================================
            FALLBACK
            ==================================================
            
            IMPORTANTE:
            
            Si alguien entra a:
            
              /empresa/empleado/cualquiercosa
            
            NO debemos hacer:
            
              Navigate to="agenda"
            
            porque eso es relativo y produciría:
            
              /empresa/empleado/cualquiercosa/agenda
            
            y luego el mismo fallback volvería a ejecutarse.
            
            En cambio volvemos directamente a:
            
              /empresa/empleado
            
            ================================================== */}

        <Route

          path="*"

          element={

            <Navigate

              to={
                employeeRootPath
              }

              replace

            />

          }

        />

      </Route>

    </Routes>

  );

}