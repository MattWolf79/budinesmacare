import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import AgendaGrid from './AgendaGrid';
import TarjetaPromocion from './TarjetaPromocion';
import { formatDisplayDate } from '../utils/dateFormat';

const ACTIVE_BOOKING_STATUSES = ['confirmed', 'reserved', 'pending_assignment'];

const getBookingStatusLabel = (booking) => (
  !booking.employee_id || booking.status === 'pending_assignment' ? 'Pendiente de asignación' : 'Turno confirmado'
);

const getBookingStatusValue = (booking) => (
  !booking.employee_id || booking.status === 'pending_assignment' ? 'Pendiente' : 'Asignado'
);

const pad = (value) => String(value).padStart(2, '0');

const formatDateForDb = (date) => (
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`
);

const formatBookingDate = (value) => {
  return formatDisplayDate(value, { weekday: 'short' });
};

const formatBookingTimeRange = (startValue, endValue) => {
  const start = new Date(startValue);
  const end = new Date(endValue);
  return `${pad(start.getHours())}:${pad(start.getMinutes())} hs-${pad(end.getHours())}:${pad(end.getMinutes())} hs`;
};

const getBookingCardTitle = (booking, service) => (
  String(booking.booking_description || service?.name || 'Servicio').split('·')[0].trim() || 'Servicio'
);

export default function ClientDashboard({ user, showAgenda = true, selectedPromotion = null, onReservePromotion, onReserveTurn, activityLegend = null, companySlug, companyContext }) {
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [appConfig, setAppConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadErrorMessage, setLoadErrorMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [configRefreshKey, setConfigRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      setLoadErrorMessage('');

      const now = formatDateForDb(new Date());

      let bookingRequest = null;

      if (user?.id) {
        bookingRequest = supabase
          .from('bookings')
          .select('*')
          .in('status', ACTIVE_BOOKING_STATUSES)
          .gte('start_at', now)
          .order('start_at', { ascending: true })
          .limit(6);

        bookingRequest = user?.isInternal && user?.role === 'client'
          ? bookingRequest.eq('client_account_id', user.id)
          : bookingRequest.eq('user_id', user.id);
      }
      let serviceRequest = supabase.from('services').select('*');

      if (companyContext?.id) {
        if (bookingRequest) bookingRequest = bookingRequest.eq('company_id', companyContext.id);
        serviceRequest = serviceRequest.eq('company_id', companyContext.id);
      }

      const [bookingResult, serviceResult] = await Promise.all([
        bookingRequest || Promise.resolve({ data: [], error: null }),
        serviceRequest
      ]);

      const configResult = await supabase.rpc('get_app_configuration', {
        company_slug_value: companySlug
      });

      if (!active) return;

      if (bookingResult.error) {
        setLoadErrorMessage(bookingResult.error.message || 'No se pudieron cargar tus próximos turnos.');
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
  }, [user, refreshKey, configRefreshKey, showAgenda, companySlug, companyContext?.id]);

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

    return () => {
      window.removeEventListener('turnos-app-configuration-saved', refreshConfiguration);
      window.removeEventListener('storage', refreshFromStorage);
    };
  }, []);

  const bookingDetails = useMemo(() => bookings.map((booking) => ({
    booking,
    service: services.find((service) => Number(service.id) === Number(booking.service))
  })), [bookings, services]);
  const preciosHabilitados = appConfig?.configuracion_operativa?.precios_habilitados !== false;
  const promocionesHabilitadas = appConfig?.configuracion_operativa?.promociones_habilitadas !== false;
  const enabledPromotions = useMemo(() => (
    promocionesHabilitadas && Array.isArray(appConfig?.promotions)
      ? appConfig.promotions
        .map((promotion, index) => ({ ...promotion, promotionIndex: index, bookingLabel: [promotion?.title || `Banner ${index + 1}`, promotion?.description, promotion?.value].filter(Boolean).join(' · ') }))
        .filter((promotion) => promotion?.enabled && (preciosHabilitados ? (promotion?.title || promotion?.description || promotion?.value || promotion?.imageDataUrl) : promotion?.imageDataUrl))
      : []
  ), [promocionesHabilitadas, preciosHabilitados, appConfig]);
  const selectedPromotionLabel = selectedPromotion
    ? selectedPromotion.bookingLabel || [selectedPromotion.title, selectedPromotion.value].filter(Boolean).join(' · ') || selectedPromotion.description || 'Promoción seleccionada'
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
      {bannerStripImages.length > 0 && (
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
          Reservar
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

        {loadErrorMessage && (
          <p className="client-summary-empty">{loadErrorMessage}</p>
        )}

        {isLoading ? (
          <p className="client-summary-empty">Cargando tus turnos...</p>
        ) : loadErrorMessage ? null : bookingDetails.length === 0 ? (
          <p className="client-summary-empty">Todavía no tenés turnos próximos.</p>
        ) : (
          <div className="client-booking-list">
            {bookingDetails.map(({ booking, service }) => (
              <article className="client-booking-card" key={booking.id}>
                <div className="client-card-header">
                  <strong>{getBookingCardTitle(booking, service)}</strong>
                </div>
                <div className="client-card-fields">
                  <div className="client-card-field">
                    <span>Fecha</span>
                    <strong>{formatBookingDate(booking.start_at)}</strong>
                  </div>
                  <div className="client-card-field">
                    <span>Horario</span>
                    <strong>{formatBookingTimeRange(booking.start_at, booking.end_at)}</strong>
                  </div>
                  <div className="client-card-field client-card-status-field">
                    <span>Estado</span>
                    <strong className={booking.employee_id && booking.status !== 'pending_assignment' ? 'is-active' : 'is-muted'} title={getBookingStatusLabel(booking)}>
                      {getBookingStatusValue(booking)}
                    </strong>
                  </div>
                </div>
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
              <TarjetaPromocion key={index} promocion={promotion} preciosHabilitados={preciosHabilitados} onReservar={onReservePromotion} />
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
            companySlug={companySlug}
            companyContext={companyContext}
          />
        </div>
      )}
    </section>
  );
}