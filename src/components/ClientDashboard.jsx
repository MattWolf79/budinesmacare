import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import ActivityIcon from './ActivityIcon';
import AgendaGrid from './AgendaGrid';

const ACTIVE_BOOKING_STATUSES = ['confirmed', 'reserved', 'pending_assignment'];

const getBookingStatusLabel = (booking) => (
  !booking.employee_id || booking.status === 'pending_assignment' ? 'Pendiente de asignación' : 'Turno confirmado'
);

const pad = (value) => String(value).padStart(2, '0');

const formatDateForDb = (date) => (
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`
);

const formatBookingDate = (value) => {
  const date = new Date(value);
  return date.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: '2-digit' });
};

const formatBookingTime = (startValue, endValue) => {
  const start = new Date(startValue);
  const end = new Date(endValue);
  return `${pad(start.getHours())}:${pad(start.getMinutes())} - ${pad(end.getHours())}:${pad(end.getMinutes())}`;
};

export default function ClientDashboard({ user, showAgenda = true }) {
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const timeoutId = window.setTimeout(async () => {
      if (!user?.id) {
        if (active) setIsLoading(false);
        return;
      }

      setIsLoading(true);

      const now = formatDateForDb(new Date());

      const [bookingResult, serviceResult] = await Promise.all([
        supabase
          .from('bookings')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ACTIVE_BOOKING_STATUSES)
          .gte('start_at', now)
          .order('start_at', { ascending: true })
          .limit(6),
        supabase.from('services').select('*')
      ]);

      if (!active) return;

      if (bookingResult.error || serviceResult.error) {
        alert('No se pudieron cargar tus próximos turnos.');
        setIsLoading(false);
        return;
      }

      setBookings(bookingResult.data || []);
      setServices(serviceResult.data || []);
      setIsLoading(false);
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [user, refreshKey]);

  const bookingDetails = useMemo(() => bookings.map((booking) => ({
    booking,
    service: services.find((service) => Number(service.id) === Number(booking.service))
  })), [bookings, services]);

  const refreshBookings = () => {
    setRefreshKey((current) => current + 1);
  };

  return (
    <section className="client-dashboard">
      <div className="client-summary-panel">
        <div className="client-summary-header">
          <h2>Próximos turnos</h2>
          <button className="client-summary-refresh" type="button" onClick={refreshBookings} title="Actualizar turnos">
            Actualizar
          </button>
        </div>

        {isLoading ? (
          <p className="client-summary-empty">Cargando tus turnos...</p>
        ) : bookingDetails.length === 0 ? (
          <p className="client-summary-empty">Todavía no tenés turnos próximos.</p>
        ) : (
          <div className="client-booking-list">
            {bookingDetails.map(({ booking, service }) => (
              <article className="client-booking-card" key={booking.id}>
                <ActivityIcon service={service} size="small" variant="summary" />
                <div>
                  <strong>{service?.name || 'Actividad'}</strong>
                  <span>{getBookingStatusLabel(booking)} · {formatBookingDate(booking.start_at)}</span>
                </div>
                <time>{formatBookingTime(booking.start_at, booking.end_at)}</time>
              </article>
            ))}
          </div>
        )}
      </div>

      {showAgenda && (
        <div className="client-agenda-panel">
          <AgendaGrid user={user} accessProfile="client" refreshKey={refreshKey} onBookingsChanged={refreshBookings} />
        </div>
      )}
    </section>
  );
}