import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import ActivityIcon from './ActivityIcon';
import AgendaGrid from './AgendaGrid';
import EmployeeAvailabilityPanel from './EmployeeAvailabilityPanel';

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

const formatAvailabilityTime = (value) => String(value || '').slice(0, 5);

const getTodayWeekday = () => new Date().getDay();

const getProfileInitials = (label) => {
  const parts = String(label || 'Empleado').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return String(parts[0]?.[0] || 'E').toUpperCase();
};

export default function EmployeeDashboard({ user, activeView = 'summary' }) {
  const [employee, setEmployee] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [availability, setAvailability] = useState([]);
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

      const availabilityRequest = user?.isInternal
        ? supabase.rpc('list_internal_employee_availability', { account_id_value: user.id })
        : supabase
            .from('employee_availability')
            .select('*')
            .eq('employee_id', employeeId)
            .order('weekday', { ascending: true })
            .order('start_time', { ascending: true });

      const [employeeResult, bookingsResult, servicesResult, availabilityResult] = await Promise.all([
        supabase.from('employees').select('*').eq('id', employeeId).is('deleted_at', null).maybeSingle(),
        supabase
          .from('bookings')
          .select('*')
          .eq('employee_id', employeeId)
          .in('status', ['confirmed', 'reserved'])
          .order('start_at', { ascending: true }),
        supabase.from('services').select('*'),
        availabilityRequest
      ]);

      if (!active) {
        return;
      }

      setIsLoading(false);

      const firstError = employeeResult.error || bookingsResult.error || servicesResult.error || availabilityResult.error;

      if (firstError) {
        setError(firstError.message || 'No se pudo cargar la información del empleado.');
        return;
      }

      setEmployee(employeeResult.data || null);
      setBookings(bookingsResult.data || []);
      setServices(servicesResult.data || []);
      setAvailability(availabilityResult.data || []);
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

  const activeAvailability = useMemo(
    () => availability.filter((item) => item.active !== false),
    [availability]
  );

  const availabilityDayCount = useMemo(
    () => new Set(activeAvailability.map((item) => Number(item.weekday))).size,
    [activeAvailability]
  );

  const todayAvailabilityLabel = useMemo(() => {
    const todayItems = activeAvailability.filter((item) => Number(item.weekday) === getTodayWeekday());

    if (!todayItems.length) return 'hoy sin horario';

    return todayItems
      .map((item) => `${formatAvailabilityTime(item.start_time)}-${formatAvailabilityTime(item.end_time)}`)
      .join(' · ');
  }, [activeAvailability]);

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
            <article className="employee-summary-card employee-summary-card-availability">
              <span>Disponibilidad</span>
              <strong>{availabilityDayCount}</strong>
              <p>{todayAvailabilityLabel}</p>
            </article>
          </div>

          <div className="employee-layout">
            <article className="employee-card employee-profile-card">
              <span className="employee-profile-avatar" aria-hidden="true">
                {employee?.photo_url || user?.photoUrl ? (
                  <img src={employee?.photo_url || user?.photoUrl} alt="" />
                ) : getProfileInitials(employee?.name || user?.displayName || user?.email)}
              </span>
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

      {activeView === 'availability' && (
        <EmployeeAvailabilityPanel
          user={user}
          mode="employee"
          employeeId={employeeId}
          employeeName={employee?.name || user?.email || 'Empleado'}
          onAvailabilityChanged={refreshEmployeeWorkspace}
        />
      )}
    </section>
  );
}