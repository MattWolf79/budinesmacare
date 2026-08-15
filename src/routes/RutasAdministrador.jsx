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

export default function RutasAdministrador(props) {
  return (
    <Routes>

      <Route path="/" element={<AgendaPage />} />
      <Route path="/agenda" element={<AgendaPage />} />

      <Route
  path="/clientes"
  element={<ClientesPage {...props} />}
/>

      <Route path="/empleados" element={<EmpleadosPage {...props} />} />

      <Route path="/servicios" element={<ServiciosPage {...props}/>} />

      <Route path="/sucursales" element={<SucursalesPage {...props} />} />

      <Route path="/bundles" element={<BundlesPage {...props} />} />

      <Route path="/configuracion" element={<ConfiguracionPage  {...props}/>} />

      <Route path="/pedidos" element={<PedidosPage {...props}/>} />

      <Route path="/pendientes" element={<PendientesPage {...props} />} />

      <Route
        path="/cerrar-atencion"
        element={<CerrarAtencionPage {...props}/>}
      />

      <Route
        path="/disponibilidad"
        element={<DisponibilidadPage {...props} />}
      />

    </Routes>
  );
}