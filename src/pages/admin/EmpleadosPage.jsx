import AdminPanel from '../../components/AdminPanel';

export default function EmpleadosPage(props) {
  return (
    <AdminPanel
      {...props}
      view="employees"
    />
  );
}