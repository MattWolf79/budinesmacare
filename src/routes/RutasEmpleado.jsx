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

import {
  rutasEmpleado
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
  return (
    <Routes>

      <Route
        element={
          <EmployeeLayout
            {...props}
          />
        }
      >

        {/* =========================
            INICIO
            ========================= */}

        <Route
          index
          element={
            <PaginaEmpleado
              {...props}
              activeView="summary"
            />
          }
        />

        {/* =========================
            AGENDA
            ========================= */}

        <Route
          path={rutasEmpleado.agenda}
          element={
            <PaginaEmpleado
              {...props}
              activeView="agenda"
            />
          }
        />

        {/* =========================
            CLIENTES
            ========================= */}

        <Route
          path={rutasEmpleado.clientes}
          element={
            <ClientesEmpleadoPage
              {...props}
            />
          }
        />

        {/* =========================
            PRODUCTOS
            ========================= */}

        <Route
          path={rutasEmpleado.productos}
          element={
            <ProductosEmpleadoPage
              {...props}
            />
          }
        />

        {/* =========================
            DISPONIBILIDAD
            ========================= */}

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

        {/* =========================
            PERFIL
            ========================= */}

        <Route
          path={rutasEmpleado.perfil}
          element={
            <PaginaEmpleado
              {...props}
              activeView="profile"
            />
          }
        />

        {/* =========================
            CERRAR ATENCIÓN
            ========================= */}

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

        {/* =========================
            NUEVA RESERVA
            ========================= */}

        <Route
          path={
            rutasEmpleado.nuevaReserva
          }
          element={
            <PaginaEmpleado
              {...props}
              activeView="summary"
            />
          }
        />

        {/* =========================
            NUEVO PEDIDO
            ========================= */}

        <Route
          path={
            rutasEmpleado.nuevoPedido
          }
          element={
            <PaginaEmpleado
              {...props}
              activeView="summary"
            />
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

      </Route>

    </Routes>
  );
}