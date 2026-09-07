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

const isoToDisplayDate = (isoDate) => {
  const [year, month, day] = String(isoDate || '').split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
};

const displayDateToIso = (value) => {
  const trimmed = String(value || '').trim();
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const dayNumber = Number(day);
  const monthNumber = Number(month);
  const yearNumber = Number(year);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31 || yearNumber < 1900) return null;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== yearNumber || date.getMonth() + 1 !== monthNumber || date.getDate() !== dayNumber) return null;
  return iso;
};

const PRODUCT_NAME_SEPARATOR = '::';
const parseProductName = (value) => {
  const raw = String(value || '').trim();
  if (!raw.includes(PRODUCT_NAME_SEPARATOR)) return { group: '', name: raw };
  const [groupRaw, ...rest] = raw.split(PRODUCT_NAME_SEPARATOR);
  return {
    group: String(groupRaw || '').trim(),
    name: rest.join(PRODUCT_NAME_SEPARATOR).trim() || raw
  };
};

const createEmptyAddonRow = (kind = '') => ({
  key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  kind,
  quantity: 1,
  unitPrice: 0
});

const buildAddonsSummary = (rows) => {
  if (!Array.isArray(rows)) return '';
  const normalized = rows
    .map((row) => ({
      kind: String(row?.kind || '').trim(),
      quantity: Math.max(1, Number(row?.quantity || 1)),
      unitPrice: Math.max(0, Number(row?.unitPrice || 0))
    }))
    .filter((row) => row.kind);
  if (normalized.length === 0) return '';
  return normalized
    .map((row) => {
      const priceLabel = row.unitPrice > 0 ? ` ($ ${Number(row.unitPrice).toLocaleString('es-AR')} c/u)` : '';
      return `${row.kind} x${row.quantity}${priceLabel}`;
    })
    .join(' | ');
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
  onBookingCreated,
  rescheduleMode = false
}) {
  const configuracionOperativa = companyContext?.configuracion_operativa || {};
  const esModoPedido = true;
  const gridInterval = getGridInterval(configuracionOperativa.intervalo_grilla_minutos);
  const preciosHabilitados = configuracionOperativa.precios_habilitados !== false;
  const companyName = companyContext?.company_name || companyContext?.name || 'Nueva reserva';

  // Modo cliente: reserva para sí mismo. Carga y guarda con RPCs de cliente.
  const isClient = user?.role === 'client';
  const clientAccountId = isClient && user?.isInternal ? user.id : null;
  // El cliente ve el combo de profesional solo si la plataforma lo habilita.
  const showEmployeePicker = !esModoPedido && (!isClient || clientCanChooseEmployee);

  const sucursalesHabilitadas = configuracionOperativa.sucursales_habilitadas === true;
  const branches = useMemo(
    () => (Array.isArray(companyContext?.branches) ? companyContext.branches : []),
    [companyContext]
  );
  const showBranchSelector = branches.length > 0 && (sucursalesHabilitadas || esModoPedido);

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
  const [dateDisplay, setDateDisplay] = useState(() => isoToDisplayDate(initialDate || todayIso()));
  const [startTime, setStartTime] = useState(() => {
    if (initialStartTime) return initialStartTime;
    const suggested = parseTime(defaultStartTime(gridInterval));
    const maxStart = Math.max(BUSINESS_OPEN_MIN, BUSINESS_CLOSE_MIN - gridInterval);
    return minutesToTime(Math.min(Math.max(suggested, BUSINESS_OPEN_MIN), maxStart));
  });
  const [customerName, setCustomerName] = useState(isClient ? (user?.displayName || '') : '');
  const [customerEmail, setCustomerEmail] = useState(isClient ? (user?.email || '') : '');
  const emailFormatValid = !customerEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim());
  const [clientResults, setClientResults] = useState([]);
  const [showClientResults, setShowClientResults] = useState(false);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [bookForSelf, setBookForSelf] = useState(false);
  const [selectedClientAccountId, setSelectedClientAccountId] = useState(null);
  const suppressClientSearchRef = useRef(false);
  const [comment, setComment] = useState('');
  const [pedidoAddons, setPedidoAddons] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(branchId || '');

  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState(null);
  const [productQuantities, setProductQuantities] = useState({});
  const [depositEnabled, setDepositEnabled] = useState(false);
  const [showHoursModal, setShowHoursModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [waitlistNotice, setWaitlistNotice] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const wasHoursExceeded = useRef(false);

  // Autocompletado de clientes existentes para admin / empleado.
  const internalManagerAccountId = internalAdminAccountId || internalEmployeeAccountId;

  useEffect(() => {
    setDateDisplay(isoToDisplayDate(date));
  }, [date]);

  useEffect(() => {
    if (isClient || bookForSelf) {
      setClientResults([]);
      setShowClientResults(false);
      return undefined;
    }
    if (suppressClientSearchRef.current) {
      suppressClientSearchRef.current = false;
      return undefined;
    }
    const term = customerName.trim();
    if (term.length < 2) {
      setClientResults([]);
      setShowClientResults(false);
      return undefined;
    }

    let active = true;
    setClientSearchLoading(true);
    const handle = setTimeout(async () => {
      const { data, error } = await supabase.rpc('list_company_clients', {
        account_id_value: internalManagerAccountId,
        session_token_value: internalSessionToken,
        company_slug_value: companySlug,
        search_value: term
      });
      if (!active) return;
      setClientSearchLoading(false);
      if (!error && Array.isArray(data)) {
        setClientResults(data.slice(0, 8));
        setShowClientResults(true);
      } else {
        setClientResults([]);
        setShowClientResults(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [customerName, bookForSelf, isClient, internalManagerAccountId, internalSessionToken, companySlug]);

  const selectClient = (client) => {
    suppressClientSearchRef.current = true;
    setCustomerName(client.display_name || '');
    setCustomerEmail(client.email || '');
    setSelectedClientAccountId(client.id || null);
    setShowClientResults(false);
    setClientResults([]);
  };

  const toggleBookForSelf = (checked) => {
    suppressClientSearchRef.current = true;
    setBookForSelf(checked);
    setSelectedClientAccountId(null);
    setShowClientResults(false);
    setClientResults([]);
    if (checked) {
      setCustomerName(user?.username || user?.displayName || '');
      setCustomerEmail(user?.email || '');
    } else {
      setCustomerName('');
      setCustomerEmail('');
    }
  };

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

  const groupedProducts = useMemo(() => {
    if (!esModoPedido) return [];
    const map = new Map();
    activeServices.forEach((service) => {
      const parsed = parseProductName(service.name);
      const group = parsed.group || 'Productos';
      const rows = map.get(group) || [];
      rows.push({ service, parsed });
      map.set(group, rows);
    });

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([group, rows]) => ({
        group,
        rows: rows.sort((a, b) => a.parsed.name.localeCompare(b.parsed.name, 'es'))
      }));
  }, [activeServices, esModoPedido]);

  const modalSelectedProductsTotal = useMemo(() => {
    if (!esModoPedido) return 0;
    return activeServices.reduce((sum, service) => {
      const quantity = Math.max(0, Number(productQuantities[service.id] || 0));
      const unitPrice = Number(service.base_price || 0);
      return sum + quantity * unitPrice;
    }, 0);
  }, [activeServices, productQuantities, esModoPedido]);

  const confirmProductsGroupedByType = useMemo(() => {
    if (!esModoPedido) return [];
    const grouped = new Map();
    cart.forEach((item) => {
      const parsed = parseProductName(item.name);
      const type = parsed.group || 'General';
      const bucket = grouped.get(type) || [];
      bucket.push({
        key: item.key,
        name: parsed.name || item.name,
        quantity: Math.max(1, Number(item.quantity || 1))
      });
      grouped.set(type, bucket);
    });

    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([type, lines]) => ({
        type,
        lines: lines.sort((a, b) => a.name.localeCompare(b.name, 'es'))
      }));
  }, [cart, esModoPedido]);

  // Motivo por el que la reserva no entra en el horario de atención (o '').
  const hoursIssue = useMemo(() => (esModoPedido ? '' : businessHoursIssue(cart, date)), [cart, date, esModoPedido]);

  // Avisa con un modal cuando la reserva pasa a estar fuera del horario.
  useEffect(() => {
    const exceeded = Boolean(hoursIssue);
    if (exceeded && !wasHoursExceeded.current) setShowHoursModal(true);
    wasHoursExceeded.current = exceeded;
  }, [hoursIssue]);

  // Claves de los items del carrito cuyo profesional asignado quedó ocupado.
  const conflictingKeys = useMemo(() => {
    if (esModoPedido) return new Set();
    const keys = new Set();
    cart.forEach((item) => {
      if (item.employeeId && !employeeFreeForSlot(item.employeeId, item.startTime, item.duration)) {
        keys.add(item.key);
      }
    });
    return keys;
  }, [cart, employeeFreeForSlot, esModoPedido]);

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

  const normalizedPedidoAddons = useMemo(() => pedidoAddons
    .map((row) => ({
      kind: String(row?.kind || '').trim(),
      quantity: Math.max(1, Number(row?.quantity || 1)),
      unitPrice: Math.max(0, Number(row?.unitPrice || 0))
    }))
    .filter((row) => row.kind), [pedidoAddons]);

  const addonsTotal = useMemo(() => {
    if (!esModoPedido || !preciosHabilitados) return 0;
    return normalizedPedidoAddons.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
  }, [normalizedPedidoAddons, esModoPedido, preciosHabilitados]);

  const orderTotal = useMemo(() => cartTotal + addonsTotal, [cartTotal, addonsTotal]);

  const pedidoCommentSummary = useMemo(() => buildAddonsSummary(normalizedPedidoAddons), [normalizedPedidoAddons]);

  const bookingComment = useMemo(() => {
    if (!esModoPedido) return comment || null;
    const parts = [String(comment || '').trim()];
    if (pedidoCommentSummary) parts.push(`Agregados: ${pedidoCommentSummary}`);
    const merged = parts.filter(Boolean).join(' · ');
    return merged || null;
  }, [comment, pedidoCommentSummary, esModoPedido]);

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

  const updatePedidoItemQuantity = (key, nextQuantity) => {
    const parsedQuantity = Math.max(0, Number(nextQuantity || 0));
    setCart((current) => current
      .map((item) => {
        if (item.key !== key) return item;
        if (!esModoPedido || item.bundleId) return item;
        if (parsedQuantity <= 0) return null;
        const unitPrice = Number(item.unitPrice ?? item.base_price ?? 0);
        return {
          ...item,
          quantity: parsedQuantity,
          price: unitPrice * parsedQuantity
        };
      })
      .filter(Boolean));
  };

  const syncPedidoProductsToCart = (quantities) => {
    const selectedRows = activeServices
      .map((service) => ({ service, quantity: Math.max(0, Number(quantities[service.id] || 0)) }))
      .filter((row) => row.quantity > 0);

    if (selectedRows.length === 0) {
      alert('Seleccioná al menos un producto con cantidad mayor a cero.');
      return;
    }

    setCart((current) => {
      const preserved = current.filter((item) => item.bundleId);
      const currentByService = new Map(
        current
          .filter((item) => !item.bundleId)
          .map((item) => [String(item.serviceId), item])
      );

      const baseStart = (current.find((item) => !item.bundleId)?.startTime) || nextStartTime();
      let cursor = baseStart;
      const rebuilt = selectedRows.map(({ service, quantity }) => {
        const existing = currentByService.get(String(service.id));
        const unitPrice = preciosHabilitados ? Number(service.base_price || 0) : 0;
        const row = {
          key: existing?.key || `${service.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          serviceId: service.id,
          name: service.name,
          icon: service.icon,
          color: service.color,
          duration: serviceDuration(service),
          quantity,
          unitPrice,
          price: unitPrice * quantity,
          startTime: cursor,
          employeeId: '',
          bundleId: null,
          bundleType: null,
          bundleName: null
        };
        cursor = addMinutesToTime(cursor, row.duration);
        return row;
      });

      return [...rebuilt, ...preserved];
    });

    setProductQuantities({});
    setIsServiceModalOpen(false);
  };

  const addServiceToCart = ({ service, startTime, employeeId, bundle = null, price = null }) => {
    const duration = serviceDuration(service);
    const quantity = Math.max(1, Number(service.quantity || 1));
    const unitPrice = preciosHabilitados ? Number(price ?? service.base_price ?? 0) : 0;
    const item = {
      key: `${service.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      serviceId: service.id,
      name: service.name,
      icon: service.icon,
      color: service.color,
      duration,
      quantity,
      unitPrice,
      price: unitPrice * quantity,
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
    if (esModoPedido) {
      const merged = { ...productQuantities, [service.id]: Math.max(1, Number(productQuantities[service.id] || 0) + 1) };
      syncPedidoProductsToCart(merged);
      setIsServiceModalOpen(false);
      return;
    }

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

  const addPedidoProductsToCart = () => syncPedidoProductsToCart(productQuantities);

  const openServiceSelector = () => {
    if (esModoPedido) {
      const currentQuantities = {};
      cart.forEach((item) => {
        if (!item.bundleId) {
          currentQuantities[item.serviceId] = Math.max(0, Number(item.quantity || 0));
        }
      });
      setProductQuantities(currentQuantities);
    }
    setIsServiceModalOpen(true);
  };

  const updateAddonRow = (key, field, value) => {
    setPedidoAddons((current) => current.map((row) => {
      if (row.key !== key) return row;
      if (field === 'quantity') {
        return { ...row, quantity: Math.max(1, Number(value || 1)) };
      }
      if (field === 'unitPrice') {
        return { ...row, unitPrice: Math.max(0, Number(value || 0)) };
      }
      return { ...row, [field]: value };
    }));
  };

  const addAddonRow = () => setPedidoAddons((current) => [...current, createEmptyAddonRow('')]);
  const removeAddonRow = (key) => setPedidoAddons((current) => current.filter((row) => row.key !== key));

  const handleDateDisplayChange = (value) => {
    setDateDisplay(value);
    const parsed = displayDateToIso(value);
    if (parsed) setDate(parsed);
  };

  /* =========================
     CONFIRMAR
  ========================= */

  // Antes de confirmar, valida y abre el aviso con la lista de servicios.
  const openConfirmDialog = () => {
    if (cart.length === 0) return;
    if (showBranchSelector && !activeBranchId) {
      alert(`Elegí la sucursal para ${esModoPedido ? 'el pedido' : 'la reserva'}.`);
      return;
    }
    if (!esModoPedido && hoursIssue) {
      setShowHoursModal(true);
      return;
    }
    if (!esModoPedido && conflictingKeys.size > 0) {
      alert('Hay servicios con un profesional ocupado en su horario. Cambiá el profesional o dejalo en «Indistinto» para continuar.');
      return;
    }
    if (!emailFormatValid) {
      alert('El email del cliente no tiene un formato válido. Ingresá un email correcto (ej: nombre@dominio.com) o dejá el campo vacío.');
      return;
    }
    setShowConfirmDialog(true);
  };

  const confirmReservation = async () => {
    if (cart.length === 0) return;
    if (showBranchSelector && !activeBranchId) {
      alert(`Elegí la sucursal para ${esModoPedido ? 'el pedido' : 'la reserva'}.`);
      return;
    }
    if (!esModoPedido && hoursIssue) {
      setShowHoursModal(true);
      return;
    }
    if (!esModoPedido && conflictingKeys.size > 0) {
      alert('Hay servicios con un profesional ocupado en su horario. Cambiá el profesional o dejalo en «Indistinto» para continuar.');
      return;
    }
    if (!emailFormatValid) {
      alert('El email del cliente no tiene un formato válido. Ingresá un email correcto (ej: nombre@dominio.com) o dejá el campo vacío.');
      return;
    }
    setIsSaving(true);

    if (isClient) {
      // Todos los servicios de esta reserva comparten un booking_group_id para
      // que salga un solo mail (con todos los servicios) y un unico REF.
      const clientGroupId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : null;
      const stampBranchId = activeBranchId || branchId || null;
      let clientHasWaitlist = false;
      const createdClientBookingIds = [];
      for (const item of cart) {
        const startAt = `${date}T${item.startTime}:00`;
        const endAt = `${date}T${addMinutesToTime(item.startTime, item.duration)}:00`;
        const description = item.bundleName
          ? [item.bundleName, bookingComment].filter(Boolean).join(' · ')
          : bookingComment;

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
          session_token_value: internalSessionToken,
          booking_group_id_value: clientGroupId
        });

        if (error) {
          setIsSaving(false);
          alert(`No se pudo confirmar la reserva.\n${formatSupabaseError(error)}`);
          return;
        }

        if (String(data?.status || '').toLowerCase() === 'waitlist') {
          clientHasWaitlist = true;
        }

        if (data?.id) {
          createdClientBookingIds.push(data.id);
        }

        if (stampBranchId && data?.id) {
          await supabase.rpc('set_booking_branch', {
            booking_id_value: data.id,
            branch_id_value: stampBranchId,
            company_slug_value: companySlug
          });
        }
      }

      let notificationError = null;
      if (clientGroupId && createdClientBookingIds.length > 0) {
        const notificationResult = await supabase.rpc('notify_booking_group', {
          group_id_value: clientGroupId,
          company_slug_value: companySlug,
          account_id_value: clientAccountId,
          session_token_value: internalSessionToken,
          event_kind: rescheduleMode ? 'reschedule' : 'new'
        });
        notificationError = notificationResult.error;
      }

      setIsSaving(false);

      if (rescheduleMode) {
        // En reprogramación el turno original NO se toca todavía: se devuelve el
        // nuevo turno para que el cliente confirme o descarte la modificación.
        onBookingCreated?.({
          date,
          branchName: showBranchSelector ? activeBranchName : '',
          services: cart.map((cartItem) => cartItem.name),
          bookingIds: createdClientBookingIds,
          isWaitlist: clientHasWaitlist
        });
        onClose?.();
        return;
      }

      if (!esModoPedido && clientHasWaitlist) {
        setWaitlistNotice(true);
        return;
      }
      const [, cMonth, cDay] = String(date).split('-');
      const completedMessage = esModoPedido
        ? `Pedido cargado para el ${cDay}/${cMonth}. Muchas gracias.`
        : `Reservaste turno para el ${cDay}/${cMonth}. Muchas gracias.`;
      setSuccessMessage(notificationError
        ? `${completedMessage} No se pudo enviar el email de confirmación: ${formatSupabaseError(notificationError)}`
        : completedMessage);
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
      booking_description_value: bookingComment,
      branch_id_value: activeBranchId || branchId || null,
      account_id_value: internalAdminAccountId || internalEmployeeAccountId,
      session_token_value: internalSessionToken,
      company_slug_value: companySlug,
      client_account_id_value: selectedClientAccountId || null
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

    if (!esModoPedido && hasWaitlist) {
      setWaitlistNotice(true);
      return;
    }

    const [year, month, day] = String(date).split('-');
    setSuccessMessage(esModoPedido
      ? `Pedido cargado para el ${day}/${month}. Muchas gracias.`
      : `Reservaste turno para el ${day}/${month}. Muchas gracias.`);
  };

  const configOptions = configDraft ? employeesForService(configDraft.service.id) : [];

  return (
    <div className="new-booking-overlay" role="dialog" aria-modal="true">
      <div className="new-booking-panel">
        <header className="new-booking-header">
          <div className="new-booking-header-title">
            <span className="new-booking-header-icon" aria-hidden="true">🗓️</span>
            <div>
              <h2>{esModoPedido ? 'Nuevo pedido' : 'Nueva reserva'}</h2>
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
                <span className="new-booking-label">{esModoPedido ? 'Día del pedido' : 'Día de la reserva'}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="DD/MM/AAAA"
                  value={dateDisplay}
                  disabled={lockedFromSlot}
                  onChange={(event) => handleDateDisplayChange(event.target.value)}
                  onBlur={() => setDateDisplay(isoToDisplayDate(date))}
                />
                <span className="new-booking-day-hint">{formatDayLabel(date)}</span>
              </label>

              <label className="new-booking-field">
                <span className="new-booking-label">{esModoPedido ? 'Hora de entrega' : 'Hora de inicio'}</span>
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

              {!isClient && (
                <div className="new-booking-field new-booking-client">
                  <span className="new-booking-label">{esModoPedido ? 'Cliente del pedido' : 'Cliente de la reserva'}</span>
                  <label className="new-booking-self-check">
                    <input
                      type="checkbox"
                      checked={bookForSelf}
                      onChange={(event) => toggleBookForSelf(event.target.checked)}
                    />
                    <span>Reservar a mi nombre ({user?.displayName || 'mi usuario'}) y editar después</span>
                  </label>
                  <div className="new-booking-client-search">
                    <input
                      type="text"
                      placeholder="Buscá por nombre, apellido o DNI"
                      value={customerName}
                      onChange={(event) => {
                        if (bookForSelf) setBookForSelf(false);
                        if (selectedClientAccountId) setSelectedClientAccountId(null);
                        setCustomerName(event.target.value);
                      }}
                      onFocus={() => { if (clientResults.length > 0) setShowClientResults(true); }}
                      onBlur={() => setTimeout(() => setShowClientResults(false), 150)}
                      disabled={bookForSelf}
                      autoComplete="off"
                    />
                    {clientSearchLoading && (
                      <span className="new-booking-client-loading">Buscando…</span>
                    )}
                    {showClientResults && clientResults.length > 0 && (
                      <ul className="new-booking-client-results">
                        {clientResults.map((client) => (
                          <li key={client.id}>
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => selectClient(client)}
                            >
                              <span className="new-booking-client-name">{client.display_name}</span>
                              <span className="new-booking-client-meta">
                                {[client.client_dni ? `DNI ${client.client_dni}` : null, client.phone]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {showClientResults && !clientSearchLoading && clientResults.length === 0 && customerName.trim().length >= 2 && (
                      <p className="new-booking-client-empty">
                        Sin coincidencias en la base. Se guardará como «{customerName.trim()}».
                      </p>
                    )}
                  </div>
                  <input
                    type="email"
                    className={`new-booking-email-input${!emailFormatValid ? ' new-booking-email-invalid' : ''}`}
                    placeholder="Email del cliente (opcional)"
                    value={customerEmail}
                    onChange={(event) => setCustomerEmail(event.target.value)}
                    onBlur={() => setCustomerEmail((prev) => prev.trim())}
                    disabled={bookForSelf}
                    aria-invalid={!emailFormatValid}
                    autoComplete="off"
                    inputMode="email"
                  />
                  {!emailFormatValid && (
                    <span className="new-booking-email-error">Ingresá un email válido (ej: nombre@dominio.com) o dejá el campo vacío.</span>
                  )}
                </div>
              )}

              <div className="new-booking-field">
                <span className="new-booking-label">{esModoPedido ? 'Productos' : 'Servicios'}</span>
                {cart.length === 0 ? (
                  <button type="button" className="new-booking-select-service" onClick={openServiceSelector}>
                    <span>{esModoPedido ? 'Seleccionar producto' : 'Seleccionar servicio'}</span>
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
                                {!esModoPedido && <ActivityIcon service={item} size="small" />} {esModoPedido ? (parseProductName(item.name).name || item.name) : item.name}
                                {esModoPedido && <span className="new-booking-inline-qty">x{Number(item.quantity || 1)}</span>}
                                {item.bundleName && <span className="new-booking-cart-badge">{item.bundleType === 'promo' ? '🔥' : '🎁'} {item.bundleName}</span>}
                              </span>
                              <div className="new-booking-cart-actions">
                                {esModoPedido && (
                                  <div className="new-booking-qty-editor">
                                    <button type="button" onClick={() => updatePedidoItemQuantity(item.key, Number(item.quantity || 1) - 1)} aria-label="Restar unidad">−</button>
                                    <input
                                      type="number"
                                      min={0}
                                      value={Number(item.quantity || 0)}
                                      onChange={(event) => updatePedidoItemQuantity(item.key, event.target.value)}
                                      aria-label="Cantidad"
                                    />
                                    <button type="button" onClick={() => updatePedidoItemQuantity(item.key, Number(item.quantity || 1) + 1)} aria-label="Sumar unidad">+</button>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  className="new-booking-cart-remove"
                                  onClick={() => removeItem(item.key)}
                                  aria-label={isBundle ? `Quitar ${item.bundleType === 'promo' ? 'promo' : 'pack'} completo` : `Quitar ${esModoPedido ? 'producto' : 'servicio'}`}
                                  title={isBundle ? `Quitar ${item.bundleType === 'promo' ? 'la promo' : 'el pack'} completo` : `Quitar ${esModoPedido ? 'producto' : 'servicio'}`}
                                >🗑️</button>
                              </div>
                            </div>
                            <div className="new-booking-cart-meta">
                              {!esModoPedido && <span>🕒 {item.startTime} - {endTime}</span>}
                              {!esModoPedido && <span>⏱️ {formatDurationLabel(item.duration)}</span>}
                              {preciosHabilitados && <span className="new-booking-cart-price">{esModoPedido ? `${formatPrice(item.unitPrice || 0)} c/u · ${formatPrice(item.price)}` : formatPrice(item.price)}</span>}
                            </div>
                            {showEmployeePicker && !esModoPedido && (
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
                    <button type="button" className="new-booking-add-more" onClick={openServiceSelector}>
                      ＋ {esModoPedido ? 'Agregar producto' : 'Agregar otro servicio'}
                    </button>
                  </>
                )}
              </div>

              {esModoPedido && (
                <div className="new-booking-field">
                  <div className="new-booking-addons-header">
                    <span className="new-booking-label">Agregados del pedido</span>
                    <button type="button" className="new-booking-addons-add" onClick={addAddonRow}>+ Agregado</button>
                  </div>
                  <div className="new-booking-addons-list">
                    {pedidoAddons.length === 0 && (
                      <p className="new-booking-addons-empty">Aún no agregaste extras. Tocá + Agregado para sumar uno.</p>
                    )}
                    {pedidoAddons.length > 0 && (
                      <div className="new-booking-addon-head" aria-hidden="true">
                        <span>Agregado</span>
                        <span>Precio</span>
                        <span>Cant.</span>
                        <span />
                      </div>
                    )}
                    {pedidoAddons.map((row) => (
                      <div key={row.key} className="new-booking-addon-row">
                        <input
                          type="text"
                          placeholder="Nombre del agregado"
                          value={row.kind}
                          onChange={(event) => updateAddonRow(row.key, 'kind', event.target.value)}
                        />
                        <input
                          type="number"
                          min={0}
                          step="1"
                          placeholder="Precio"
                          value={Number(row.unitPrice || 0)}
                          onChange={(event) => updateAddonRow(row.key, 'unitPrice', event.target.value)}
                        />
                        <input
                          type="number"
                          min={1}
                          value={Number(row.quantity || 1)}
                          onChange={(event) => updateAddonRow(row.key, 'quantity', event.target.value)}
                        />
                        <button type="button" className="new-booking-addon-remove" onClick={() => removeAddonRow(row.key)} aria-label="Quitar agregado">✕</button>
                      </div>
                    ))}
                  </div>
                  <span className="new-booking-day-hint">Se guardan en el comentario del pedido. Si tienen costo, se suman al total.</span>
                </div>
              )}

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
              <strong>{formatPrice(orderTotal)}</strong>
            </div>
          )}
          <button
            type="button"
            className="new-booking-confirm"
            disabled={cart.length === 0 || isSaving || conflictingKeys.size > 0 || Boolean(hoursIssue) || !emailFormatValid}
            onClick={openConfirmDialog}
          >
            {isSaving ? 'Confirmando…' : `${esModoPedido ? 'Confirmar pedido' : 'Confirmar reserva'} →`}
          </button>
          {cart.length === 0 && <p className="new-booking-footer-hint">Seleccioná al menos un {esModoPedido ? 'producto' : 'servicio'} para continuar</p>}
          {cart.length > 0 && Boolean(hoursIssue) && (
            <p className="new-booking-footer-hint new-booking-footer-warning">{hoursIssue}</p>
          )}
          {cart.length > 0 && conflictingKeys.size > 0 && (
            <p className="new-booking-footer-hint new-booking-footer-warning">Reacomodamos los servicios, pero alguno sigue con el profesional ocupado. Cambiá el profesional para continuar.</p>
          )}
        </footer>
      </div>

      {/* AVISO DE CONFIRMACIÓN CON LISTA DE SERVICIOS */}
      {showConfirmDialog && (
        <div className="new-booking-modal new-booking-confirm-modal">
          <div className="new-booking-modal-card new-booking-confirm-card">
            <div className="new-booking-confirm-body">
              <p className="new-booking-confirm-title">
                {rescheduleMode ? 'Vas a modificar tu turno a:' : `Estás ${esModoPedido ? 'cargando un pedido con los productos' : 'reservando turno para los servicios'}:`}
              </p>
              {(() => {
                const [cy, cm, cd] = String(date || '').split('-');
                const dateLabel = cy && cm && cd ? `${cd}/${cm}/${cy}` : '';
                if (!dateLabel) return null;
                return <p className="new-booking-confirm-date">Día: {dateLabel}</p>;
              })()}
              {activeBranchName && (
                <p className="new-booking-confirm-branch">Sucursal: {activeBranchName.toUpperCase()}</p>
              )}
              {!esModoPedido && (
                <ul className="new-booking-confirm-list">
                  {cart.map((item) => {
                    const tipo = item.bundleType === 'promo'
                      ? { label: 'PROMO', cls: 'is-promo' }
                      : item.bundleType === 'pack'
                        ? { label: 'PACK', cls: 'is-pack' }
                        : { label: 'Servicio', cls: 'is-service' };
                    const timeLabel = item.startTime
                      ? `${item.startTime} - ${addMinutesToTime(item.startTime, item.duration)}`
                      : '';
                    return (
                      <li key={item.key}>
                        <span className="new-booking-confirm-item-name">
                          <ActivityIcon service={item} size="small" /> {item.name}
                          {timeLabel && <span className="new-booking-confirm-item-time">{timeLabel}</span>}
                        </span>
                        <span className={`new-booking-confirm-tag ${tipo.cls}`}>{tipo.label}</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {esModoPedido && (
                <div className="new-booking-confirm-groups">
                  {confirmProductsGroupedByType.map((group) => (
                    <div key={group.type} className="new-booking-confirm-group">
                      <p className="new-booking-confirm-group-title">Tipo: {group.type}</p>
                      <ul className="new-booking-confirm-list">
                        {group.lines.map((line) => (
                          <li key={line.key}>
                            <span className="new-booking-confirm-item-name">
                              {line.name}
                              <span className="new-booking-confirm-item-time">x{line.quantity}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              {esModoPedido && normalizedPedidoAddons.length > 0 && (
                <div className="new-booking-confirm-addons">
                  <p className="new-booking-confirm-addons-title">Agregados</p>
                  <ul>
                    {normalizedPedidoAddons.map((row, index) => (
                      <li key={`${row.kind}-${index}`}>
                        <span>{row.kind || 'Agregado'}</span>
                        <strong>x{row.quantity}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {esModoPedido && preciosHabilitados && (
                <div className="new-booking-confirm-totals">
                  <div>
                    <span>Total productos</span>
                    <strong>{formatPrice(cartTotal)}</strong>
                  </div>
                  <div>
                    <span>Total agregados</span>
                    <strong>{formatPrice(addonsTotal)}</strong>
                  </div>
                  <div>
                    <span>Total pedido</span>
                    <strong>{formatPrice(orderTotal)}</strong>
                  </div>
                </div>
              )}
              <p className="new-booking-confirm-question">
                {rescheduleMode ? '¿Confirmás la modificación?' : `¿Confirmás ${esModoPedido ? 'el pedido' : 'la reserva'}?`}
              </p>
            </div>
            <div className="new-booking-confirm-actions">
              <button
                type="button"
                className="new-booking-confirm-no"
                onClick={() => setShowConfirmDialog(false)}
              >
                NO
              </button>
              <button
                type="button"
                className="new-booking-confirm-yes"
                onClick={() => { setShowConfirmDialog(false); confirmReservation(); }}
              >
                SÍ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SELECCIONAR SERVICIO */}
      {isServiceModalOpen && (
        <div className="new-booking-modal">
          <div className="new-booking-modal-card">
            <header className="new-booking-modal-header">
              <h3>{esModoPedido ? 'Seleccionar producto' : 'Seleccionar servicio'}</h3>
              <button type="button" onClick={() => setIsServiceModalOpen(false)} aria-label="Cerrar">✕</button>
            </header>
            <div className="new-booking-modal-body">
              {!esModoPedido && visibleBundles.length > 0 && (
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

              {!esModoPedido && (
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
              )}

              {esModoPedido && (
                <div className="new-booking-modal-group">
                  {groupedProducts.length === 0 ? (
                    <div className="new-booking-empty">No hay productos disponibles.</div>
                  ) : groupedProducts.map((group) => (
                    <div key={group.group} className="new-booking-product-group">
                      <span className="new-booking-modal-group-title">{group.group}</span>
                      <div className="new-booking-product-list">
                        {group.rows.map(({ service, parsed }) => {
                          const quantity = Math.max(0, Number(productQuantities[service.id] || 0));
                          const unit = Number(service.base_price || 0);
                          const subtotal = unit * quantity;
                          return (
                            <div key={`product-${service.id}`} className="new-booking-product-row">
                              <div className="new-booking-product-main">
                                <strong>{parsed.name || service.name}</strong>
                                <span>{preciosHabilitados ? `${formatPrice(unit)} c/u` : 'Producto'}</span>
                              </div>
                              <label className="new-booking-product-qty">
                                Cant.
                                <select
                                  value={quantity}
                                  onChange={(event) => setProductQuantities((current) => ({ ...current, [service.id]: Number(event.target.value) }))}
                                >
                                  {Array.from({ length: 16 }, (_, index) => (
                                    <option key={index} value={index}>{index}</option>
                                  ))}
                                </select>
                              </label>
                              <div className="new-booking-product-subtotal">
                                {preciosHabilitados ? formatPrice(subtotal) : `x${quantity}`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="new-booking-product-footer">
                    <div>
                      <span>Total productos seleccionados</span>
                      <strong>{preciosHabilitados ? formatPrice(modalSelectedProductsTotal) : Object.values(productQuantities).reduce((sum, value) => sum + Number(value || 0), 0)}</strong>
                    </div>
                    <button type="button" className="new-booking-config-confirm" onClick={addPedidoProductsToCart}>Agregar al pedido</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-MODAL CONFIGURAR SERVICIO */}
      {!esModoPedido && configDraft && (
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
            <div className="new-booking-alert-title">ATENCIÓN</div>
            <div className="new-booking-alert-body">
              <span className="new-booking-alert-icon" aria-hidden="true">⏳</span>
              <p>Entras en LISTA DE ESPERA porque no hay profesionales con disponibilidad todavía para ese horario.</p>
              {user?.role === 'admin' ? (
                <p>El turno se guardó igual. Recordá verificar las disponibilidades de los empleados.</p>
              ) : user?.role === 'employee' ? (
                <p>El turno se guardó igual. Se deberán ver las disponibilidades de las agendas.</p>
              ) : (
                <p>El turno se guardó igual, pero puede cancelarse. Te estaremos avisando.</p>
              )}
              {date && (
                <p className="new-booking-alert-date">
                  Reservaste turno para el {(() => { const [y, m, d] = String(date).split('-'); return `${d}/${m}/${y}`; })()}.
                </p>
              )}
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
