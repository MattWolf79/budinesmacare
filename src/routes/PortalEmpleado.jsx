import EmployeeLayout from '../layouts/EmployeeLayout';
import RutasEmpleado from './RutasEmpleado';

export default function PortalEmpleado(props) {
  return (
    <EmployeeLayout>
      <RutasEmpleado {...props} />
    </EmployeeLayout>
  );
}