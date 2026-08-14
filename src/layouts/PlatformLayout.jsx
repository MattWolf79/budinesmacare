import { Outlet } from 'react-router-dom';

export default function PlatformLayout() {
  return (
    <div className="layout-plataforma">
      <Outlet />
    </div>
  );
}