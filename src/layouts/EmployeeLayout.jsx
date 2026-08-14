import { Outlet } from 'react-router-dom';

export default function EmployeeLayout() {
  return (
    <div className="layout-empleado">
      <Outlet />
    </div>
  );
}