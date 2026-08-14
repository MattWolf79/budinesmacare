import { Routes, Route } from 'react-router-dom';

import AgendaPage from '../pages/admin/AgendaPage';
import ClientesPage from '../pages/admin/ClientesPage';
import EmpleadosPage from '../pages/admin/EmpleadosPage';
import ServiciosPage from '../pages/admin/ServiciosPage';
import SucursalesPage from '../pages/admin/SucursalesPage';
import BundlesPage from '../pages/admin/BundlesPage';
import ConfiguracionPage from '../pages/admin/ConfiguracionPage';
import PedidosPage from '../pages/admin/PedidosPage';
import PendientesPage from '../pages/admin/PendientesPage';
import CerrarAtencionPage from '../pages/admin/CerrarAtencionPage';
import DisponibilidadPage from '../pages/admin/DisponibilidadPage';

export default function RutasAdministrador() {
  return (
    <Routes>

      <Route path="/" element={<AgendaPage />} />
      <Route path="/agenda" element={<AgendaPage />} />

      <Route path="/clientes" element={<ClientesPage />} />

      <Route path="/empleados" element={<EmpleadosPage />} />

      <Route path="/servicios" element={<ServiciosPage />} />

      <Route path="/sucursales" element={<SucursalesPage />} />

      <Route path="/bundles" element={<BundlesPage />} />

      <Route path="/configuracion" element={<ConfiguracionPage />} />

      <Route path="/pedidos" element={<PedidosPage />} />

      <Route path="/pendientes" element={<PendientesPage />} />

      <Route
        path="/cerrar-atencion"
        element={<CerrarAtencionPage />}
      />

      <Route
        path="/disponibilidad"
        element={<DisponibilidadPage />}
      />

    </Routes>
  );
}