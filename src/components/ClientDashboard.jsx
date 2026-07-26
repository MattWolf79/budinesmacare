import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import AgendaGrid from './AgendaGrid';
import NewBookingPanel from './NewBookingPanel';
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

export default function ClientDashboard({ user, activeView = 'home', selectedPromotion = null, onReservePromotion, onReserveTurn, onRescheduleDone, activityLegend = null, companySlug, companyContext }) {
  const showAgenda = activeView === 'reserve';
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [appConfig, setAppConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadErrorMessage, setLoadErrorMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [configRefreshKey, setConfigRefreshKey] = useState(0);
  const [selectedBookingId, setSelectedBookingId] = useState(null);
  const [manageBooking, setManageBooking] = useState(null);
  const [bookingToCancel, setBookingToCancel] = useState(null);
  const [newBookingSlot, setNewBookingSlot] = useState(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    let active = true;

    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      setLoadErrorMessage('');

      let bookingRequest = null;

      if (user?.id) {
        bookingRequest = supabase
          .from('bookings')
          .select('*')
          .order('start_at', { ascending: false })
          .limit(80);

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
  }, [user, refreshKey, configRefreshKey, activeView, companySlug, companyContext?.id]);

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

  const packs = useMemo(() => (
    Array.isArray(companyContext?.bundles)
      ? companyContext.bundles.filter((bundle) => bundle?.type === 'pack')
      : []
  ), [companyContext?.bundles]);

  const branchesById = useMemo(() => {
    const map = new Map();
    (companyContext?.branches || []).forEach((branch) => map.set(String(branch.id), branch));
    return map;
  }, [companyContext?.branches]);

  const { activeBookings, historyBookings } = useMemo(() => {
    const nowTs = Date.now();
    const active = [];
    const history = [];
    bookingDetails.forEach((entry) => {
      const isActive = ACTIVE_BOOKING_STATUSES.includes(entry.booking.status)
        && new Date(entry.booking.start_at).getTime() >= nowTs;
      (isActive ? active : history).push(entry);
    });
    active.sort((a, b) => new Date(a.booking.start_at) - new Date(b.booking.start_at));
    history.sort((a, b) => new Date(b.booking.start_at) - new Date(a.booking.start_at));
    return { activeBookings: active, historyBookings: history };
  }, [bookingDetails]);

  const selectedEntry = useMemo(() => {
    if (!selectedBookingId) return null;
    return bookingDetails.find((entry) => String(entry.booking.id) === String(selectedBookingId)) || null;
  }, [bookingDetails, selectedBookingId]);

  const selectedIsActive = selectedEntry
    ? ACTIVE_BOOKING_STATUSES.includes(selectedEntry.booking.status)
      && new Date(selectedEntry.booking.start_at).getTime() >= Date.now()
    : false;

  useEffect(() => {
    if (activeView !== 'mis-turnos') return;
    if (selectedBookingId) return;
    const first = activeBookings[0] || historyBookings[0];
    if (first) setSelectedBookingId(first.booking.id);
  }, [activeView, selectedBookingId, activeBookings, historyBookings]);

  const formatMoney = (value) => `$ ${Number(value || 0).toLocaleString('es-AR')}`;

  const getBookingTotal = (entry) => {
    const raw = entry?.booking?.item_price;
    if (raw !== null && raw !== undefined && raw !== '') return Number(raw);
    return Number(entry?.service?.base_price || 0);
  };

  const getBookingRef = (booking) => String(booking?.id || '').split('-')[0].toUpperCase();

  const getBranchLabel = (booking) => {
    const branch = branchesById.get(String(booking?.branch_id || ''));
    if (!branch) return '';
    return [branch.name, branch.address_street && `${branch.address_street} ${branch.address_number || ''}`.trim(), branch.address_locality]
      .filter(Boolean)
      .join(' · ');
  };

  const closeManage = () => setManageBooking(null);

  const startReschedule = async () => {
    if (!manageBooking) return;
    setIsProcessingAction(true);
    setActionMessage('');

    const { error } = await supabase.rpc('delete_client_booking', {
      booking_id_value: manageBooking.id,
      account_id_value: user?.isInternal ? user.id : null,
      session_token_value: user?.isInternal ? user.sessionToken : null,
      company_slug_value: companySlug
    });

    setIsProcessingAction(false);

    if (error) {
      setActionMessage(error.message || 'No se pudo iniciar la reprogramación.');
      return;
    }

    setManageBooking(null);
    setSelectedBookingId(null);
    refreshBookings();
    if (onRescheduleDone) onRescheduleDone();
    else if (onReserveTurn) onReserveTurn();
  };

  const requestCancel = () => {
    if (!manageBooking) return;
    setBookingToCancel(manageBooking);
    setManageBooking(null);
  };

  const confirmCancel = async () => {
    if (!bookingToCancel) return;
    setIsProcessingAction(true);
    setActionMessage('');

    const { error } = await supabase.rpc('cancel_booking', {
      booking_id_value: bookingToCancel.id,
      account_id_value: user?.isInternal ? user.id : null,
      session_token_value: user?.isInternal ? user.sessionToken : null,
      company_slug_value: companySlug
    });

    setIsProcessingAction(false);

    if (error) {
      setActionMessage(error.message || 'No se pudo cancelar el turno.');
      return;
    }

    setBookingToCancel(null);
    setSelectedBookingId(null);
    refreshBookings();
  };

  const isHome = activeView === 'home';
  const isMisTurnos = activeView === 'mis-turnos';

  return (
    <section className="client-dashboard">
      {isHome && bannerStripImages.length > 0 && (
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

      {isHome && (
        <>
          <button className="client-welcome-action client-home-reserve-action" type="button" onClick={onReserveTurn}>
            Reservar turno
          </button>

          {activityLegend}

          {enabledPromotions.length > 0 && (
            <section className="client-promotions-panel">
              <h2>Promociones</h2>
              <div className="client-promotions-grid">
                {enabledPromotions.map((promotion, index) => (
                  <TarjetaPromocion key={index} promocion={promotion} preciosHabilitados={preciosHabilitados} onReservar={onReservePromotion} />
                ))}
              </div>
            </section>
          )}

          {packs.length > 0 && (
            <section className="client-packs-panel">
              <h2>Packs</h2>
              <div className="client-packs-grid">
                {packs.map((pack) => (
                  <article className="client-pack-card" key={pack.id}>
                    <h3>{pack.name}</h3>
                    {pack.description && <p className="client-pack-desc">{pack.description}</p>}
                    {Array.isArray(pack.items) && pack.items.length > 0 && (
                      <ul className="client-pack-items">
                        {pack.items.map((item, idx) => (
                          <li key={`${pack.id}-${idx}`}>{item.name}</li>
                        ))}
                      </ul>
                    )}
                    <div className="client-pack-footer">
                      {preciosHabilitados && pack.total_price != null && (
                        <span className="client-pack-total">{formatMoney(pack.total_price)}</span>
                      )}
                      <button className="client-pack-reserve" type="button" onClick={onReserveTurn}>Reservar</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {services.filter((service) => !service.deleted_at && service.active !== false).length > 0 && (
            <section className="client-services-panel">
              <h2>Servicios</h2>
              <div className="client-services-grid">
                {services
                  .filter((service) => !service.deleted_at && service.active !== false)
                  .map((service) => (
                    <article className="client-service-card" key={service.id}>
                      <span className="client-service-icon" style={{ background: service.color || '#e2e8f0' }} aria-hidden="true">{service.icon || '✳️'}</span>
                      <div className="client-service-info">
                        <strong>{service.name}</strong>
                        {service.default_duration ? <span>{service.default_duration} min</span> : null}
                      </div>
                      {preciosHabilitados && Number(service.base_price || 0) > 0 && (
                        <span className="client-service-price">desde {formatMoney(service.base_price)}</span>
                      )}
                    </article>
                  ))}
              </div>
            </section>
          )}
        </>
      )}

      {isMisTurnos && (
        <div className="client-turnos">
          <div className="client-turnos-lists">
            {loadErrorMessage && <p className="client-summary-empty">{loadErrorMessage}</p>}

            <div className="client-turnos-group">
              <div className="client-turnos-group-header">
                <h3>Próximos Turnos</h3>
                <span className="client-turnos-count">{activeBookings.length}</span>
              </div>
              {isLoading ? (
                <p className="client-summary-empty">Cargando tus turnos...</p>
              ) : activeBookings.length === 0 ? (
                <p className="client-summary-empty">No tenés turnos próximos.</p>
              ) : (
                activeBookings.map(({ booking, service }) => (
                  <button
                    key={booking.id}
                    type="button"
                    className={`client-turno-row ${String(selectedBookingId) === String(booking.id) ? 'is-selected' : ''}`}
                    onClick={() => setSelectedBookingId(booking.id)}
                  >
                    <span className="client-turno-row-title">{getBookingCardTitle(booking, service)}</span>
                    <span className="client-turno-row-date">{formatBookingDate(booking.start_at)} · {formatBookingTimeRange(booking.start_at, booking.end_at)}</span>
                    <span className={`client-turno-row-status ${booking.employee_id && booking.status !== 'pending_assignment' ? 'is-active' : 'is-muted'}`}>
                      {getBookingStatusValue(booking)}
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="client-turnos-group">
              <div className="client-turnos-group-header">
                <h3>Historial</h3>
                <span className="client-turnos-count">{historyBookings.length}</span>
              </div>
              {isLoading ? (
                <p className="client-summary-empty">Cargando...</p>
              ) : historyBookings.length === 0 ? (
                <p className="client-summary-empty">Sin turnos anteriores.</p>
              ) : (
                historyBookings.map(({ booking, service }) => (
                  <button
                    key={booking.id}
                    type="button"
                    className={`client-turno-row is-history ${String(selectedBookingId) === String(booking.id) ? 'is-selected' : ''}`}
                    onClick={() => setSelectedBookingId(booking.id)}
                  >
                    <span className="client-turno-row-title">{getBookingCardTitle(booking, service)}</span>
                    <span className="client-turno-row-date">{formatBookingDate(booking.start_at)} · {formatBookingTimeRange(booking.start_at, booking.end_at)}</span>
                    <span className="client-turno-row-status is-muted">
                      {booking.status === 'cancelled' ? 'Cancelado' : 'Finalizado'}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="client-turno-detail">
            {selectedEntry ? (
              <article className="client-turno-detail-card">
                <h3>{getBookingCardTitle(selectedEntry.booking, selectedEntry.service)}</h3>
                <div className="client-turno-detail-fields">
                  <div className="client-turno-detail-field">
                    <span>Fecha</span>
                    <strong>{formatBookingDate(selectedEntry.booking.start_at)}</strong>
                  </div>
                  <div className="client-turno-detail-field">
                    <span>Horario</span>
                    <strong>{formatBookingTimeRange(selectedEntry.booking.start_at, selectedEntry.booking.end_at)}</strong>
                  </div>
                  {getBranchLabel(selectedEntry.booking) && (
                    <div className="client-turno-detail-field">
                      <span>Dónde</span>
                      <strong>{getBranchLabel(selectedEntry.booking)}</strong>
                    </div>
                  )}
                  <div className="client-turno-detail-field">
                    <span>Estado</span>
                    <strong>{selectedEntry.booking.status === 'cancelled' ? 'Cancelado' : getBookingStatusLabel(selectedEntry.booking)}</strong>
                  </div>
                  {preciosHabilitados && (
                    <div className="client-turno-detail-field">
                      <span>Total</span>
                      <strong>{formatMoney(getBookingTotal(selectedEntry))}</strong>
                    </div>
                  )}
                  <div className="client-turno-detail-field">
                    <span>Ref</span>
                    <strong>{getBookingRef(selectedEntry.booking)}</strong>
                  </div>
                </div>
                <p className="client-turno-policy">Podés cancelar o reprogramar tu turno antes de la fecha reservada.</p>
                {selectedIsActive && (
                  <button
                    type="button"
                    className="client-turno-manage-button"
                    onClick={() => { setManageBooking(selectedEntry.booking); setActionMessage(''); }}
                  >
                    Tratar
                  </button>
                )}
              </article>
            ) : (
              <p className="client-summary-empty">Elegí un turno para ver el detalle.</p>
            )}
          </div>
        </div>
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
            onRequestNewBooking={selectedPromotion ? null : ((slot) => setNewBookingSlot(slot))}
          />
        </div>
      )}

      {newBookingSlot && (
        <NewBookingPanel
          user={user}
          companySlug={companySlug}
          companyContext={companyContext}
          branchId={newBookingSlot.branchId}
          initialDate={newBookingSlot.date}
          initialStartTime={newBookingSlot.startTime}
          clientCanChooseEmployee={Boolean(appConfig?.client_can_choose_employee)}
          onClose={() => setNewBookingSlot(null)}
          onBookingCreated={() => {
            setNewBookingSlot(null);
            refreshBookings();
          }}
        />
      )}

      {manageBooking && (
        <div className="client-modal-overlay" role="dialog" aria-modal="true">
          <div className="client-manage-modal">
            <div className="client-manage-modal-header">
              <h3>Gestionar turno</h3>
              <button type="button" className="client-modal-close" onClick={closeManage} aria-label="Cerrar">✕</button>
            </div>
            {actionMessage && <p className="client-profile-error">{actionMessage}</p>}
            <button type="button" className="client-manage-option" onClick={startReschedule} disabled={isProcessingAction}>
              <span className="client-manage-option-icon" aria-hidden="true">🔁</span>
              <span className="client-manage-option-text">
                <strong>Modificar Reserva</strong>
                <small>Se libera este turno y elegís de nuevo día, hora y profesional.</small>
              </span>
            </button>
            <button type="button" className="client-manage-option client-manage-option-danger" onClick={requestCancel} disabled={isProcessingAction}>
              <span className="client-manage-option-icon" aria-hidden="true">🗑️</span>
              <span className="client-manage-option-text">
                <strong>Cancelar Reserva</strong>
                <small>Liberar el turno y notificar al negocio.</small>
              </span>
            </button>
          </div>
        </div>
      )}

      {bookingToCancel && (
        <div className="client-modal-overlay" role="dialog" aria-modal="true">
          <div className="client-confirm-modal">
            <h3>Confirmar cancelación</h3>
            <p>Esta acción no se puede deshacer. El turno será liberado y se notificará al negocio.</p>
            {actionMessage && <p className="client-profile-error">{actionMessage}</p>}
            <div className="client-confirm-actions">
              <button type="button" className="client-confirm-no" onClick={() => { setBookingToCancel(null); setActionMessage(''); }} disabled={isProcessingAction}>
                No
              </button>
              <button type="button" className="client-confirm-yes" onClick={confirmCancel} disabled={isProcessingAction}>
                {isProcessingAction ? 'Cancelando...' : 'Sí, Cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}