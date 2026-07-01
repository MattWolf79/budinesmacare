import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import ActivityIcon from './ActivityIcon';
import AgendaGrid from './AgendaGrid';
import EmployeeBlocksPanel from './EmployeeBlocksPanel';

const parseDate = (value) => value instanceof Date ? value : new Date(value);

const formatDate = (value) => parseDate(value).toLocaleDateString([], {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit'
});

const formatTime = (value) => parseDate(value).toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit'
});

const isToday = (value) => {
  const date = parseDate(value);
  const today = new Date();

  return date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
};

const getServiceForBooking = (booking, services) =>
  services.find((service) => String(service.id) === String(booking.service));

const getCustomerLabel = (booking) => (
  booking.customer_name
    ? `${booking.customer_name}${booking.user_email ? ` · ${booking.user_email}` : ''}`
    : booking.user_email || 'Cliente sin email'
);

export default function EmployeeDashboard({ user, activeView = 'summary' }) {
  const [employee, setEmployee] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const employeeId = user?.employeeId;

  useEffect(() => {
    if (!employeeId) {
      return;
    }

    let active = true;

    const loadEmployeeWorkspace = async () => {
      setIsLoading(true);
      setError('');

      const blocksRequest = user?.isInternal
        ? supabase.rpc('list_internal_employee_blocks', { account_id_value: user.id })
        : supabase
            .from('employee_blocks')
            .select('*')
            .eq('employee_id', employeeId)
            .order('start_at', { ascending: true });

      const [employeeResult, bookingsResult, servicesResult, blocksResult] = await Promise.all([
        supabase.from('employees').select('*').eq('id', employeeId).maybeSingle(),
        supabase
          .from('bookings')
          .select('*')
          .eq('employee_id', employeeId)
          .in('status', ['confirmed', 'reserved'])
          .order('start_at', { ascending: true }),
        supabase.from('services').select('*'),
        blocksRequest
      ]);

      if (!active) {
        return;
      }

      setIsLoading(false);

      const firstError = employeeResult.error || bookingsResult.error || servicesResult.error || blocksResult.error;

      if (firstError) {
        setError(firstError.message || 'No se pudo cargar la información del empleado.');
        return;
      }

      setEmployee(employeeResult.data || null);
      setBookings(bookingsResult.data || []);
      setServices(servicesResult.data || []);
      setBlocks(blocksResult.data || []);
    };

    loadEmployeeWorkspace();

    return () => {
      active = false;
    };
  }, [employeeId, refreshKey, user?.id, user?.isInternal]);

  const refreshEmployeeWorkspace = () => {
    setRefreshKey((current) => current + 1);
  };

  const now = useMemo(() => new Date(), []);

  const upcomingBookings = useMemo(
    () => bookings.filter((booking) => parseDate(booking.end_at) >= now),
    [bookings, now]
  );

  const todayBookings = useMemo(
    () => upcomingBookings.filter((booking) => isToday(booking.start_at)),
    [upcomingBookings]
  );

  const upcomingBlocks = useMemo(
    () => blocks.filter((block) => parseDate(block.end_at) >= now),
    [blocks, now]
  );

  if (!employeeId) {
    return (
      <section className="employee-panel employee-panel-empty">
        <p className="admin-kicker">Configuración pendiente</p>
        <h2>Tu acceso no está vinculado a un empleado</h2>
        <p>
          Para ver la agenda laboral, el administrador tiene que vincular este usuario con una ficha de empleado.
        </p>
      </section>
    );
  }

  if (isLoading) {
    return <section className="employee-panel employee-panel-empty">Cargando agenda...</section>;
  }

  if (error) {
    return (
      <section className="employee-panel employee-panel-empty">
        <p className="admin-kicker">No se pudo cargar</p>
        <h2>Revisá permisos del perfil empleado</h2>
        <p>{error}</p>
      </section>
    );
  }

  return (
    <section className="employee-panel">
      {activeView === 'summary' && (
        <>
          <div className="employee-summary-grid">
            <article className="employee-summary-card">
              <span>Hoy</span>
              <strong>{todayBookings.length}</strong>
              <p>turno(s) asignado(s)</p>
            </article>
            <article className="employee-summary-card">
              <span>Próximos</span>
              <strong>{upcomingBookings.length}</strong>
              <p>turno(s) activos</p>
            </article>
            <article className="employee-summary-card">
              <span>Bloqueos</span>
              <strong>{upcomingBlocks.length}</strong>
              <p>no disponibilidad</p>
            </article>
          </div>

          <div className="employee-layout">
            <article className="employee-card employee-profile-card">
              <p className="admin-kicker">Empleado</p>
              <h2>{employee?.name || user?.email || 'Empleado'}</h2>
              <p>{employee?.active === false ? 'Perfil inactivo' : 'Perfil activo'}</p>
              {employee?.code && <span className="employee-code">{employee.code}</span>}
            </article>

            <article className="employee-card">
              <div className="employee-card-header">
                <div>
                  <p className="admin-kicker">Agenda</p>
                  <h2>Próximos turnos</h2>
                </div>
                <span>{upcomingBookings.length}</span>
              </div>

              <div className="employee-list">
                {upcomingBookings.length === 0 ? (
                  <div className="employee-empty-line">No tenés turnos próximos asignados.</div>
                ) : upcomingBookings.map((booking) => {
                  const service = getServiceForBooking(booking, services);

                  return (
                    <div className="employee-booking-row" key={booking.id}>
                      <ActivityIcon service={service} size="small" />
                      <div>
                        <strong>{service?.name || 'Actividad'}</strong>
                        <span>{getCustomerLabel(booking)}</span>
                      </div>
                      <time>{formatDate(booking.start_at)} · {formatTime(booking.start_at)} - {formatTime(booking.end_at)}</time>
                    </div>
                  );
                })}
              </div>
            </article>
          </div>
        </>
      )}

      {activeView === 'agenda' && (
        <article className="employee-card employee-agenda-card">
          <div className="employee-card-header">
            <div>
              <p className="admin-kicker">Reserva</p>
              <h2>Gestionar agenda</h2>
            </div>
            <span>↔</span>
          </div>

          <AgendaGrid
            user={user}
            accessProfile="employee"
            employeeId={employeeId}
            refreshKey={refreshKey}
            onBookingsChanged={refreshEmployeeWorkspace}
          />
        </article>
      )}

      {activeView === 'blocks' && (
        <EmployeeBlocksPanel
          user={user}
          employeeId={employeeId}
          employeeName={employee?.name || user?.email || 'Empleado'}
          initialBlocks={blocks}
          onBlocksChanged={refreshEmployeeWorkspace}
        />
      )}
    </section>
  );
}