import ClientLayout from '../layouts/ClientLayout';
import RutasCliente from './RutasCliente';

export default function PortalCliente(props) {
  return (
    <ClientLayout>
      <RutasCliente {...props} />
    </ClientLayout>
  );
}