import { Outlet } from 'react-router-dom';

export default function PublicLayout() {
  return (
    <div className="layout-publico">
      <Outlet />
    </div>
  );
}