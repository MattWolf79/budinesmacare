import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import ActivityIcon from './ActivityIcon';
import AgendaGrid from './AgendaGrid';
import EmployeeAvailabilityPanel from './EmployeeAvailabilityPanel';
import { formatDisplayDate } from '../utils/dateFormat';

const parseDate = (value) => value instanceof Date ? value : new Date(value);

const formatDate = (value) => formatDisplayDate(value, {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});

const formatTime = (value) => parseDate(value).toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit'
});

const formatMoney = (value) => new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0
}).format(Number(value) || 0);

const isToday = (value) => {
  const date = parseDate(value);
  const today = new Date();

  return date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
};

const getServiceForBooking = (booking, services) => {
  const service = services.find((item) => String(item.id) === String(booking.service));

  if (service) return service;
  if (!booking.service && booking.booking_description) {
    return {
      id: null,
      name: booking.booking_description,
      icon: '✨',
      color: '#3fc9d5'
    };
  }

  return null;
};

const getCustomerLabel = (booking) => (
  booking.customer_name
    ? `${booking.customer_name}${booking.user_email ? ` · ${booking.user_email}` : ''}`
    : booking.user_email || 'Cliente sin email'
);

const getBookingLabelLines = (booking, service) => {
  if (!booking.service && booking.booking_description) {
    return String(booking.booking_description)
      .split(' · ')
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return [service?.name || 'Servicio'];
};

const formatAvailabilityTime = (value) => String(value || '').slice(0, 5);

const getTodayWeekday = () => new Date().getDay();

const isClosedBooking = (booking) =>
  ['completed', 'closed'].includes(String(booking?.status || '').trim().toLowerCase());

const startOfWeek = (date) => {
  const weekStart = new Date(date);
  const day = weekStart.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() + diff);
  return weekStart;
};

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const isDateInRange = (value, start, end) => {
  const date = parseDate(value);
  return date >= start && date < end;
};

const buildClosedBookingAmounts = (employeeBookings, closureItems = [], closures = []) => {
  const closedBookingIds = new Set(employeeBookings.filter(isClosedBooking).map((booking) => String(booking.id)));
  const closuresById = new Map((closures || []).map((closure) => [String(closure.id), closure]));
  const subtotalByClosure = (closureItems || []).reduce((map, item) => {
    const closureId = String(item.closure_id || '');
    map.set(closureId, (map.get(closureId) || 0) + Number(item.subtotal || 0));
    return map;
  }, new Map());

  return (closureItems || []).reduce((map, item) => {
    if (!closedBookingIds.has(String(item.booking_id))) return map;

    const closure = closuresById.get(String(item.closure_id || ''));
    const itemSubtotal = Number(item.subtotal || 0);
    const closureSubtotal = subtotalByClosure.get(String(item.closure_id || '')) || 0;
    const closureTotalDiscount = Number(closure?.total_discount_total || 0);
    const proportionalDiscount = closureSubtotal > 0 ? (itemSubtotal / closureSubtotal) * closureTotalDiscount : 0;
    map[item.booking_id] = Math.max(0, itemSubtotal - proportionalDiscount);
    return map;
  }, {});
};

