import AdminLayout from '../layouts/AdminLayout';
import RutasAdministrador from './RutasAdministrador';

export default function PortalAdministrador(props) {
  return (
    <AdminLayout>
      <RutasAdministrador {...props} />
    </AdminLayout>
  );
}