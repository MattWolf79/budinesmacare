import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import AgendaGrid from './AgendaGrid';
import NewBookingPanel from './NewBookingPanel';
import TarjetaPromocion from './TarjetaPromocion';
import { formatDisplayDate } from '../utils/dateFormat';

const ACTIVE_BOOKING_STATUSES = ['confirmed', 'reserved', 'pending_assignment', 'waitlist'];

const isWaitlistBooking = (booking) => String(booking?.status || '').trim().toLowerCase() === 'waitlist';

const getBookingStatusLabel = (booking, esModoPedido = false) => (
  esModoPedido
    ? (booking.status === 'cancelled' ? 'Cancelado' : isWaitlistBooking(booking) || booking.status === 'pending_assignment' ? 'Pedido recibido' : 'Pedido confirmado')
    : isWaitlistBooking(booking)
      ? 'Lista de espera'
      : !booking.employee_id || booking.status === 'pending_assignment'
        ? 'Pendiente de asignación'
        : 'Turno confirmado'
);

const getBookingStatusValue = (booking, esModoPedido = false) => (
  esModoPedido
    ? (isWaitlistBooking(booking) || booking.status === 'pending_assignment' ? 'Pedido recibido' : 'Confirmado')
    : isWaitlistBooking(booking)
      ? 'Lista de espera'
      : !booking.employee_id || booking.status === 'pending_assignment'
        ? 'Pendiente'
        : 'Asignado'
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

const resolverModoPedido = (configuracionOperativa = {}) => (
  configuracionOperativa.modo_operacion === 'pedido' || configuracionOperativa.usa_agenda === false
);

const getFechaActual = () => {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;
};

const getHoraActual = () => {
  const ahora = new Date();
  return `${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`;
};

const PRODUCT_NAME_SEPARATOR = '::';

const parseProductCatalogName = (value) => {
  const raw = String(value || '').trim();
  if (!raw.includes(PRODUCT_NAME_SEPARATOR)) {
    return { type: '', itemName: raw };
  }

  const [typeRaw, ...rest] = raw.split(PRODUCT_NAME_SEPARATOR);
  const type = String(typeRaw || '').trim();
  const itemName = rest.join(PRODUCT_NAME_SEPARATOR).trim();
  return { type, itemName: itemName || raw };
};

export default function ClientDashboard({ user, activeView = 'home', selectedPromotion = null, onReservePromotion, onReserveTurn, onRescheduleDone, activityLegend = null, companySlug, companyContext }) {
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
  const [reschedulingBooking, setReschedulingBooking] = useState(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [bannerIndex, setBannerIndex] = useState(0);
  const [cantidadesProducto, setCantidadesProducto] = useState({});
  const [fechaPedido, setFechaPedido] = useState(getFechaActual());
  const [horaPedido, setHoraPedido] = useState(getHoraActual());
  const [aclaracionesPedido, setAclaracionesPedido] = useState('');
  const [mensajePedido, setMensajePedido] = useState('');

  useEffect(() => {
    let active = true;

    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      setLoadErrorMessage('');

      let bookingRequest = null;

      if (user?.id) {
        if (user?.isInternal && user?.role === 'client') {
          // Los clientes son cuentas internas (sin sesión Supabase Auth): RLS bloquea la
          // lectura directa de bookings, por eso se usa un RPC security definer.
          bookingRequest = supabase.rpc('get_client_bookings', {
            account_id_value: user.id,
            session_token_value: user.sessionToken,
            company_slug_value: companySlug
          });
        } else {
          bookingRequest = supabase
            .from('bookings')
            .select('*')
            .order('start_at', { ascending: false })
            .limit(80)
            .eq('user_id', user.id);

          if (companyContext?.id) bookingRequest = bookingRequest.eq('company_id', companyContext.id);
        }
      }
      let serviceRequest = supabase.from('services').select('*');

      if (companyContext?.id) {
        serviceRequest = serviceRequest.eq('company_id', companyContext.id);
      }

      const [bookingResult, serviceResult, configResult] = await Promise.all([
        bookingRequest || Promise.resolve({ data: [], error: null }),
        serviceRequest,
        supabase.rpc('get_app_configuration', { company_slug_value: companySlug })
      ]);

      if (!active) return;

      // El config (carrusel/promos) y los servicios se cargan siempre, aunque falle
      // la carga de turnos, para no vaciar el inicio del cliente.
      if (!configResult.error) {
        setAppConfig(configResult.data || null);
      }
      setServices(serviceResult.error ? [] : serviceResult.data || []);

      if (bookingResult.error) {
        setBookings([]);
        setLoadErrorMessage(bookingResult.error.message || 'No se pudieron cargar tus próximos turnos.');
        setIsLoading(false);
        return;
      }

      setLoadErrorMessage('');
      setBookings(bookingResult.data || []);
      setIsLoading(false);
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [user, refreshKey, configRefreshKey, companySlug, companyContext?.id]);

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
  const configuracionOperativa = appConfig?.configuracion_operativa || companyContext?.configuracion_operativa || {};
  const esModoPedido = resolverModoPedido(configuracionOperativa);
  const showAgenda = activeView === 'reserve' && !esModoPedido;
  const showFormularioPedido = activeView === 'reserve' && esModoPedido;
  const etiquetaReserva = esModoPedido ? 'Hacer pedido' : 'Reservar turno';
  const etiquetaHistorial = esModoPedido ? 'pedidos' : 'turnos';
  const etiquetaItemCatalogo = esModoPedido ? 'Producto' : 'Servicio';
  const preciosHabilitados = configuracionOperativa.precios_habilitados !== false;
  const promocionesHabilitadas = configuracionOperativa.promociones_habilitadas !== false;
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

  useEffect(() => {
    // Si el cliente deja la vista de reserva sin confirmar la modificación,
    // se descarta la referencia y el turno original queda vigente.
    if (activeView !== 'reserve') {
      setReschedulingBooking(null);
    }
  }, [activeView]);

  useEffect(() => {
    setBannerIndex((current) => (bannerImages.length ? current % bannerImages.length : 0));
    if (bannerImages.length <= 1) return undefined;
    const intervalId = window.setInterval(() => {
      setBannerIndex((current) => (current + 1) % bannerImages.length);
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [bannerImages.length]);

  const showPrevBanner = () => {
    setBannerIndex((current) => (current - 1 + bannerImages.length) % bannerImages.length);
  };
  const showNextBanner = () => {
    setBannerIndex((current) => (current + 1) % bannerImages.length);
  };

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

  // Nombre de servicio por id: combina la tabla services (si el cliente puede leerla)
  // con los items de los bundles del contexto público (siempre disponibles para promos/packs).
  const serviceNameById = useMemo(() => {
    const map = new Map();
    (services || []).forEach((service) => {
      if (service?.id != null && service?.name) map.set(String(service.id), service.name);
    });
    (companyContext?.bundles || []).forEach((bundle) => {
      (bundle?.items || []).forEach((item) => {
        if (item?.service_id != null && item?.name) map.set(String(item.service_id), item.name);
      });
    });
    return map;
  }, [services, companyContext?.bundles]);

  // Etiquetas de promos/packs para detectar turnos que forman parte de un combo,
  // ya que las reservas de cliente no guardan bundle_id/bundle_type.
  const bundleLabelSet = useMemo(() => {
    const set = new Set();
    (companyContext?.bundles || []).forEach((bundle) => {
      const name = String(bundle?.name || '').trim().toLowerCase();
      if (name) set.add(name);
    });
    (appConfig?.promotions || []).forEach((promotion) => {
      const title = String(promotion?.title || '').trim().toLowerCase();
      if (title) set.add(title);
    });
    return set;
  }, [companyContext?.bundles, appConfig?.promotions]);

  const isBundleBooking = (booking) => {
    if (Boolean(booking?.bundle_id) || ['promo', 'pack'].includes(String(booking?.bundle_type || '').toLowerCase())) {
      return true;
    }
    // Promoción reservada sin servicio asociado.
    if (!booking?.service && booking?.booking_description) return true;
    const label = String(booking?.booking_description || '').split('·')[0].trim().toLowerCase();
    return Boolean(label) && bundleLabelSet.has(label);
  };

  const resolveServiceName = (booking) => {
    if (booking?.service == null) return '';
    return serviceNameById.get(String(booking.service)) || '';
  };

  const getBookingServiceName = (booking) => {
    const serviceName = resolveServiceName(booking);
    if (!serviceName) return '';
    // Si el título ya es el nombre del servicio (turno suelto), no lo repetimos.
    if (!isBundleBooking(booking) && getBookingCardTitle(booking, { name: serviceName }) === serviceName) return '';
    return serviceName;
  };

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

  const productosActivos = useMemo(() => (
    services.filter((service) => !service.deleted_at && service.active !== false)
  ), [services]);

  const productosAgrupados = useMemo(() => {
    if (!esModoPedido) {
      return [{ groupName: '', products: productosActivos.map((producto) => ({ producto, parsed: parseProductCatalogName(producto.name) })) }];
    }

    const groups = new Map();
    productosActivos.forEach((producto) => {
      const parsed = parseProductCatalogName(producto.name);
      const key = parsed.type || 'Sin tipo';
      const list = groups.get(key) || [];
      list.push({ producto, parsed });
      groups.set(key, list);
    });

    return Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([groupName, products]) => ({
        groupName,
        products: products.sort((a, b) => (a.parsed.itemName || '').localeCompare(b.parsed.itemName || '', 'es'))
      }));
  }, [productosActivos, esModoPedido]);

  const itemsPedido = useMemo(() => (
    productosActivos
      .map((producto) => {
        const cantidad = Math.max(0, Number(cantidadesProducto[producto.id] || 0));
        if (!cantidad) return null;
        const precioUnitario = Number(producto.base_price || 0);
        const parsed = parseProductCatalogName(producto.name);
        return {
          producto,
          productoNombre: parsed.itemName || producto.name,
          productoTipo: parsed.type || '',
          cantidad,
          precioUnitario,
          subtotal: cantidad * precioUnitario
        };
      })
      .filter(Boolean)
  ), [productosActivos, cantidadesProducto]);

  const totalPedido = useMemo(
    () => itemsPedido.reduce((total, item) => total + item.subtotal, 0),
    [itemsPedido]
  );

  const cambiarCantidadProducto = (productoId, valor) => {
    const cantidadNormalizada = Number.parseInt(String(valor || '0'), 10);
    const siguienteCantidad = Number.isNaN(cantidadNormalizada) ? 0 : Math.max(0, cantidadNormalizada);

    setCantidadesProducto((actual) => ({
      ...actual,
      [productoId]: siguienteCantidad
    }));
  };

  const registrarPedido = async () => {
    if (!itemsPedido.length) {
      setMensajePedido('Seleccioná al menos un producto para armar el pedido.');
      return;
    }

    if (!fechaPedido || !horaPedido) {
      setMensajePedido('Seleccioná día y horario solicitado para el pedido.');
      return;
    }

    setIsProcessingAction(true);
    setMensajePedido('Guardando pedido...');

    const bookingGroupId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : null;
    const baseStartDate = new Date(`${fechaPedido}T${horaPedido}:00`);
    const totalItems = itemsPedido.reduce((total, item) => total + item.cantidad, 0);

    for (const [index, item] of itemsPedido.entries()) {
      const itemStartDate = new Date(baseStartDate);
      itemStartDate.setMinutes(itemStartDate.getMinutes() + index);
      const itemEndDate = new Date(itemStartDate);
      itemEndDate.setMinutes(itemEndDate.getMinutes() + 1);
      const itemDate = `${itemStartDate.getFullYear()}-${pad(itemStartDate.getMonth() + 1)}-${pad(itemStartDate.getDate())}`;
      const itemEndDateLabel = `${itemEndDate.getFullYear()}-${pad(itemEndDate.getMonth() + 1)}-${pad(itemEndDate.getDate())}`;
      const startAt = `${itemDate}T${pad(itemStartDate.getHours())}:${pad(itemStartDate.getMinutes())}:00`;
      const endAt = `${itemEndDateLabel}T${pad(itemEndDate.getHours())}:${pad(itemEndDate.getMinutes())}:00`;
      const descripcion = [
        `Pedido x${item.cantidad}`,
        item.productoTipo ? `${item.productoTipo} · ${item.productoNombre}` : item.productoNombre,
        preciosHabilitados ? `${formatMoney(item.precioUnitario)} c/u` : '',
        aclaracionesPedido.trim() ? `Aclaraciones: ${aclaracionesPedido.trim()}` : ''
      ].filter(Boolean).join(' · ');

      const { error } = await supabase.rpc('request_client_booking', {
        service_id_value: item.producto.id,
        employee_id_value: null,
        booking_description_value: descripcion,
        start_at_value: startAt,
        end_at_value: endAt,
        customer_name_value: user?.displayName || user?.email || null,
        customer_email_value: user?.email || null,
        company_slug_value: companySlug,
        account_id_value: user?.isInternal ? user.id : null,
        session_token_value: user?.isInternal ? user.sessionToken : null,
        booking_group_id_value: bookingGroupId
      });

      if (error) {
        setIsProcessingAction(false);
        setMensajePedido(error.message || 'No se pudo guardar el pedido.');
        return;
      }
    }

    setCantidadesProducto({});
    setAclaracionesPedido('');
    setMensajePedido(`Pedido registrado: ${totalItems} item(s), entrega solicitada ${fechaPedido} ${horaPedido}.`);
    setRefreshKey((current) => current + 1);
    setIsProcessingAction(false);
  };

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

  const startReschedule = () => {
    if (!manageBooking) return;
    // No se elimina el turno actual: se guarda como referencia y se abre la grilla
    // para elegir el nuevo turno. El turno original sigue vigente hasta que el
    // cliente confirme la modificación.
    const entry = bookingDetails.find((item) => String(item.booking.id) === String(manageBooking.id))
      || { booking: manageBooking, service: null };
    setReschedulingBooking(entry);
    setActionMessage('');
    setManageBooking(null);
    if (onRescheduleDone) onRescheduleDone();
    else if (onReserveTurn) onReserveTurn();
  };

  const cancelReschedule = () => {
    // El cliente abandona la modificación sin elegir un nuevo turno: el original queda vigente.
    setReschedulingBooking(null);
  };

  const finishReschedule = async (originalId) => {
    // El nuevo turno ya fue creado y confirmado en el panel de reserva:
    // liberamos el turno original para completar la modificación.
    if (!originalId) {
      setReschedulingBooking(null);
      refreshBookings();
      return;
    }

    setIsProcessingAction(true);
    setActionMessage('');

    const { error } = await supabase.rpc('delete_client_booking', {
      booking_id_value: originalId,
      account_id_value: user?.isInternal ? user.id : null,
      session_token_value: user?.isInternal ? user.sessionToken : null,
      company_slug_value: companySlug
    });

    setIsProcessingAction(false);
    setReschedulingBooking(null);

    if (error) {
      setActionMessage(error.message || 'El nuevo turno quedó reservado, pero no se pudo liberar el turno anterior.');
    }

    refreshBookings();
  };

  const requestCancel = () => {
    if (!manageBooking) return;
    setBookingToCancel(manageBooking);
    setManageBooking(null);
  };

  // Los turnos de un pack/promo se reservan juntos pero se guardan como bookings
  // independientes. Para cancelarlos como una unidad los agrupamos por
  // booking_group_id (si existe) o, como fallback, por descripcion + fecha.
  const getBundleGroupIds = (booking) => {
    if (!booking) return [];
    if (!isBundleBooking(booking)) return [booking.id];
    if (booking.booking_group_id) {
      const siblings = bookings
        .filter((entry) => entry.booking_group_id === booking.booking_group_id)
        .map((entry) => entry.id);
      return siblings.length ? siblings : [booking.id];
    }
    const description = String(booking.booking_description || '').trim().toLowerCase();
    if (!description) return [booking.id];
    const dayKey = new Date(booking.start_at).toDateString();
    const siblings = bookings
      .filter((entry) => (
        String(entry.booking_description || '').trim().toLowerCase() === description
        && new Date(entry.start_at).toDateString() === dayKey
        && !['cancelled'].includes(entry.status)
      ))
      .map((entry) => entry.id);
    return siblings.length ? siblings : [booking.id];
  };

  const confirmCancel = async () => {
    if (!bookingToCancel) return;
    setIsProcessingAction(true);
    setActionMessage('');

    const idsToCancel = getBundleGroupIds(bookingToCancel);

    for (const bookingId of idsToCancel) {
      const { error } = await supabase.rpc('cancel_booking', {
        booking_id_value: bookingId,
        account_id_value: user?.isInternal ? user.id : null,
        session_token_value: user?.isInternal ? user.sessionToken : null,
        company_slug_value: companySlug
      });

      if (error) {
        setIsProcessingAction(false);
        setActionMessage(error.message || 'No se pudo cancelar el turno.');
        refreshBookings();
        return;
      }
    }

    setIsProcessingAction(false);
    setBookingToCancel(null);
    setSelectedBookingId(null);
    refreshBookings();
  };

  const isHome = activeView === 'home';
  const isMisTurnos = activeView === 'mis-turnos';

  return (
    <section className="client-dashboard">
      {isHome && bannerImages.length > 0 && (
        <div className="client-home-carousel" aria-roledescription="carrusel" aria-label="Flyers de la empresa">
          <div
            className="client-home-carousel-track"
            style={{ transform: `translateX(-${bannerIndex * 100}%)` }}
          >
            {bannerImages.map((image, index) => (
              <div
                className="client-home-carousel-slide"
                role="img"
                aria-label={`Flyer ${index + 1} de ${bannerImages.length}`}
                aria-hidden={index !== bannerIndex}
                key={`${image.fileName || 'flyer'}-${index}`}
                style={{ backgroundImage: `url(${image.dataUrl})` }}
              />
            ))}
          </div>

          {bannerImages.length > 1 && (
            <>
              <button
                type="button"
                className="client-home-carousel-arrow client-home-carousel-arrow-prev"
                onClick={showPrevBanner}
                aria-label="Flyer anterior"
              >
                &#8249;
              </button>
              <button
                type="button"
                className="client-home-carousel-arrow client-home-carousel-arrow-next"
                onClick={showNextBanner}
                aria-label="Flyer siguiente"
              >
                &#8250;
              </button>
              <div className="client-home-carousel-dots">
                {bannerImages.map((image, index) => (
                  <button
                    type="button"
                    key={`dot-${image.fileName || 'flyer'}-${index}`}
                    className={`client-home-carousel-dot ${index === bannerIndex ? 'is-active' : ''}`}
                    onClick={() => setBannerIndex(index)}
                    aria-label={`Ir al flyer ${index + 1}`}
                    aria-current={index === bannerIndex}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {isHome && (
        <>
          <button className="client-welcome-action client-home-reserve-action" type="button" onClick={onReserveTurn}>
            {etiquetaReserva}
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
                      <button className="client-pack-reserve" type="button" onClick={onReserveTurn}>{etiquetaReserva}</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {productosActivos.length > 0 && (
            <section className="client-services-panel">
              <h2>{esModoPedido ? 'Productos' : 'Servicios'}</h2>
              <div className="client-services-grid">
                {productosActivos
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
                <h3>{esModoPedido ? 'Próximos pedidos' : 'Próximos Turnos'}</h3>
                <span className="client-turnos-count">{activeBookings.length}</span>
              </div>
              {isLoading ? (
                <p className="client-summary-empty">Cargando tus {etiquetaHistorial}...</p>
              ) : activeBookings.length === 0 ? (
                <p className="client-summary-empty">No tenés {esModoPedido ? 'pedidos' : 'turnos'} próximos.</p>
              ) : (
                activeBookings.map(({ booking, service }) => (
                  <button
                    key={booking.id}
                    type="button"
                    className={`client-turno-row ${String(selectedBookingId) === String(booking.id) ? 'is-selected' : ''}`}
                    onClick={() => setSelectedBookingId(booking.id)}
                  >
                    <span className="client-turno-row-title">{getBookingCardTitle(booking, service)}</span>
                    {getBookingServiceName(booking) && (
                      <span className="client-turno-row-service">{getBookingServiceName(booking)}</span>
                    )}
                    <span className="client-turno-row-date">{formatBookingDate(booking.start_at)} · {formatBookingTimeRange(booking.start_at, booking.end_at)}</span>
                    <span className={`client-turno-row-status ${esModoPedido || (booking.employee_id && booking.status !== 'pending_assignment') ? 'is-active' : 'is-muted'}`}>
                      {getBookingStatusValue(booking, esModoPedido)}
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
                <p className="client-summary-empty">Sin {esModoPedido ? 'pedidos' : 'turnos'} anteriores.</p>
              ) : (
                historyBookings.map(({ booking, service }) => (
                  <button
                    key={booking.id}
                    type="button"
                    className={`client-turno-row is-history ${String(selectedBookingId) === String(booking.id) ? 'is-selected' : ''}`}
                    onClick={() => setSelectedBookingId(booking.id)}
                  >
                    <span className="client-turno-row-title">{getBookingCardTitle(booking, service)}</span>
                    {getBookingServiceName(booking) && (
                      <span className="client-turno-row-service">{getBookingServiceName(booking)}</span>
                    )}
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
                  {resolveServiceName(selectedEntry.booking) && (
                    <div className="client-turno-detail-field">
                      <span>{esModoPedido ? 'Producto' : 'Servicio'}</span>
                      <strong>{resolveServiceName(selectedEntry.booking)}</strong>
                    </div>
                  )}
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
                    <strong>{selectedEntry.booking.status === 'cancelled' ? 'Cancelado' : getBookingStatusLabel(selectedEntry.booking, esModoPedido)}</strong>
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
                <p className="client-turno-policy">{esModoPedido ? 'Podés cancelar o reprogramar tu pedido antes de la fecha solicitada.' : 'Podés cancelar o reprogramar tu turno antes de la fecha reservada.'}</p>
                {selectedIsActive && (
                  <button
                    type="button"
                    className="client-turno-manage-button"
                    onClick={() => { setManageBooking(selectedEntry.booking); setActionMessage(''); }}
                  >
                    {esModoPedido ? 'Gestionar pedido' : 'Gestionar turno'}
                  </button>
                )}
              </article>
            ) : (
              <p className="client-summary-empty">Elegí un {esModoPedido ? 'pedido' : 'turno'} para ver el detalle.</p>
            )}
          </div>
        </div>
      )}

      {showFormularioPedido && (
        <section className="client-services-panel">
          <h2>Armá tu pedido</h2>
          <p className="client-pack-desc">Elegí productos y cantidades. Podés agregar componentes en aclaraciones (ejemplo: salsas, aderezos, caja o bolsa).</p>

          {productosActivos.length === 0 ? (
            <p className="client-summary-empty">Todavía no hay productos activos para pedir.</p>
          ) : (
            <div className="client-services-grid">
              {productosAgrupados.map((group) => (
                <div key={group.groupName || 'sin-tipo'} style={{ gridColumn: '1 / -1' }}>
                  {group.groupName && <h3 style={{ margin: '0 0 .6rem' }}>{group.groupName}</h3>}
                  <div className="client-services-grid">
                    {group.products.map(({ producto, parsed }) => (
                      <article className="client-service-card" key={producto.id}>
                        <span className="client-service-icon" style={{ background: producto.color || '#e2e8f0' }} aria-hidden="true">{producto.icon || '🛒'}</span>
                        <div className="client-service-info">
                          <strong>{parsed.itemName || producto.name}</strong>
                          <span>{etiquetaItemCatalogo}</span>
                        </div>
                        {preciosHabilitados && Number(producto.base_price || 0) > 0 && (
                          <span className="client-service-price">{formatMoney(producto.base_price)}</span>
                        )}
                        <label className="platform-field">
                          <span>Cantidad</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={cantidadesProducto[producto.id] || ''}
                            onChange={(event) => cambiarCantidadProducto(producto.id, event.target.value)}
                            placeholder="0"
                          />
                        </label>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="platform-form-grid" style={{ marginTop: '1rem' }}>
            <label className="platform-field">
              <span>Día solicitado</span>
              <input type="date" value={fechaPedido} onChange={(event) => setFechaPedido(event.target.value)} />
            </label>
            <label className="platform-field">
              <span>Horario solicitado</span>
              <input type="time" value={horaPedido} onChange={(event) => setHoraPedido(event.target.value)} />
              <small>Seleccioná hora y minutos (HH:MM). No se usa grilla de turnos en modo pedido.</small>
            </label>
            <label className="platform-field" style={{ gridColumn: '1 / -1' }}>
              <span>Aclaraciones y componentes</span>
              <textarea
                rows={3}
                value={aclaracionesPedido}
                onChange={(event) => setAclaracionesPedido(event.target.value)}
                placeholder="Ejemplo: 2 empanadas con salsa picante, 1 pizza en caja."
              />
            </label>
          </div>

          {itemsPedido.length > 0 && (
            <div className="client-turno-detail-card" style={{ marginTop: '1rem' }}>
              <h3>Resumen del pedido</h3>
              <div className="client-turno-detail-fields">
                {itemsPedido.map((item) => (
                  <div className="client-turno-detail-field" key={item.producto.id}>
                    <span>{item.productoTipo ? `${item.productoTipo} · ${item.productoNombre}` : item.productoNombre}</span>
                    <strong>{item.cantidad} x {preciosHabilitados ? formatMoney(item.precioUnitario) : 'item'}{preciosHabilitados ? ` = ${formatMoney(item.subtotal)}` : ''}</strong>
                  </div>
                ))}
                <div className="client-turno-detail-field">
                  <span>Entrega solicitada</span>
                  <strong>{fechaPedido || '-'} {horaPedido || ''}</strong>
                </div>
                {preciosHabilitados && (
                  <div className="client-turno-detail-field">
                    <span>Total estimado</span>
                    <strong>{formatMoney(totalPedido)}</strong>
                  </div>
                )}
              </div>
            </div>
          )}

          {mensajePedido && <p className="platform-admin-success">{mensajePedido}</p>}

          <div className="platform-action-row platform-action-row-end" style={{ marginTop: '1rem' }}>
            <button type="button" className="client-order-submit-button" onClick={registrarPedido} disabled={isProcessingAction}>
              {isProcessingAction ? 'Guardando...' : 'Confirmar pedido'}
            </button>
          </div>
        </section>
      )}

      {showAgenda && (
        <div className="client-agenda-panel">
          {reschedulingBooking && (
            <div className="client-reschedule-banner" role="status">
              <div className="client-reschedule-banner-text">
                <strong>Estás modificando tu turno</strong>
                <span>
                  {formatBookingDate(reschedulingBooking.booking.start_at)} · {formatBookingTimeRange(reschedulingBooking.booking.start_at, reschedulingBooking.booking.end_at)}.
                  {' '}Elegí el nuevo turno; el actual sigue vigente hasta que confirmes el cambio.
                </span>
              </div>
            </div>
          )}
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
            rescheduleActive={Boolean(reschedulingBooking)}
            onCancelReschedule={cancelReschedule}
            preferredBranchId={reschedulingBooking?.booking?.branch_id || null}
            onRequestNewBooking={selectedPromotion ? null : ((slot) => setNewBookingSlot(slot))}
          />
        </div>
      )}

      {newBookingSlot && !esModoPedido && (
        <NewBookingPanel
          user={user}
          companySlug={companySlug}
          companyContext={companyContext}
          branchId={newBookingSlot.branchId}
          initialDate={newBookingSlot.date}
          initialStartTime={newBookingSlot.startTime}
          clientCanChooseEmployee={Boolean(appConfig?.client_can_choose_employee)}
          rescheduleMode={Boolean(reschedulingBooking)}
          onClose={() => setNewBookingSlot(null)}
          onBookingCreated={() => {
            setNewBookingSlot(null);
            if (reschedulingBooking) {
              finishReschedule(reschedulingBooking.booking.id);
            } else {
              refreshBookings();
            }
          }}
        />
      )}

      {manageBooking && (
        <div className="client-modal-overlay" role="dialog" aria-modal="true">
          <div className="client-manage-modal">
            <div className="client-manage-modal-header">
              <h3>{esModoPedido ? 'Gestionar pedido' : 'Gestionar turno'}</h3>
              <button type="button" className="client-modal-close" onClick={closeManage} aria-label="Cerrar">✕</button>
            </div>
            {actionMessage && <p className="client-profile-error">{actionMessage}</p>}
            {isBundleBooking(manageBooking) ? (
              <p className="client-manage-note">
                Este turno forma parte de una promo/pack. Los servicios van juntos, así que no se puede modificar solo uno. Podés cancelarlo.
              </p>
            ) : (
              <button type="button" className="client-manage-option" onClick={startReschedule} disabled={isProcessingAction}>
                <span className="client-manage-option-icon" aria-hidden="true">🔁</span>
                <span className="client-manage-option-text">
                  <strong>{esModoPedido ? 'Modificar pedido' : 'Modificar Reserva'}</strong>
                  <small>{esModoPedido ? 'Actualizá día, hora o detalle del pedido.' : 'Elegís de nuevo día, hora y profesional. Tu turno actual sigue vigente hasta que confirmes el cambio.'}</small>
                </span>
              </button>
            )}
            <button type="button" className="client-manage-option client-manage-option-danger" onClick={requestCancel} disabled={isProcessingAction}>
              <span className="client-manage-option-icon" aria-hidden="true">🗑️</span>
              <span className="client-manage-option-text">
                <strong>{esModoPedido ? 'Cancelar pedido' : 'Cancelar Reserva'}</strong>
                <small>{esModoPedido ? 'Cancelar el pedido y notificar al negocio.' : 'Liberar el turno y notificar al negocio.'}</small>
              </span>
            </button>
          </div>
        </div>
      )}

      {bookingToCancel && (
        <div className="client-modal-overlay" role="dialog" aria-modal="true">
          <div className="client-confirm-modal">
            <h3>Confirmar cancelación de {esModoPedido ? 'pedido' : 'turno'}</h3>
            <p>
              {isBundleBooking(bookingToCancel) && getBundleGroupIds(bookingToCancel).length > 1
                ? 'Esta promo/pack incluye varios turnos y se cancelarán todos juntos. Esta acción no se puede deshacer y se notificará al negocio.'
                : 'Esta acción no se puede deshacer. El turno será liberado y se notificará al negocio.'}
            </p>
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