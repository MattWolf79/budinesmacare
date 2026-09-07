import ClientDashboard from '../../components/ClientDashboard';

export default function MisTurnosPage(props) {
  return (
    <ClientDashboard
      {...props}
      activeView="mis-pedidos"
    />
  );
}