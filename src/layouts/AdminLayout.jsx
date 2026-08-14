import { Outlet } from 'react-router-dom';

export default function AdminLayout() {
  return (
    <div className="layout-administrador">
      <Outlet />
    </div>
  );
}