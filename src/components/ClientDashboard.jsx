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

export default function ClientDashboard({ user, showAgenda = true, selectedPromotion = null, onReservePromotion, onReserveTurn, activityLegend = null }) {
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [appConfig, setAppConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [configRefreshKey, setConfigRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);

      const now = formatDateForDb(new Date());

      const [bookingResult, serviceResult] = await Promise.all([
        user?.id
          ? supabase
              .from('bookings')
              .select('*')
              .eq('user_id', user.id)
              .in('status', ACTIVE_BOOKING_STATUSES)
              .gte('start_at', now)
              .order('start_at', { ascending: true })
              .limit(6)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('services').select('*')
      ]);

      const configResult = await supabase.rpc('get_app_configuration');

      if (!active) return;

      if (bookingResult.error) {
        alert('No se pudieron cargar tus próximos turnos.');
        setIsLoading(false);
        return;
      }

      setBookings(bookingResult.data || []);
      setServices(serviceResult.error ? [] : serviceResult.data || []);
      if (!configResult.error) {
        setAppConfig(configResult.data || null);
      }
      setIsLoading(false);
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [user, refreshKey, configRefreshKey, showAgenda]);

  useEffect(() => {
    const refreshConfiguration = () => {
      setConfigRefreshKey((current) => current + 1);
    };

    const refreshFromStorage = (event) => {
      if (event.key === 'turnos_app_configuration_updated_at') {
        refreshConfiguration();
      }
    };

    window.addEventListener('turnos-app-configuration-saved', refreshConfiguration);
    window.addEventListener('storage', refreshFromStorage);
    window.addEventListener('focus', refreshConfiguration);

    return () => {
      window.removeEventListener('turnos-app-configuration-saved', refreshConfiguration);
      window.removeEventListener('storage', refreshFromStorage);
      window.removeEventListener('focus', refreshConfiguration);
    };
  }, []);

  const bookingDetails = useMemo(() => bookings.map((booking) => ({
    booking,
    service: services.find((service) => Number(service.id) === Number(booking.service))
  })), [bookings, services]);
  const enabledPromotions = useMemo(() => (
    Array.isArray(appConfig?.promotions)
      ? appConfig.promotions.filter((promotion) => promotion?.enabled)
      : []
  ), [appConfig]);
  const selectedPromotionLabel = selectedPromotion
    ? [selectedPromotion.title, selectedPromotion.value].filter(Boolean).join(' · ')
    : '';
  const bannerImages = useMemo(() => {
    const configuredImages = Array.isArray(appConfig?.banner_images)
      ? appConfig.banner_images.filter((image) => image?.dataUrl)
      : [];

    if (configuredImages.length) return configuredImages.slice(0, 4);
    if (appConfig?.banner_data_url) {
      return [{
        dataUrl: appConfig.banner_data_url,
        fileName: appConfig.banner_file_name || '',
        mimeType: appConfig.banner_mime_type || ''
      }];
    }

    return [];
  }, [appConfig]);

  const refreshBookings = () => {
    setRefreshKey((current) => current + 1);
  };
  const bannerStripImages = useMemo(() => {
    if (!bannerImages.length) return [];
    return Array.from({ length: 4 }, (_, index) => bannerImages[index % bannerImages.length]);
  }, [bannerImages]);

  return (
    <section className="client-dashboard">
      {!showAgenda && bannerStripImages.length > 0 && (
        <div className="client-home-banner-strip" aria-label="Presentación de la empresa">
          {bannerStripImages.map((image, index) => (
            <div
              className="client-home-banner"
              role="img"
              aria-label={`Presentación de la empresa ${index + 1}`}
              key={`${image.fileName || 'banner'}-${index}`}
              style={{ backgroundImage: `url(${image.dataUrl})` }}
            />
          ))}
        </div>
      )}

      {!showAgenda && (
        <button className="client-welcome-action client-home-reserve-action" type="button" onClick={onReserveTurn}>
          Reservar Turno
        </button>
      )}

      {!showAgenda && activityLegend}

      {!showAgenda && <div className="client-summary-panel">
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
                  <strong>{booking.booking_description || service?.name || 'Actividad'}</strong>
                  <span>{getBookingStatusLabel(booking)} · {formatBookingDate(booking.start_at)}</span>
                </div>
                <time>{formatBookingTime(booking.start_at, booking.end_at)}</time>
              </article>
            ))}
          </div>
        )}
      </div>}

      {!showAgenda && enabledPromotions.length > 0 && (
        <section className="client-promotions-panel">
          <h2>Promociones</h2>
          <div className="client-promotions-grid">
            {enabledPromotions.map((promotion, index) => (
              <article className="client-promotion-card" key={index}>
                <strong>{promotion.title || 'Promoción'}</strong>
                {promotion.description && <p>{promotion.description}</p>}
                {promotion.value && <span>{promotion.value}</span>}
                <button className="client-welcome-action client-promotion-action" type="button" onClick={() => onReservePromotion?.(promotion)}>
                  Reservar turno
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {showAgenda && (
        <div className="client-agenda-panel">
          {selectedPromotion && (
            <div className="client-selected-promotion">
              <strong>Promo seleccionada</strong>
              <span>{selectedPromotionLabel || selectedPromotion.description || 'Promoción'}</span>
            </div>
          )}
          <AgendaGrid
            user={user}
            accessProfile="client"
            refreshKey={refreshKey}
            onBookingsChanged={refreshBookings}
            clientCanChooseEmployee={Boolean(appConfig?.client_can_choose_employee)}
            selectedPromotion={selectedPromotion}
            promotions={enabledPromotions}
          />
        </div>
      )}
    </section>
  );
}