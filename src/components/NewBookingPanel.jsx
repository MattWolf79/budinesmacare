import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import ActivityIcon from './ActivityIcon';

const currency = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const formatPrice = (value) => currency.format(Number(value || 0));

const GRID_OPTIONS = new Set([15, 30, 45, 60]);
const getGridInterval = (value) => {
  const parsed = Number(value);
  return GRID_OPTIONS.has(parsed) ? parsed : 30;
};

const snapDuration = (value, gridInterval) => {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return gridInterval;
  if (minutes <= gridInterval) return gridInterval;
  return Math.ceil(minutes / gridInterval) * gridInterval;
};

const formatDurationLabel = (minutes) => {
  const total = Number(minutes) || 0;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours} h ${mins} min`;
  if (hours) return `${hours} h`;
  return `${mins} min`;
};

const pad = (value) => String(value).padStart(2, '0');

const parseTime = (timeStr) => {
  const [h, m] = String(timeStr || '').split(':').map((part) => Number(part));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

const minutesToTime = (totalMinutes) => {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(totalMinutes)));
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
};

const addMinutesToTime = (timeStr, minutes) => minutesToTime(parseTime(timeStr) + Number(minutes || 0));

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const defaultStartTime = (gridInterval) => {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const snapped = Math.ceil((minutes + 1) / gridInterval) * gridInterval;
  return minutesToTime(Math.min(snapped, 22 * 60));
};

const formatSupabaseError = (error) => [
  error?.message,
  error?.code ? `Código: ${error.code}` : '',
  error?.details ? `Detalle: ${error.details}` : '',
  error?.hint ? `Ayuda: ${error.hint}` : ''
].filter(Boolean).join('\n');

const formatDayLabel = (isoDate) => {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-').map((part) => Number(part));
  const date = new Date(year, (month || 1) - 1, day || 1);
  const label = date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

// Estados de turno que ocupan la agenda del profesional.
const ACTIVE_BOOKING_STATUSES = new Set(['reserved', 'confirmed', 'pending_assignment']);

// Horario de atención (simulado hasta configurarlo en admin): 9 a 18, lun-sáb.
const BUSINESS_OPEN_MIN = 9 * 60;
const BUSINESS_CLOSE_MIN = 18 * 60;
const BUSINESS_WEEKDAYS = new Set([1, 2, 3, 4, 5, 6]); // 0 = domingo (cerrado).

const weekdayOfIso = (isoDate) => {
  const [year, month, day] = String(isoDate).split('-').map((part) => Number(part));
  return new Date(year, (month || 1) - 1, day || 1).getDay();
};

// Devuelve el motivo por el que la reserva no entra en el horario, o '' si entra.
const businessHoursIssue = (cartItems, isoDate) => {
  if (!cartItems.length) return '';
  if (!BUSINESS_WEEKDAYS.has(weekdayOfIso(isoDate))) {
    return 'El día elegido está fuera de los días de atención (lunes a sábado). Favor de elegir otro día.';
  }
  let minStart = Infinity;
  let maxEnd = -Infinity;
  cartItems.forEach((item) => {
    const start = parseTime(item.startTime);
    minStart = Math.min(minStart, start);
    maxEnd = Math.max(maxEnd, start + Number(item.duration || 0));
  });
  if (minStart < BUSINESS_OPEN_MIN || maxEnd > BUSINESS_CLOSE_MIN) {
    return 'La reserva elegida sobrepasa el horario de atención (9 a 18 hs). Favor de elegir otro día.';
  }
  return '';
};

const isoDateOf = (timestamp) => String(timestamp || '').slice(0, 10);
const isoTimeOf = (timestamp) => String(timestamp || '').slice(11, 16);

// Ventanas de disponibilidad (en minutos) del profesional para una fecha.
const availabilityWindowsFor = (availability, employeeId, isoDate) => availability
  .filter((row) => String(row.employee_id) === String(employeeId)
    && row.active !== false
    && isoDateOf(row.available_date) === isoDate)
  .map((row) => ({ start: parseTime(String(row.start_time).slice(0, 5)), end: parseTime(String(row.end_time).slice(0, 5)) }));

// Turnos que ya ocupan al profesional en esa fecha (excluye ids del grupo en edición).
const busyIntervalsFor = (bookings, employeeId, isoDate, excludeIds) => bookings
  .filter((row) => String(row.employee_id) === String(employeeId)
    && ACTIVE_BOOKING_STATUSES.has(row.status)
    && isoDateOf(row.start_at) === isoDate
    && !(excludeIds && excludeIds.has(String(row.id))))
  .map((row) => ({ start: parseTime(isoTimeOf(row.start_at)), end: parseTime(isoTimeOf(row.end_at)) }));

// ¿El profesional está libre para [startMin, endMin) en la fecha dada?
const isEmployeeFreeForSlot = (employeeId, startMin, endMin, isoDate, bookings, availability, excludeIds) => {
  if (!employeeId) return true; // Indistinto: siempre válido (queda pendiente).
  const windows = availabilityWindowsFor(availability, employeeId, isoDate);
  if (!windows.some((window) => window.start <= startMin && window.end >= endMin)) return false;
  const busy = busyIntervalsFor(bookings, employeeId, isoDate, excludeIds);
  return !busy.some((interval) => interval.start < endMin && interval.end > startMin);
};

// Genera permutaciones de un arreglo (para reordenar pocos servicios).
const permutationsOf = (items) => {
  if (items.length <= 1) return [items];
  const result = [];
  items.forEach((item, index) => {
    const rest = items.slice(0, index).concat(items.slice(index + 1));
    permutationsOf(rest).forEach((perm) => result.push([item, ...perm]));
  });
  return result;
};

// Encadena un orden dado desde una hora de inicio y devuelve los items con horarios.
const chainOrder = (order, firstStartTime) => {
  let cursor = firstStartTime;
  return order.map((item) => {
    const startTime = cursor;
    cursor = addMinutesToTime(startTime, item.duration);
    return { ...item, startTime };
  });
};

// ¿Todos los profesionales asignados quedan libres en este orden encadenado?
const orderIsAllFree = (chained, isoDate, bookings, availability, excludeIds) => chained.every((item) => {
  if (!item.employeeId) return true;
  const startMin = parseTime(item.startTime);
  return isEmployeeFreeForSlot(item.employeeId, startMin, startMin + item.duration, isoDate, bookings, availability, excludeIds);
});

export default function NewBookingPanel({
  user,
  companySlug,
  companyContext,
  branchId = null,
  initialDate = null,
  initialStartTime = null,
  clientCanChooseEmployee = false,
  onClose,
  onBookingCreated
}) {
  const configuracionOperativa = companyContext?.configuracion_operativa || {};
  const gridInterval = getGridInterval(configuracionOperativa.intervalo_grilla_minutos);
  const preciosHabilitados = configuracionOperativa.precios_habilitados !== false;
  const companyName = companyContext?.company_name || companyContext?.name || 'Nueva reserva';

  // Modo cliente: reserva para sí mismo. Carga y guarda con RPCs de cliente.
  const isClient = user?.role === 'client';
  const clientAccountId = isClient && user?.isInternal ? user.id : null;
  // El cliente ve el combo de profesional solo si la plataforma lo habilita.
  const showEmployeePicker = !isClient || clientCanChooseEmployee;

  const sucursalesHabilitadas = configuracionOperativa.sucursales_habilitadas === true;
  const branches = useMemo(
    () => (Array.isArray(companyContext?.branches) ? companyContext.branches : []),
    [companyContext]
  );
  const showBranchSelector = sucursalesHabilitadas && branches.length > 0;

  // Abierto desde una casilla de la grilla: sucursal, dia y hora quedan fijos.
  // Desde el menu "Nueva reserva" (sin casilla) siguen siendo editables.
  const lockedFromSlot = Boolean(initialStartTime);

  const internalAdminAccountId = user?.isInternal && user?.role === 'admin' ? user.id : null;
  const internalEmployeeAccountId = user?.isInternal && user?.role === 'employee' ? user.id : null;
  const internalSessionToken = user?.isInternal ? user.sessionToken : null;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [services, setServices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeServices, setEmployeeServices] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [existingBookings, setExistingBookings] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [branchServices, setBranchServices] = useState([]);
  const [employeeBranches, setEmployeeBranches] = useState([]);

  const [date, setDate] = useState(initialDate || todayIso());
  const [startTime, setStartTime] = useState(() => {
    if (initialStartTime) return initialStartTime;
    const suggested = parseTime(defaultStartTime(gridInterval));
    const maxStart = Math.max(BUSINESS_OPEN_MIN, BUSINESS_CLOSE_MIN - gridInterval);
    return minutesToTime(Math.min(Math.max(suggested, BUSINESS_OPEN_MIN), maxStart));
  });
  const [customerName, setCustomerName] = useState(isClient ? (user?.displayName || '') : '');
  const [customerEmail, setCustomerEmail] = useState(isClient ? (user?.email || '') : '');
  const [comment, setComment] = useState('');
  const [cart, setCart] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(branchId || '');

  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState(null);
  const [depositEnabled, setDepositEnabled] = useState(false);
  const [showHoursModal, setShowHoursModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [waitlistNotice, setWaitlistNotice] = useState(false);
  const wasHoursExceeded = useRef(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);

    const branchRelationsRequest = showBranchSelector
      ? supabase.rpc('get_branch_relations', { company_slug_value: companySlug })
      : Promise.resolve({ data: { branchServices: [], employeeBranches: [] }, error: null });

    if (isClient) {
      // ---- Rol CLIENTE: opciones de reserva públicas + bundles del contexto ----
      const [optionsResult, branchRelationsResult] = await Promise.all([
        supabase.rpc('get_client_booking_options', { company_slug_value: companySlug }),
        branchRelationsRequest
      ]);

      if (optionsResult.error) {
        alert(`No se pudieron cargar los datos de reserva.\n${formatSupabaseError(optionsResult.error)}`);
        setIsLoading(false);
        return;
      }

      const options = optionsResult.data || {};
      setServices(Array.isArray(options.services) ? options.services : []);
      setEmployees(Array.isArray(options.employees) ? options.employees : []);
      setEmployeeServices(Array.isArray(options.employeeServices) ? options.employeeServices : []);
      setBundles(Array.isArray(companyContext?.bundles) ? companyContext.bundles : []);
      setExistingBookings(Array.isArray(options.bookings) ? options.bookings : []);
      setAvailability(Array.isArray(options.employeeAvailability) ? options.employeeAvailability : []);
      setBranchServices(branchRelationsResult.data?.branchServices || []);
      setEmployeeBranches(branchRelationsResult.data?.employeeBranches || []);
      setIsLoading(false);
      return;
    }

    if (internalEmployeeAccountId) {
      // ---- Rol EMPLEADO: workspace interno + bundles del contexto público ----
      const [workspaceResult, branchRelationsResult] = await Promise.all([
        supabase.rpc('get_internal_employee_workspace', {
          account_id_value: internalEmployeeAccountId,
          session_token_value: internalSessionToken,
          company_slug_value: companySlug
        }),
        branchRelationsRequest
      ]);

      if (workspaceResult.error) {
        alert(`No se pudieron cargar los datos de reserva.\n${formatSupabaseError(workspaceResult.error)}`);
        setIsLoading(false);
        return;
      }

      setServices(workspaceResult.data?.services || []);
      setEmployees(workspaceResult.data?.employees || []);
      setEmployeeServices(workspaceResult.data?.employeeServices || []);
      setBundles(Array.isArray(companyContext?.bundles) ? companyContext.bundles : []);
      setExistingBookings(workspaceResult.data?.bookings || []);
      setAvailability(workspaceResult.data?.agendaAvailability || workspaceResult.data?.availability || []);
      setBranchServices(branchRelationsResult.data?.branchServices || []);
      setEmployeeBranches(branchRelationsResult.data?.employeeBranches || []);
      setIsLoading(false);
      return;
    }

    // ---- Rol ADMIN (auth Supabase o sesión interna admin) ----
    const [adminResult, bundlesResult, branchRelationsResult] = await Promise.all([
      supabase.rpc('get_admin_panel_data', {
        account_id_value: internalAdminAccountId,
        session_token_value: internalSessionToken,
        request_status_value: null,
        company_slug_value: companySlug
      }),
      supabase.rpc('get_admin_bundles', {
        account_id_value: internalAdminAccountId,
        session_token_value: internalSessionToken,
        company_slug_value: companySlug
      }),
      branchRelationsRequest
    ]);

    if (adminResult.error) {
      alert(`No se pudieron cargar los datos de reserva.\n${formatSupabaseError(adminResult.error)}`);
      setIsLoading(false);
      return;
    }

    setServices(adminResult.data?.services || []);
    setEmployees(adminResult.data?.employees || []);
    setEmployeeServices(adminResult.data?.employeeServices || []);
    setBundles(Array.isArray(bundlesResult.data) ? bundlesResult.data : []);
    setExistingBookings(adminResult.data?.bookings || []);
    setAvailability(adminResult.data?.availability || []);
    setBranchServices(branchRelationsResult.data?.branchServices || []);
    setEmployeeBranches(branchRelationsResult.data?.employeeBranches || []);
    setIsLoading(false);
  }, [isClient, internalAdminAccountId, internalEmployeeAccountId, internalSessionToken, companySlug, showBranchSelector, companyContext]);

  useEffect(() => {
    const timeoutId = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadData]);

  // Sucursal activa: la elegida, o la primera si aún no se eligió.
  const activeBranchId = showBranchSelector ? (selectedBranchId || branches[0]?.id || '') : '';
  const activeBranchName = branches.find((branch) => String(branch.id) === String(activeBranchId))?.name || '';

  const servicesById = useMemo(() => {
    const map = new Map();
    services.forEach((service) => map.set(String(service.id), service));
    return map;
  }, [services]);

  // ¿El servicio se ofrece en la sucursal activa?
  const serviceOfferedAtBranch = useCallback((serviceId) => {
    if (!showBranchSelector || !activeBranchId) return true;
    return branchServices.some((relation) =>
      String(relation.branch_id) === String(activeBranchId) && String(relation.service_id) === String(serviceId));
  }, [showBranchSelector, activeBranchId, branchServices]);

  // ¿El profesional trabaja en la sucursal activa?
  const employeeAtBranch = useCallback((employeeId) => {
    if (!showBranchSelector || !activeBranchId) return true;
    return employeeBranches.some((relation) =>
      String(relation.branch_id) === String(activeBranchId) && String(relation.employee_id) === String(employeeId));
  }, [showBranchSelector, activeBranchId, employeeBranches]);

  const activeServices = useMemo(
    () => services.filter((service) => service.active !== false && serviceOfferedAtBranch(service.id)),
    [services, serviceOfferedAtBranch]
  );

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.active !== false && !employee.deleted_at),
    [employees]
  );

  // Empleados que atienden un servicio puntual (y trabajan en la sucursal activa).
  const employeesForService = useCallback((serviceId) => {
    const allowedIds = new Set(
      employeeServices
        .filter((relation) => String(relation.service_id) === String(serviceId))
        .map((relation) => String(relation.employee_id))
    );
    return activeEmployees.filter((employee) => allowedIds.has(String(employee.id)) && employeeAtBranch(employee.id));
  }, [employeeServices, activeEmployees, employeeAtBranch]);

  // ¿El profesional está libre para el tramo (hora + duración) en la fecha elegida?
  const employeeFreeForSlot = useCallback(
    (employeeId, startTime, duration) => isEmployeeFreeForSlot(
      employeeId,
      parseTime(startTime),
      parseTime(startTime) + Number(duration || 0),
      date,
      existingBookings,
      availability
    ),
    [date, existingBookings, availability]
  );

  const serviceDuration = useCallback(
    (service) => snapDuration(service?.default_duration, gridInterval),
    [gridInterval]
  );

  // Hora de inicio sugerida para el proximo item (encadenado sin huecos).
  const nextStartTime = useCallback(() => {
    if (cart.length === 0) return startTime;
    const last = cart[cart.length - 1];
    return addMinutesToTime(last.startTime, last.duration);
  }, [cart, startTime]);

  // Opciones de hora de inicio dentro del horario de atención.
  const startTimeOptions = useMemo(() => {
    const options = [];
    for (let minutes = BUSINESS_OPEN_MIN; minutes <= BUSINESS_CLOSE_MIN - gridInterval; minutes += gridInterval) {
      options.push(minutesToTime(minutes));
    }
    return options;
  }, [gridInterval]);

  // Cambiar la hora de inicio re-encadena el carrito manteniendo el orden.
  const handleStartTimeChange = useCallback((value) => {
    setStartTime(value);
    setCart((prev) => (prev.length ? chainOrder(prev, value) : prev));
  }, []);

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.price || 0), 0),
    [cart]
  );

  // Motivo por el que la reserva no entra en el horario de atención (o '').
  const hoursIssue = useMemo(() => businessHoursIssue(cart, date), [cart, date]);

  // Avisa con un modal cuando la reserva pasa a estar fuera del horario.
  useEffect(() => {
    const exceeded = Boolean(hoursIssue);
    if (exceeded && !wasHoursExceeded.current) setShowHoursModal(true);
    wasHoursExceeded.current = exceeded;
  }, [hoursIssue]);

  // Claves de los items del carrito cuyo profesional asignado quedó ocupado.
  const conflictingKeys = useMemo(() => {
    const keys = new Set();
    cart.forEach((item) => {
      if (item.employeeId && !employeeFreeForSlot(item.employeeId, item.startTime, item.duration)) {
        keys.add(item.key);
      }
    });
    return keys;
  }, [cart, employeeFreeForSlot]);

  // Intenta un orden de los servicios en el que todos los profesionales queden libres.
  const findAvailableOrder = useCallback(() => {
    if (cart.length < 2) return null;
    const firstStart = cart[0].startTime;
    const orders = permutationsOf(cart);
    for (const order of orders) {
      const chained = chainOrder(order, firstStart);
      if (orderIsAllFree(chained, date, existingBookings, availability)) return chained;
    }
    return null;
  }, [cart, date, existingBookings, availability]);

  // Reordena automáticamente cuando hay conflicto y existe un orden válido distinto.
  useEffect(() => {
    if (conflictingKeys.size === 0 || cart.length < 2) return;
    const ordered = findAvailableOrder();
    if (!ordered) return;
    const changed = ordered.some((item, index) => item.key !== cart[index].key);
    if (changed) setCart(ordered);
  }, [conflictingKeys, findAvailableOrder, cart]);

  const packsHabilitados = configuracionOperativa.packs_habilitados === true;
  const promosHabilitadas = configuracionOperativa.promociones_habilitadas === true;

  const visibleBundles = useMemo(() => bundles.filter((bundle) => {
    if (bundle.type === 'pack') return packsHabilitados;
    if (bundle.type === 'promo') return promosHabilitadas;
    return false;
  }), [bundles, packsHabilitados, promosHabilitadas]);

  /* =========================
     CARRITO
  ========================= */

  const removeItem = (key) => {
    setCart((current) => {
      const target = current.find((item) => item.key === key);
      // Los servicios de un pack/promo se quitan como bloque: se borra toda la promo.
      const filtered = target?.bundleId
        ? current.filter((item) => item.bundleId !== target.bundleId)
        : current.filter((item) => item.key !== key);
      // Re-encadenar horarios manteniendo el inicio del primero.
      if (filtered.length === 0) return filtered;
      let cursor = filtered[0].startTime;
      return filtered.map((item, index) => {
        const startTime = index === 0 ? item.startTime : cursor;
        cursor = addMinutesToTime(startTime, item.duration);
        return { ...item, startTime };
      });
    });
  };

  const updateItemEmployee = (key, employeeId) => {
    setCart((current) => current.map((item) => (item.key === key ? { ...item, employeeId } : item)));
  };

  const addServiceToCart = ({ service, startTime, employeeId, bundle = null, price = null }) => {
    const duration = serviceDuration(service);
    const item = {
      key: `${service.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      serviceId: service.id,
      name: service.name,
      icon: service.icon,
      color: service.color,
      duration,
      price: preciosHabilitados ? Number(price ?? service.base_price ?? 0) : 0,
      startTime,
      employeeId: employeeId || '',
      bundleId: bundle?.id || null,
      bundleType: bundle?.type || null,
      bundleName: bundle?.name || null
    };
    setCart((current) => [...current, item]);
  };

  const addBundleToCart = (bundle) => {
    const sortedItems = [...(bundle.items || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
    let cursor = nextStartTime();
    const newItems = [];
    sortedItems.forEach((bundleItem) => {
      const service = servicesById.get(String(bundleItem.service_id));
      if (!service) return;
      const duration = serviceDuration(service);
      const startTime = cursor;
      cursor = addMinutesToTime(startTime, duration);
      const price = bundle.type === 'pack'
        ? Number(service.base_price || 0)
        : Number(bundleItem.price || 0);
      newItems.push({
        key: `${service.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        serviceId: service.id,
        name: service.name,
        icon: service.icon,
        color: service.color,
        duration,
        price: preciosHabilitados ? price : 0,
        startTime,
        employeeId: '',
        bundleId: bundle.id,
        bundleType: bundle.type,
        bundleName: bundle.name
      });
    });
    if (newItems.length) setCart((current) => [...current, ...newItems]);
    setIsServiceModalOpen(false);
  };

  /* =========================
     SELECCION DE SERVICIO
  ========================= */

  const handlePickService = (service) => {
    setIsServiceModalOpen(false);
    const options = employeesForService(service.id);
    setConfigDraft({
      service,
      startTime: nextStartTime(),
      duration: serviceDuration(service),
      employeeId: options.length === 1 ? String(options[0].id) : '',
      price: preciosHabilitados ? Number(service.base_price || 0) : 0
    });
  };

  const confirmConfigDraft = () => {
    if (!configDraft) return;
    addServiceToCart({
      service: configDraft.service,
      startTime: configDraft.startTime,
      employeeId: configDraft.employeeId,
      price: configDraft.price
    });
    setConfigDraft(null);
  };

  /* =========================
     CONFIRMAR
  ========================= */

  const confirmReservation = async () => {
    if (cart.length === 0) return;
    if (showBranchSelector && !activeBranchId) {
      alert('Elegí la sucursal para la reserva.');
      return;
    }
    if (hoursIssue) {
      setShowHoursModal(true);
      return;
    }
    if (conflictingKeys.size > 0) {
      alert('Hay servicios con un profesional ocupado en su horario. Cambiá el profesional o dejalo en «Indistinto» para continuar.');
      return;
    }
    setIsSaving(true);

    if (isClient) {
      // Cada servicio del carrito genera una solicitud de turno del cliente.
      const stampBranchId = activeBranchId || branchId || null;
      for (const item of cart) {
        const startAt = `${date}T${item.startTime}:00`;
        const endAt = `${date}T${addMinutesToTime(item.startTime, item.duration)}:00`;
        const description = item.bundleName
          ? [item.bundleName, comment].filter(Boolean).join(' · ')
          : (comment || null);

        const { data, error } = await supabase.rpc('request_client_booking', {
          service_id_value: item.serviceId || null,
          employee_id_value: clientCanChooseEmployee ? (item.employeeId || null) : null,
          booking_description_value: description,
          start_at_value: startAt,
          end_at_value: endAt,
          customer_name_value: customerName || null,
          customer_email_value: customerEmail || null,
          company_slug_value: companySlug,
          account_id_value: clientAccountId,
          session_token_value: internalSessionToken
        });

        if (error) {
          setIsSaving(false);
          alert(`No se pudo confirmar la reserva.\n${formatSupabaseError(error)}`);
          return;
        }

        if (stampBranchId && data?.id) {
          await supabase.rpc('set_booking_branch', {
            booking_id_value: data.id,
            branch_id_value: stampBranchId,
            company_slug_value: companySlug
          });
        }
      }

      setIsSaving(false);
      const [, cMonth, cDay] = String(date).split('-');
      setSuccessMessage(`Reservaste turno para el ${cDay}/${cMonth}. Muchas gracias.`);
      return;
    }

    const items = cart.map((item) => ({
      service_id: item.serviceId,
      employee_id: item.employeeId || null,
      start_at: `${date}T${item.startTime}:00`,
      end_at: `${date}T${addMinutesToTime(item.startTime, item.duration)}:00`,
      item_price: preciosHabilitados ? Number(item.price || 0) : null,
      bundle_id: item.bundleId || null,
      bundle_type: item.bundleType || null
    }));

    const { data, error } = await supabase.rpc('create_admin_booking_group', {
      items_value: items,
      customer_name_value: customerName || null,
      customer_email_value: customerEmail || null,
      booking_description_value: comment || null,
      branch_id_value: activeBranchId || branchId || null,
      account_id_value: internalAdminAccountId || internalEmployeeAccountId,
      session_token_value: internalSessionToken,
      company_slug_value: companySlug
    });

    setIsSaving(false);

    if (error) {
      alert(`No se pudo confirmar la reserva.\n${formatSupabaseError(error)}`);
      return;
    }

    const createdBookings = Array.isArray(data?.bookings) ? data.bookings : [];
    const hasWaitlist = createdBookings.some(
      (booking) => String(booking?.status || '').toLowerCase() === 'waitlist'
    );

    if (hasWaitlist) {
      setWaitlistNotice(true);
      return;
    }

    const [year, month, day] = String(date).split('-');
    setSuccessMessage(`Reservaste turno para el ${day}/${month}. Muchas gracias.`);
  };

  const configOptions = configDraft ? employeesForService(configDraft.service.id) : [];

  return (
    <div className="new-booking-overlay" role="dialog" aria-modal="true">
      <div className="new-booking-panel">
        <header className="new-booking-header">
          <div className="new-booking-header-title">
            <span className="new-booking-header-icon" aria-hidden="true">🗓️</span>
            <div>
              <h2>Nueva reserva</h2>
              <p>{showBranchSelector && activeBranchName ? activeBranchName : companyName}</p>
            </div>
          </div>
          <button type="button" className="new-booking-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>

        <div className="new-booking-body">
          {isLoading ? (
            <div className="new-booking-loading">Cargando datos…</div>
          ) : (
            <>
              {showBranchSelector && (
                <div className="new-booking-field">
                  <span className="new-booking-label">Sucursal</span>
                  <div className="new-booking-branch-pills" role="group" aria-label="Seleccionar sucursal">
                    {branches.map((branch) => (
                      <button
                        key={branch.id}
                        type="button"
                        className={`new-booking-branch-pill ${String(activeBranchId) === String(branch.id) ? 'is-selected' : ''}`}
                        disabled={lockedFromSlot}
                        onClick={() => {
                          if (lockedFromSlot) return;
                          setSelectedBranchId(branch.id);
                          setCart([]);
                        }}
                      >
                        {branch.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="new-booking-field">
                <span className="new-booking-label">Día de la reserva</span>
                <input type="date" value={date} min={todayIso()} disabled={lockedFromSlot} onChange={(event) => setDate(event.target.value)} />
                <span className="new-booking-day-hint">{formatDayLabel(date)}</span>
              </label>

              <label className="new-booking-field">
                <span className="new-booking-label">Hora de inicio</span>
                <select value={startTime} disabled={lockedFromSlot} onChange={(event) => handleStartTimeChange(event.target.value)}>
                  {!startTimeOptions.includes(startTime) && (
                    <option value={startTime}>{startTime} hs</option>
                  )}
                  {startTimeOptions.map((option) => (
                    <option key={option} value={option}>{option} hs</option>
                  ))}
                </select>
                <span className="new-booking-day-hint">
                  {lockedFromSlot
                    ? 'Sucursal, día y hora vienen de la casilla elegida. Para cambiarlos, cerrá y elegí otra casilla.'
                    : 'Horario de atención: 9 a 18 hs'}
                </span>
              </label>

              <div className="new-booking-field">
                <span className="new-booking-label">Cliente de la reserva</span>
                <input
                  type="text"
                  placeholder="Nombre del cliente (opcional)"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                />
                <input
                  type="email"
                  placeholder="Email del cliente (opcional)"
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                />
              </div>

              <div className="new-booking-field">
                <span className="new-booking-label">Servicios</span>
                {cart.length === 0 ? (
                  <button type="button" className="new-booking-select-service" onClick={() => setIsServiceModalOpen(true)}>
                    <span>Seleccionar servicio</span>
                    <span aria-hidden="true">›</span>
                  </button>
                ) : (
                  <>
                    <ul className="new-booking-cart">
                      {cart.map((item) => {
                        const options = employeesForService(item.serviceId);
                        const endTime = addMinutesToTime(item.startTime, item.duration);
                        const isBundle = Boolean(item.bundleId);
                        const hasConflict = conflictingKeys.has(item.key);
                        return (
                          <li
                            key={item.key}
                            className={`new-booking-cart-item${hasConflict ? ' has-conflict' : ''}`}
                            style={{ '--item-color': item.color || '#24aebb' }}
                          >
                            <div className="new-booking-cart-main">
                              <span className="new-booking-cart-name">
                                <ActivityIcon service={item} size="small" /> {item.name}
                                {item.bundleName && <span className="new-booking-cart-badge">{item.bundleType === 'promo' ? '🔥' : '🎁'} {item.bundleName}</span>}
                              </span>
                              <button
                                type="button"
                                className="new-booking-cart-remove"
                                onClick={() => removeItem(item.key)}
                                aria-label={isBundle ? `Quitar ${item.bundleType === 'promo' ? 'promo' : 'pack'} completo` : 'Quitar servicio'}
                                title={isBundle ? `Quitar ${item.bundleType === 'promo' ? 'la promo' : 'el pack'} completo` : 'Quitar servicio'}
                              >🗑️</button>
                            </div>
                            <div className="new-booking-cart-meta">
                              <span>🕒 {item.startTime} - {endTime}</span>
                              <span>⏱️ {formatDurationLabel(item.duration)}</span>
                              {preciosHabilitados && <span className="new-booking-cart-price">{formatPrice(item.price)}</span>}
                            </div>
                            {showEmployeePicker && (
                              <label className="new-booking-cart-employee">
                                <span>Profesional</span>
                                <select value={item.employeeId} onChange={(event) => updateItemEmployee(item.key, event.target.value)}>
                                  <option value="">Indistinto (asigna el admin)</option>
                                  {options.map((employee) => {
                                    const busy = !employeeFreeForSlot(String(employee.id), item.startTime, item.duration);
                                    const selected = String(item.employeeId) === String(employee.id);
                                    return (
                                      <option key={employee.id} value={String(employee.id)} disabled={busy && !selected}>
                                        {employee.name}{busy ? ' (ocupado)' : ''}
                                      </option>
                                    );
                                  })}
                                </select>
                                {hasConflict && (
                                  <span className="new-booking-cart-warning">⚠️ Ese profesional ya está ocupado en este horario. Elegí otro o dejalo en «Indistinto».</span>
                                )}
                              </label>
                            )}
                            {isBundle && (
                              <p className="new-booking-cart-bundle-note">Forma parte de {item.bundleType === 'promo' ? 'la promo' : 'el pack'} «{item.bundleName}». Al quitarlo se elimina completo.</p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <button type="button" className="new-booking-add-more" onClick={() => setIsServiceModalOpen(true)}>
                      ＋ Agregar otro servicio
                    </button>
                  </>
                )}
              </div>

              {!isClient && (
                <div className="new-booking-field new-booking-deposit">
                  <div className="new-booking-deposit-info">
                    <span className="new-booking-deposit-icon" aria-hidden="true">💳</span>
                    <div>
                      <span className="new-booking-label">Configurar Seña</span>
                      <p className="new-booking-deposit-hint">¿Este turno requiere seña?</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`new-booking-toggle ${depositEnabled ? 'is-on' : ''}`}
                    onClick={() => setDepositEnabled((value) => !value)}
                    aria-pressed={depositEnabled}
                    title="Próximamente"
                  >
                    <span className="new-booking-toggle-knob" />
                  </button>
                </div>
              )}

              <label className="new-booking-field">
                <span className="new-booking-label">Comentario <span className="new-booking-optional">(opcional)</span></span>
                <textarea
                  rows={3}
                  placeholder="Ej: Alergia a productos, primera vez, etc."
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                />
              </label>
            </>
          )}
        </div>

        <footer className="new-booking-footer">
          {preciosHabilitados && (
            <div className="new-booking-total">
              <span>Monto total</span>
              <strong>{formatPrice(cartTotal)}</strong>
            </div>
          )}
          <button
            type="button"
            className="new-booking-confirm"
            disabled={cart.length === 0 || isSaving || conflictingKeys.size > 0 || Boolean(hoursIssue)}
            onClick={confirmReservation}
          >
            {isSaving ? 'Confirmando…' : 'Confirmar reserva →'}
          </button>
          {cart.length === 0 && <p className="new-booking-footer-hint">Seleccioná al menos un servicio para continuar</p>}
          {cart.length > 0 && Boolean(hoursIssue) && (
            <p className="new-booking-footer-hint new-booking-footer-warning">{hoursIssue}</p>
          )}
          {cart.length > 0 && conflictingKeys.size > 0 && (
            <p className="new-booking-footer-hint new-booking-footer-warning">Reacomodamos los servicios, pero alguno sigue con el profesional ocupado. Cambiá el profesional para continuar.</p>
          )}
        </footer>
      </div>

      {/* MODAL SELECCIONAR SERVICIO */}
      {isServiceModalOpen && (
        <div className="new-booking-modal">
          <div className="new-booking-modal-card">
            <header className="new-booking-modal-header">
              <h3>Seleccionar servicio</h3>
              <button type="button" onClick={() => setIsServiceModalOpen(false)} aria-label="Cerrar">✕</button>
            </header>
            <div className="new-booking-modal-body">
              {visibleBundles.length > 0 && (
                <div className="new-booking-modal-group">
                  <span className="new-booking-modal-group-title">Packs y promos</span>
                  {visibleBundles.map((bundle) => {
                    const totalDuration = (bundle.items || []).reduce((sum, bundleItem) => {
                      const service = servicesById.get(String(bundleItem.service_id));
                      return sum + serviceDuration(service);
                    }, 0);
                    const totalPrice = (bundle.items || []).reduce((sum, bundleItem) => {
                      const service = servicesById.get(String(bundleItem.service_id));
                      const price = bundle.type === 'pack' ? Number(service?.base_price || 0) : Number(bundleItem.price || 0);
                      return sum + price;
                    }, 0);
                    return (
                      <button type="button" key={`bundle-${bundle.id}`} className="new-booking-option" onClick={() => addBundleToCart(bundle)}>
                        <span className="new-booking-option-main">
                          <span className="new-booking-option-name">
                            {bundle.type === 'promo' ? '🔥' : '🎁'} {bundle.name}
                            <span className={`new-booking-option-tag ${bundle.type === 'promo' ? 'is-promo' : 'is-pack'}`}>{bundle.type === 'promo' ? 'Promo' : 'Pack'}</span>
                          </span>
                          <span className="new-booking-option-sub">{formatDurationLabel(totalDuration)} · {(bundle.items || []).length} servicios</span>
                        </span>
                        {preciosHabilitados && <span className="new-booking-option-price">{formatPrice(totalPrice)} ›</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="new-booking-modal-group">
                <span className="new-booking-modal-group-title">Servicios</span>
                {activeServices.length === 0 ? (
                  <div className="new-booking-empty">No hay servicios disponibles.</div>
                ) : activeServices.map((service) => (
                  <button type="button" key={`service-${service.id}`} className="new-booking-option" onClick={() => handlePickService(service)}>
                    <span className="new-booking-option-main">
                      <span className="new-booking-option-name"><ActivityIcon service={service} size="small" /> {service.name}</span>
                      <span className="new-booking-option-sub">{formatDurationLabel(serviceDuration(service))}</span>
                    </span>
                    {preciosHabilitados && <span className="new-booking-option-price">{formatPrice(service.base_price)} ›</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-MODAL CONFIGURAR SERVICIO */}
      {configDraft && (
        <div className="new-booking-modal">
          <div className="new-booking-modal-card new-booking-config-card">
            <header className="new-booking-modal-header">
              <h3>Configurar servicio</h3>
              <button type="button" onClick={() => setConfigDraft(null)} aria-label="Cerrar">✕</button>
            </header>
            <div className="new-booking-modal-body">
              <div className="new-booking-config-service" style={{ '--item-color': configDraft.service.color || '#24aebb' }}>
                <span className="new-booking-option-name"><ActivityIcon service={configDraft.service} size="small" /> {configDraft.service.name}</span>
                {preciosHabilitados && <span className="new-booking-option-price">{formatPrice(configDraft.price)}</span>}
              </div>

              <div className="new-booking-config-grid">
                <label className="new-booking-field">
                  <span className="new-booking-label">Hora de inicio</span>
                  <input
                    type="time"
                    step={gridInterval * 60}
                    value={configDraft.startTime}
                    onChange={(event) => setConfigDraft((draft) => ({ ...draft, startTime: event.target.value }))}
                  />
                </label>
                <label className="new-booking-field">
                  <span className="new-booking-label">Duración</span>
                  <input type="text" value={formatDurationLabel(configDraft.duration)} readOnly />
                </label>
                {showEmployeePicker && (
                  <label className="new-booking-field">
                    <span className="new-booking-label">Profesional</span>
                    <select
                      value={configDraft.employeeId}
                      onChange={(event) => setConfigDraft((draft) => ({ ...draft, employeeId: event.target.value }))}
                    >
                      <option value="">Indistinto (asigna el admin)</option>
                      {configOptions.map((employee) => {
                        const busy = !employeeFreeForSlot(String(employee.id), configDraft.startTime, configDraft.duration);
                        return (
                          <option key={employee.id} value={String(employee.id)} disabled={busy}>
                            {employee.name}{busy ? ' (ocupado)' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                )}
                {!isClient && (
                  <label className="new-booking-field">
                    <span className="new-booking-label">Costo adicional <span className="new-booking-optional">(próximamente)</span></span>
                    <input type="number" value={0} disabled title="Próximamente" />
                  </label>
                )}
              </div>
            </div>
            <footer className="new-booking-modal-footer">
              <button type="button" className="new-booking-back" onClick={() => setConfigDraft(null)}>← Volver</button>
              <button type="button" className="new-booking-config-confirm" onClick={confirmConfigDraft}>Seleccionar</button>
            </footer>
          </div>
        </div>
      )}

      {/* MODAL FUERA DE HORARIO DE ATENCIÓN */}
      {showHoursModal && hoursIssue && (
        <div className="new-booking-modal">
          <div className="new-booking-modal-card new-booking-alert-card">
            <div className="new-booking-alert-body">
              <span className="new-booking-alert-icon" aria-hidden="true">🕐</span>
              <p>{hoursIssue}</p>
            </div>
            <footer className="new-booking-modal-footer new-booking-alert-footer">
              <button type="button" className="new-booking-config-confirm" onClick={() => setShowHoursModal(false)}>OK</button>
            </footer>
          </div>
        </div>
      )}

      {/* MODAL LISTA DE ESPERA */}
      {waitlistNotice && (
        <div className="new-booking-modal">
          <div className="new-booking-modal-card new-booking-alert-card">
            <div className="new-booking-alert-body">
              <span className="new-booking-alert-icon" aria-hidden="true">⏳</span>
              <p>Lista de espera porque no hay profesionales con disponibilidad todavía para ese horario.</p>
              <p>El turno se guardó igual, pero puede cancelarse. Te estaremos avisando.</p>
            </div>
            <footer className="new-booking-modal-footer new-booking-alert-footer">
              <button
                type="button"
                className="new-booking-config-confirm"
                onClick={() => {
                  setWaitlistNotice(false);
                  onBookingCreated?.();
                  onClose?.();
                }}
              >
                Entendido
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* MODAL RESERVA CONFIRMADA */}
      {successMessage && (
        <div className="new-booking-modal">
          <div className="new-booking-modal-card new-booking-alert-card">
            <div className="new-booking-alert-body">
              <span className="new-booking-alert-icon" aria-hidden="true">✅</span>
              <p>{successMessage}</p>
            </div>
            <footer className="new-booking-modal-footer new-booking-alert-footer">
              <button
                type="button"
                className="new-booking-config-confirm"
                onClick={() => {
                  setSuccessMessage('');
                  onBookingCreated?.();
                  onClose?.();
                }}
              >
                OK
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
