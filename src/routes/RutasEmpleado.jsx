import { Routes, Route } from 'react-router-dom';

import EmployeeHomePage from '../pages/employee/EmployeeHomePage';
import EmployeeClientsPage from '../pages/employee/EmployeeClientsPage';
import EmployeeProductsPage from '../pages/employee/EmployeeProductsPage';
import DisponibilidadPage from '../pages/employee/DisponibilidadPage';
import PerfilEmpleadoPage from '../pages/employee/PerfilEmpleadoPage';

export default function RutasEmpleado(props) {
  return (
    <Routes>
      <Route path="/" element={<EmployeeHomePage {...props} />} />
      <Route path="/agenda" element={<EmployeeHomePage {...props} />} />
      <Route path="/clientes" element={<EmployeeClientsPage {...props} />} />
      <Route path="/productos" element={<EmployeeProductsPage {...props} />} />
      <Route path="/disponibilidad" element={<DisponibilidadPage {...props} />} />
      <Route path="/perfil" element={<PerfilEmpleadoPage {...props} />} />
    </Routes>
  );
}