export default function EmployeeDashboard({ user, activeView = 'summary' }) {
  const [employee, setEmployee] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [closedBookingAmounts, setClosedBookingAmounts] = useState({});
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

      const loadClosedBookingAmounts = async (employeeBookings) => {
        const closedBookingIds = employeeBookings.filter(isClosedBooking).map((booking) => booking.id);
        if (!closedBookingIds.length) {
          setClosedBookingAmounts({});
          return;
        }

        const { data: ownClosureItems, error: closureItemsError } = await supabase
          .from('booking_closure_items')
          .select('booking_id, closure_id, subtotal')
          .in('booking_id', closedBookingIds);

        if (closureItemsError || !ownClosureItems?.length) {
          setClosedBookingAmounts({});
          return;
        }

        const closureIds = [...new Set(ownClosureItems.map((item) => item.closure_id).filter(Boolean))];
        const [closureItemsResult, closuresResult] = await Promise.all([
          supabase
            .from('booking_closure_items')
            .select('booking_id, closure_id, subtotal')
            .in('closure_id', closureIds),
          supabase
            .from('booking_closures')
            .select('id, final_total, total_discount_total')
            .in('id', closureIds)
        ]);

        if (closureItemsResult.error || closuresResult.error) {
          setClosedBookingAmounts({});
          return;
        }

        setClosedBookingAmounts(buildClosedBookingAmounts(employeeBookings, closureItemsResult.data || [], closuresResult.data || []));
      };

      if (user?.isInternal) {
        const [workspaceResult, configResult] = await Promise.all([
          supabase.rpc('get_internal_employee_workspace', {
            account_id_value: user.id,
            session_token_value: user.sessionToken
          }),
          supabase.rpc('get_app_configuration')
        ]);

        const { data, error: workspaceError } = workspaceResult;

        if (!active) {
          return;
        }

        setIsLoading(false);

        if (workspaceError) {
          setError(workspaceError.message || 'No se pudo cargar la información del empleado.');
          return;
        }

        setEmployee(data?.employee || null);
        const employeeBookings = (data?.bookings || []).filter((booking) => String(booking.employee_id) === String(employeeId));
        setBookings(employeeBookings);
        setServices(data?.services || []);
        setPromotions(Array.isArray(configResult.data?.promotions) ? configResult.data.promotions : []);
        setAvailability(data?.availability || []);
        if (Array.isArray(data?.bookingClosureItems) && Array.isArray(data?.bookingClosures)) {
          setClosedBookingAmounts(buildClosedBookingAmounts(employeeBookings, data.bookingClosureItems, data.bookingClosures));
        } else {
          await loadClosedBookingAmounts(employeeBookings);
        }
        return;
      }

      const availabilityRequest = user?.isInternal
        ? supabase.rpc('list_internal_employee_availability', {
            account_id_value: user.id,
            session_token_value: user.sessionToken
          })
        : supabase
            .from('employee_availability')
            .select('*')
            .eq('employee_id', employeeId)
            .order('weekday', { ascending: true })
            .order('start_time', { ascending: true });

      const [employeeResult, bookingsResult, servicesResult, availabilityResult, configResult] = await Promise.all([
        supabase.from('employees').select('*').eq('id', employeeId).is('deleted_at', null).maybeSingle(),
        supabase
          .from('bookings')
          .select('*')
          .eq('employee_id', employeeId)
          .in('status', ['confirmed', 'reserved', 'completed'])
          .order('start_at', { ascending: true }),
        supabase.from('services').select('*'),
        availabilityRequest,
        supabase.rpc('get_app_configuration')
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
      setPromotions(Array.isArray(configResult.data?.promotions) ? configResult.data.promotions : []);
      setAvailability(availabilityResult.data || []);
      await loadClosedBookingAmounts(bookingsResult.data || []);
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

  const visibleUpcomingBookings = useMemo(
    () => bookings.filter((booking) => parseDate(booking.end_at) >= now || isClosedBooking(booking)),
    [bookings, now]
  );

  const activeUpcomingBookings = useMemo(
    () => visibleUpcomingBookings.filter((booking) => !isClosedBooking(booking)),
    [visibleUpcomingBookings]
  );

  const todayBookings = useMemo(
    () => activeUpcomingBookings.filter((booking) => isToday(booking.start_at)),
    [activeUpcomingBookings]
  );

  const activeAvailability = useMemo(
    () => availability.filter((item) => item.active !== false),
    [availability]
  );
  const enabledPromotions = useMemo(() => (
    promotions.filter((promotion) => promotion?.enabled !== false && (promotion?.title || promotion?.description || promotion?.value))
  ), [promotions]);

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

  const weeklyClosedSummary = useMemo(() => {
    const currentWeekStart = startOfWeek(now);
    const nextWeekStart = addDays(currentWeekStart, 7);
    const previousWeekStart = addDays(currentWeekStart, -7);
    const closedBookings = bookings.filter(isClosedBooking);

    const buildSummary = (start, end) => closedBookings.reduce((summary, booking) => {
      if (!isDateInRange(booking.start_at, start, end)) return summary;

      return {
        count: summary.count + 1,
        total: summary.total + Number(closedBookingAmounts[booking.id] || 0)
      };
    }, { count: 0, total: 0 });

    return {
      current: buildSummary(currentWeekStart, nextWeekStart),
      previous: buildSummary(previousWeekStart, currentWeekStart)
    };
  }, [bookings, closedBookingAmounts, now]);

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
              <strong>{activeUpcomingBookings.length}</strong>
              <p>turno(s) activos</p>
            </article>
            <article className="employee-summary-card employee-summary-card-availability">
              <span>Disponibilidad</span>
              <strong>{availabilityDayCount}</strong>
              <p>{todayAvailabilityLabel}</p>
            </article>
            <article className="employee-summary-card employee-summary-card-closed-weeks">
              <span>Recaudación</span>
              <div className="employee-closed-week-lines">
                <div className="employee-closed-week-row is-current">
                  <span>Esta semana</span>
                  <strong>{formatMoney(weeklyClosedSummary.current.total)}</strong>
                  <small>{weeklyClosedSummary.current.count} turnos</small>
                </div>
                <div className="employee-closed-week-row">
                  <span>Semana anterior</span>
                  <strong>{formatMoney(weeklyClosedSummary.previous.total)}</strong>
                  <small>{weeklyClosedSummary.previous.count} turnos</small>
                </div>
              </div>
            </article>
          </div>

          <div className="employee-layout employee-layout-summary">
            <article className="employee-card">
              <div className="employee-card-header">
                <div>
                  <p className="admin-kicker">Agenda</p>
                  <h2>Próximos turnos</h2>
                </div>
                <span>{activeUpcomingBookings.length}</span>
              </div>

              <div className="employee-list">
                {visibleUpcomingBookings.length === 0 ? (
                  <div className="employee-empty-line">No tenés turnos próximos asignados.</div>
                ) : visibleUpcomingBookings.map((booking) => {
                  const service = getServiceForBooking(booking, services);
                  const bookingLabelLines = getBookingLabelLines(booking, service);
                  const isClosed = isClosedBooking(booking);
                  const closedAmount = closedBookingAmounts[booking.id];
                  const customerLabel = getCustomerLabel(booking);
                  const statusLabel = isClosed ? 'Cerrado' : 'Asignado';

                  return (
                    <div
                      className={`employee-booking-row${isClosed ? ' is-closed' : ''}`}
                      key={booking.id}
                      style={{ '--employee-booking-color': isClosed ? '#94a3b8' : '#174c55' }}
                    >
                      <div className="employee-booking-form-header">
                        <ActivityIcon service={service} size="small" />
                        <strong>
                          {bookingLabelLines.map((line, index) => (
                            <span className="employee-booking-title-line" key={`${line}-${index}`}>{line}</span>
                          ))}
                        </strong>
                      </div>

                      <div className="employee-booking-form-grid">
                        <div className="employee-booking-field employee-booking-field-wide">
                          <span>Cliente</span>
                          <strong>{customerLabel}</strong>
                        </div>
                        <div className="employee-booking-field">
                          <span>Fecha</span>
                          <strong>{formatDate(booking.start_at)}</strong>
                        </div>
                        <div className="employee-booking-field">
                          <span>Horario</span>
                          <strong>{formatTime(booking.start_at)} - {formatTime(booking.end_at)}</strong>
                        </div>
                        <div className="employee-booking-field">
                          <span>Estado</span>
                          <strong className={isClosed ? 'is-muted' : 'is-active'}>{statusLabel}</strong>
                        </div>
                        {isClosed && closedAmount !== undefined && (
                          <div className="employee-booking-field">
                            <span>Cobrado</span>
                            <strong>{formatMoney(closedAmount)}</strong>
                          </div>
                        )}
                      </div>
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
            promotions={enabledPromotions}
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