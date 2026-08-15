import { Outlet } from 'react-router-dom';
import RutasAdministrador from '../routes/RutasAdministrador';

export default function AdminLayout({ children }) {
  return (
    <div className="layout-administrador">
      {children}
    </div>
  );
}