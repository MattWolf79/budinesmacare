import AdminPanel from '../../components/AdminPanel';

export default function EmployeesPage(props) {
  return (
    <AdminPanel
      {...props}
      view="employees"
    />
  );
}