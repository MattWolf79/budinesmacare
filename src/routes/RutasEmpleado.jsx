import {
  Navigate,
  Route,
  Routes,
  useOutletContext
} from 'react-router-dom';

import EmployeeLayout from '../layouts/EmployeeLayout';

import EmployeeHomePage from '../pages/employee/EmployeeHomePage';
import EmployeeClientsPage from '../pages/employee/EmployeeClientsPage';
import EmployeeProductsPage from '../pages/employee/EmployeeProductsPage';
import DisponibilidadPage from '../pages/employee/DisponibilidadPage';
import PerfilEmpleadoPage from '../pages/employee/PerfilEmpleadoPage';

import {
  obtenerRutasEmpleado
} from './rutasAplicacion';

function PaginaEmpleado({
  activeView,
  ...props
}) {
  const layoutContext =
    useOutletContext() || {};

  return (
    <EmployeeHomePage
      {...props}
      activeView={activeView}
      onRequestNewBooking={
        layoutContext.onRequestNewBooking
      }
    />
  );
}

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

function ProductosEmpleadoPage(
  props
) {
  return (
    <EmployeeProductsPage
      {...props}
      onDataChanged={() => {}}
    />
  );
}

export default function RutasEmpleado(
  props
) {
  const rutas =
    obtenerRutasEmpleado(
      props.companySlug
    );

  return (
    <Routes>
      <Route
        element={
          <EmployeeLayout
            {...props}
          />
        }
      >
        <Route
          path={rutas.inicio}
          element={
            <PaginaEmpleado
              {...props}
              activeView="summary"
            />
          }
        />

        <Route
          path={rutas.agenda}
          element={
            <PaginaEmpleado
              {...props}
              activeView="agenda"
            />
          }
        />

        <Route
          path={rutas.clientes}
          element={
            <ClientesEmpleadoPage
              {...props}
            />
          }
        />

        <Route
          path={rutas.productos}
          element={
            <ProductosEmpleadoPage
              {...props}
            />
          }
        />

        <Route
          path={rutas.disponibilidad}
          element={
            <DisponibilidadPage
              {...props}
            />
          }
        />

        <Route
          path={rutas.perfil}
          element={
            <PaginaEmpleado
              {...props}
              activeView="profile"
            />
          }
        />

        <Route
          path={rutas.cerrarAtencion}
          element={
            <PaginaEmpleado
              {...props}
              activeView="close-attention"
            />
          }
        />

        <Route
          path={rutas.nuevaReserva}
          element={
            <PaginaEmpleado
              {...props}
              activeView="summary"
            />
          }
        />

        <Route
          path={rutas.nuevoPedido}
          element={
            <PaginaEmpleado
              {...props}
              activeView="summary"
            />
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
      </Route>
    </Routes>
  );
}