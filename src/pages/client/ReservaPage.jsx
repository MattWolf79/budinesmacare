import ClientDashboard from '../../components/ClientDashboard';

export default function ReservaPage(props) {
  return (
    <ClientDashboard
      {...props}
      activeView="reserve"
    />
  );
}