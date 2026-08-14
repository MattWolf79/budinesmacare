import { Outlet } from 'react-router-dom';

export default function ClientLayout() {
  return (
    <div className="layout-cliente">
      <Outlet />
    </div>
  );
}