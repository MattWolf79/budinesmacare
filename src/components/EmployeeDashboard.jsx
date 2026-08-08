import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import { obtenerConfiguracionApp } from '../api/configuracionApp';
import AgendaGrid from './AgendaGrid';
import EmployeeAvailabilityPanel from './EmployeeAvailabilityPanel';
import MetricCard from './MetricCard';
import { formatDisplayDate } from '../utils/dateFormat';
import { comprimirImagen } from '../utils/imagenes';

const parseDate = (value) => value instanceof Date ? value : new Date(value);

const formatDate = (value) => formatDisplayDate(value, {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});

const formatTime = (value) => parseDate(value).toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
}).replace(/^24:/, '00:') + ' hs';

const formatMoney = (value) => new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0
}).format(Number(value) || 0);

const emptyProfileForm = {
  first_name: '',
  last_name: '',
  email: '',
  birth_date: '',
  phone: '',
  address_street: '',
  address_number: '',
  address_locality: '',
  photo_url: ''
};

const buildProfileForm = (employee) => ({
  first_name: employee?.first_name || '',
  last_name: employee?.last_name || '',
  email: employee?.email || '',
  birth_date: employee?.birth_date || '',
  phone: employee?.phone || '',
  address_street: employee?.address_street || '',
  address_number: employee?.address_number || '',
  address_locality: employee?.address_locality || '',
  photo_url: employee?.photo_url || ''
});

const calculateAge = (birthDateValue) => {
  if (!birthDateValue) return '';

  const birthDate = new Date(`${birthDateValue}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return '';

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  return String(Math.max(0, age));
};

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

const getCustomerFields = (booking) => ({
  name: booking.customer_name || 'Cliente sin nombre',
  email: booking.user_email || 'Sin email'
});

const getBookingTitle = (booking, service) => {
  if (!booking.service && booking.booking_description) {
    return String(booking.booking_description)
      .split(' · ')
      .map((part) => part.trim())
      .filter(Boolean)[0] || 'Servicio';
  }

  return service?.name || 'Servicio';
};

const getBookingKind = (booking) => {
  const bundleType = String(booking?.bundle_type || '').toLowerCase();
  if (bundleType === 'pack') return 'Pack';
  if (bundleType === 'promo') return 'Promo';
  if (booking?.bundle_id) return 'Pack';
  if (!booking?.service && booking?.booking_description) return 'Promo';
  return 'Servicio';
};

const getDateKey = (value) => {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatAvailabilityTime = (value) => String(value || '').slice(0, 5);

const getTodayWeekday = () => new Date().getDay();

const isClosedBooking = (booking) =>
  ['completed', 'closed'].includes(String(booking?.status || '').trim().toLowerCase());

const isCancelledBooking = (booking) =>
  ['cancelled', 'canceled', 'cancelado', 'cancelada'].includes(String(booking?.status || '').trim().toLowerCase());

const startOfWeek = (date) => {
  const weekStart = new Date(date);
  const day = weekStart.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() + diff);
  return weekStart;
};

const formatWeekRange = (weekStart) => {
  const weekEnd = addDays(weekStart, 6);
  return `${formatDisplayDate(weekStart)} al ${formatDisplayDate(weekEnd)}`;
};

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const getWeekKey = (weekStart) => weekStart.toISOString().slice(0, 10);
const getActivityHistoryModeStorageKey = (employeeId) => `turnos.employee.activity.mode.${employeeId || 'unknown'}`;
const getActivityHistoryWeekStorageKey = (employeeId) => `turnos.employee.activity.week.${employeeId || 'unknown'}`;
const getPaymentHistoryWeekStorageKey = (employeeId) => `turnos.employee.payment.week.${employeeId || 'unknown'}`;

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

export default function EmployeeDashboard({ user, activeView = 'summary', companySlug, companyContext, onRequestNewBooking }) {
  const [employee, setEmployee] = useState(null);
  const [employeeServices, setEmployeeServices] = useState([]);
  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [closedBookingAmounts, setClosedBookingAmounts] = useState({});
  const [appConfig, setAppConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [configRefreshKey, setConfigRefreshKey] = useState(0);
  const [activityHistoryMode, setActivityHistoryMode] = useState('week');
  const [selectedActivityWeekKey, setSelectedActivityWeekKey] = useState(() => getWeekKey(startOfWeek(new Date())));
  const [selectedPaymentWeekKey, setSelectedPaymentWeekKey] = useState(() => getWeekKey(startOfWeek(new Date())));
  const [detailBookingId, setDetailBookingId] = useState(null);
  const [selectedUpcomingDate, setSelectedUpcomingDate] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [pedidoDiaOffset, setPedidoDiaOffset] = useState(0);

  const employeeId = user?.employeeId;
  const effectiveCompanyContext = useMemo(() => {
    if (!appConfig) return companyContext;

    return {
      ...companyContext,
      ...appConfig,
      configuracion_operativa: appConfig.configuracion_operativa || companyContext?.configuracion_operativa || {}
    };
  }, [appConfig, companyContext]);
  const esModoPedido = effectiveCompanyContext?.configuracion_operativa?.modo_operacion === 'pedido'
    || effectiveCompanyContext?.configuracion_operativa?.usa_agenda === false;
  const preciosHabilitados = effectiveCompanyContext?.configuracion_operativa?.precios_habilitados !== false;
  const empleadosPuedenReservar = effectiveCompanyContext?.configuracion_operativa?.empleados_pueden_reservar !== false;

  useEffect(() => {
    if (!employeeId) {
      return;
    }

    if (user?.isLocalInternal) {
      const today = new Date();
      const buildDate = (hours, minutes = 0) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, hours, minutes, 0, 0).toISOString();

      setEmployee({
        id: employeeId,
        name: 'Empleado Local',
        first_name: 'Empleado',
        last_name: 'Local',
        active: true
      });
      setBookings([
        {
          id: '00000000-0000-4000-8000-000000000401',
          user_email: 'cliente.local@example.com',
          customer_name: 'Cliente Local',
          service: 1,
          employee_id: employeeId,
          start_at: buildDate(10, 0),
          end_at: buildDate(10, 30),
          status: 'completed',
          is_settled: false
        },
        {
          id: '00000000-0000-4000-8000-000000000402',
          user_email: 'lucas.perez@example.com',
          customer_name: 'Lucas Perez',
          service: 2,
          employee_id: employeeId,
          start_at: buildDate(11, 0),
          end_at: buildDate(11, 30),
          status: 'completed',
          is_settled: false
        }
      ]);
      setServices([
        { id: 1, name: 'Gastroenterologia', icon: '🩺', color: '#3fc9d5', active: true },
        { id: 2, name: 'Control general', icon: '✨', color: '#20a6b2', active: true }
      ]);
      setPromotions([]);
      setEmployeeServices([
        { employee_id: employeeId, service_id: 1 },
        { employee_id: employeeId, service_id: 2 }
      ]);
      setAvailability([]);
      setClosedBookingAmounts({
        '00000000-0000-4000-8000-000000000401': 10000,
        '00000000-0000-4000-8000-000000000402': 8000
      });
      setIsLoading(false);
      setError('');
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
            session_token_value: user.sessionToken,
            company_slug_value: companySlug
          }),
          obtenerConfiguracionApp(companySlug)
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

        setAppConfig({
          ...(configResult.data || {}),
          configuracion_operativa: data?.configuracion_operativa || configResult.data?.configuracion_operativa || null
        });
        setEmployee(data?.employee || null);
        const employeeBookings = data?.bookings || [];
        setBookings(employeeBookings);
        setServices(data?.services || []);
        setPromotions(Array.isArray(configResult.data?.promotions) ? configResult.data.promotions : []);
        setEmployeeServices(data?.employeeServices || []);
        setAvailability(data?.availability || []);
        if (!preciosHabilitados) {
          setClosedBookingAmounts({});
        } else if (Array.isArray(data?.bookingClosureItems) && Array.isArray(data?.bookingClosures)) {
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

      const [employeeResult, bookingsResult, servicesResult, employeeServicesResult, availabilityResult, configResult] = await Promise.all([
        supabase.from('employees').select('*').eq('id', employeeId).is('deleted_at', null).maybeSingle(),
        supabase
          .from('bookings')
          .select('*')
          .eq('employee_id', employeeId)
          .in('status', ['confirmed', 'reserved', 'completed'])
          .order('start_at', { ascending: true }),
        supabase.from('services').select('*'),
        supabase.from('employee_services').select('employee_id, service_id').eq('employee_id', employeeId),
        availabilityRequest,
        obtenerConfiguracionApp(companySlug)
      ]);

      if (!active) {
        return;
      }

      setIsLoading(false);

      const firstError = employeeResult.error || bookingsResult.error || servicesResult.error || employeeServicesResult.error || availabilityResult.error;

      if (firstError) {
        setError(firstError.message || 'No se pudo cargar la información del empleado.');
        return;
      }

      setAppConfig(configResult.data || null);
      setEmployee(employeeResult.data || null);
      setBookings(bookingsResult.data || []);
      setServices(servicesResult.data || []);
      setEmployeeServices(employeeServicesResult.data || []);
      setPromotions(Array.isArray(configResult.data?.promotions) ? configResult.data.promotions : []);
      setAvailability(availabilityResult.data || []);
      if (preciosHabilitados) {
        await loadClosedBookingAmounts(bookingsResult.data || []);
      } else {
        setClosedBookingAmounts({});
      }
    };

    loadEmployeeWorkspace();

    return () => {
      active = false;
    };
  }, [employeeId, refreshKey, configRefreshKey, user?.id, user?.isInternal, companySlug]);

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

  useEffect(() => {
    setProfileForm(buildProfileForm(employee));
    setProfileError('');
  }, [employee]);

  useEffect(() => {
    if (activeView !== 'profile') {
      setIsProfileEditing(false);
      setProfileForm(buildProfileForm(employee));
      setProfileError('');
    }
  }, [activeView, employee]);

  const refreshEmployeeWorkspace = () => {
    setRefreshKey((current) => current + 1);
  };

  const updateProfileField = (field, value) => {
    setProfileForm((current) => ({ ...current, [field]: value }));
  };

  const updateProfilePhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setProfileError('Seleccioná una imagen válida.');
      return;
    }

    if (file.size > 650 * 1024) {
      setProfileError('La foto debe pesar menos de 650 KB.');
      return;
    }

    try {
      const dataUrl = await comprimirImagen(file, { ladoMaximo: 512, calidad: 0.72 });
      updateProfileField('photo_url', dataUrl);
      setProfileError('');
    } catch {
      setProfileError('No se pudo cargar la foto.');
    }
  };

  const cancelProfileEdit = () => {
    setProfileForm(buildProfileForm(employee));
    setIsProfileEditing(false);
    setProfileError('');
  };

  const saveEmployeeProfile = async () => {
    const payload = {
      first_name: profileForm.first_name.trim(),
      last_name: profileForm.last_name.trim(),
      email: profileForm.email.trim().toLowerCase(),
      birth_date: profileForm.birth_date || null,
      phone: profileForm.phone.trim(),
      address_street: profileForm.address_street.trim(),
      address_number: profileForm.address_number.trim(),
      address_locality: profileForm.address_locality.trim(),
      photo_url: profileForm.photo_url || null
    };

    if (!payload.first_name || !payload.last_name) {
      setProfileError('Ingresá nombre y apellido.');
      return;
    }

    setIsSavingProfile(true);
    setProfileError('');

    if (user?.isLocalInternal) {
      const updatedEmployee = {
        ...employee,
        ...payload,
        name: [payload.first_name, payload.last_name].filter(Boolean).join(' ')
      };
      setEmployee(updatedEmployee);
      setIsProfileEditing(false);
      setIsSavingProfile(false);
      return;
    }

    const { data, error } = await supabase.rpc('update_internal_employee_profile', {
      account_id_value: user.id,
      session_token_value: user.sessionToken,
      company_slug_value: companySlug,
      first_name_value: payload.first_name,
      last_name_value: payload.last_name,
      birth_date_value: payload.birth_date,
      phone_value: payload.phone || null,
      email_value: payload.email || null,
      address_street_value: payload.address_street || null,
      address_number_value: payload.address_number || null,
      address_locality_value: payload.address_locality || null,
      photo_url_value: payload.photo_url
    });

    setIsSavingProfile(false);

    if (error) {
      setProfileError(error.message || 'No se pudieron guardar tus datos.');
      return;
    }

    setEmployee(Array.isArray(data) ? data[0] : data);
    setIsProfileEditing(false);
  };

  const now = useMemo(() => new Date(), []);

  const visibleUpcomingBookings = useMemo(
    () => bookings.filter((booking) =>
      parseDate(booking.end_at) >= now
      && !isClosedBooking(booking)
      && !isCancelledBooking(booking)),
    [bookings, now]
  );

  const activeUpcomingBookings = useMemo(
    () => visibleUpcomingBookings.filter((booking) => !isClosedBooking(booking)),
    [visibleUpcomingBookings]
  );

  const upcomingDateKeys = useMemo(() => {
    const set = new Set();
    visibleUpcomingBookings.forEach((booking) => {
      const key = getDateKey(booking.start_at);
      if (key) set.add(key);
    });
    return set;
  }, [visibleUpcomingBookings]);

  const upcomingDates = useMemo(() => Array.from(upcomingDateKeys), [upcomingDateKeys]);

  const weekDays = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + weekOffset * 3);
    return Array.from({ length: 3 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = getDateKey(date);
      return {
        key,
        day: String(date.getDate()).padStart(2, '0'),
        month: String(date.getMonth() + 1).padStart(2, '0'),
        hasBookings: upcomingDateKeys.has(key)
      };
    });
  }, [now, weekOffset, upcomingDateKeys]);

  const filteredUpcomingBookings = useMemo(
    () => (selectedUpcomingDate == null
      ? visibleUpcomingBookings
      : visibleUpcomingBookings.filter((booking) => getDateKey(booking.start_at) === selectedUpcomingDate)),
    [visibleUpcomingBookings, selectedUpcomingDate]
  );

  const fechaPedidoSeleccionada = useMemo(() => {
    const base = addDays(new Date(), pedidoDiaOffset);
    base.setHours(0, 0, 0, 0);
    return base;
  }, [pedidoDiaOffset]);

  const isoFechaPedidoSeleccionada = useMemo(() => getDateKey(fechaPedidoSeleccionada), [fechaPedidoSeleccionada]);

  const pedidosAgendaRows = useMemo(() => bookings
    .filter((booking) => !isCancelledBooking(booking))
    .filter((booking) => {
      const bookingDateKey = getDateKey(booking.start_at || booking.created_at);
      return bookingDateKey === isoFechaPedidoSeleccionada;
    })
    .sort((left, right) => parseDate(left.created_at || left.start_at) - parseDate(right.created_at || right.start_at)), [bookings, isoFechaPedidoSeleccionada]);

  const todayBookings = useMemo(
    () => activeUpcomingBookings.filter((booking) => isToday(booking.start_at)),
    [activeUpcomingBookings]
  );

  const detailBooking = useMemo(
    () => (detailBookingId == null
      ? null
      : bookings.find((booking) => String(booking.id) === String(detailBookingId)) || null),
    [detailBookingId, bookings]
  );

  const activeAvailability = useMemo(
    () => availability.filter((item) => item.active !== false),
    [availability]
  );
  const enabledPromotions = useMemo(() => (
    promotions.filter((promotion) => promotion?.enabled !== false && (promotion?.title || promotion?.description || promotion?.value))
  ), [promotions]);

  const assignedServiceNames = useMemo(() => {
    const employeeServiceIds = new Set(
      (employeeServices || [])
        .filter((relation) => String(relation.employee_id) === String(employeeId))
        .map((relation) => String(relation.service_id))
    );

    if (Array.isArray(employee?.service_ids)) {
      employee.service_ids.forEach((serviceId) => employeeServiceIds.add(String(serviceId)));
    }

    return services
      .filter((service) => employeeServiceIds.has(String(service.id)))
      .map((service) => service.name)
      .filter(Boolean);
  }, [employeeServices, services, employeeId, employee]);

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

  const pendingSettlementSummary = useMemo(() => {
    const pendingBookings = bookings.filter((booking) => isClosedBooking(booking) && booking.is_settled !== true);

    return pendingBookings.reduce((summary, booking) => ({
      count: summary.count + 1,
      total: summary.total + Number(closedBookingAmounts[booking.id] || 0)
    }), { count: 0, total: 0 });
  }, [bookings, closedBookingAmounts]);

  const pedidosNoCancelados = useMemo(
    () => bookings.filter((booking) => !isCancelledBooking(booking)),
    [bookings]
  );

  const pedidosCerrados = useMemo(
    () => pedidosNoCancelados.filter((booking) => isClosedBooking(booking)),
    [pedidosNoCancelados]
  );

  const totalMonetarioPedidos = useMemo(() => pedidosNoCancelados.reduce((total, booking) => {
    const closedValue = Number(closedBookingAmounts[booking.id] || 0);
    if (closedValue > 0) return total + closedValue;

    const itemPrice = Number(booking?.item_price || 0);
    if (itemPrice > 0) return total + itemPrice;

    const totalAmount = Number(booking?.total_amount || 0);
    if (totalAmount > 0) return total + totalAmount;

    const price = Number(booking?.price || 0);
    if (price > 0) return total + price;

    return total;
  }, 0), [pedidosNoCancelados, closedBookingAmounts]);

  const activityRows = useMemo(() => [...bookings]
    .sort((left, right) => parseDate(right.start_at) - parseDate(left.start_at)), [bookings]);

  const activityHistoryWeeks = useMemo(() => {
    const weekMap = new Map();

    activityRows.forEach((booking) => {
      const weekStart = startOfWeek(parseDate(booking.start_at));
      const weekKey = getWeekKey(weekStart);
      const currentWeek = weekMap.get(weekKey) || {
        key: weekKey,
        start: weekStart,
        label: formatWeekRange(weekStart),
        rows: []
      };

      currentWeek.rows.push(booking);
      weekMap.set(weekKey, currentWeek);
    });

    const currentWeekStart = startOfWeek(new Date());
    const earliestWeekStart = activityRows.reduce((earliest, booking) => {
      const bookingWeekStart = startOfWeek(parseDate(booking.start_at));
      return bookingWeekStart < earliest ? bookingWeekStart : earliest;
    }, currentWeekStart);
    const weeks = [];

    for (let weekStart = currentWeekStart; weekStart >= earliestWeekStart; weekStart = addDays(weekStart, -7)) {
      const weekKey = getWeekKey(weekStart);
      weeks.push(weekMap.get(weekKey) || {
        key: weekKey,
        start: weekStart,
        label: formatWeekRange(weekStart),
        rows: []
      });
    }

    return weeks;
  }, [activityRows]);

  useEffect(() => {
    if (!activityHistoryWeeks.length) return;
    if (!activityHistoryWeeks.some((week) => week.key === selectedActivityWeekKey)) {
      setSelectedActivityWeekKey(activityHistoryWeeks[0].key);
    }
  }, [activityHistoryWeeks, selectedActivityWeekKey]);

  const selectedActivityWeekIndex = activityHistoryWeeks.findIndex((week) => week.key === selectedActivityWeekKey);
  const selectedActivityWeek = activityHistoryWeeks[selectedActivityWeekIndex >= 0 ? selectedActivityWeekIndex : 0] || null;
  const canGoToPreviousActivityWeek = selectedActivityWeekIndex >= 0 && selectedActivityWeekIndex < activityHistoryWeeks.length - 1;
  const canGoToNextActivityWeek = selectedActivityWeekIndex > 0;

  useEffect(() => {
    if (!employeeId) return;

    const storedMode = sessionStorage.getItem(getActivityHistoryModeStorageKey(employeeId));
    const storedWeekKey = sessionStorage.getItem(getActivityHistoryWeekStorageKey(employeeId));
    const storedPaymentWeekKey = sessionStorage.getItem(getPaymentHistoryWeekStorageKey(employeeId));

    if (storedMode === 'week' || storedMode === 'all') {
      setActivityHistoryMode(storedMode);
    }

    if (storedWeekKey) {
      setSelectedActivityWeekKey(storedWeekKey);
    }

    if (storedPaymentWeekKey) {
      setSelectedPaymentWeekKey(storedPaymentWeekKey);
    }
  }, [employeeId]);

  useEffect(() => {
    if (!employeeId) return;
    sessionStorage.setItem(getActivityHistoryModeStorageKey(employeeId), activityHistoryMode);
  }, [employeeId, activityHistoryMode]);

  useEffect(() => {
    if (!employeeId || !selectedActivityWeekKey) return;
    sessionStorage.setItem(getActivityHistoryWeekStorageKey(employeeId), selectedActivityWeekKey);
  }, [employeeId, selectedActivityWeekKey]);

  useEffect(() => {
    if (!employeeId || !selectedPaymentWeekKey) return;
    sessionStorage.setItem(getPaymentHistoryWeekStorageKey(employeeId), selectedPaymentWeekKey);
  }, [employeeId, selectedPaymentWeekKey]);

  const goToPreviousActivityWeek = () => {
    if (!canGoToPreviousActivityWeek) return;
    setSelectedActivityWeekKey(activityHistoryWeeks[selectedActivityWeekIndex + 1].key);
  };

  const goToNextActivityWeek = () => {
    if (!canGoToNextActivityWeek) return;
    setSelectedActivityWeekKey(activityHistoryWeeks[selectedActivityWeekIndex - 1].key);
  };

  const visibleActivityRows = activityHistoryMode === 'all'
    ? activityRows
    : selectedActivityWeek?.rows || [];

  const paymentHistoryRows = useMemo(() => activityRows
    .filter(isClosedBooking)
    .map((booking) => ({
      booking,
      amount: Number(closedBookingAmounts[booking.id] || 0),
      employeeAmount: booking.is_settled === true ? Number(booking.settlement_employee_amount || 0) : null,
      companyAmount: booking.is_settled === true ? Number(booking.settlement_company_amount || 0) : null
    })), [activityRows, closedBookingAmounts]);

  const paymentHistoryWeeks = useMemo(() => {
    const weekMap = new Map();

    paymentHistoryRows.forEach((row) => {
      const weekStart = startOfWeek(parseDate(row.booking.start_at));
      const weekKey = getWeekKey(weekStart);
      const currentWeek = weekMap.get(weekKey) || {
        key: weekKey,
        start: weekStart,
        label: formatWeekRange(weekStart),
        rows: [],
        total: 0,
        employeeTotal: 0,
        companyTotal: 0
      };

      currentWeek.rows.push(row);
      currentWeek.total += row.amount;
      currentWeek.employeeTotal += row.employeeAmount || 0;
      currentWeek.companyTotal += row.companyAmount || 0;
      weekMap.set(weekKey, currentWeek);
    });

    const currentWeekStart = startOfWeek(new Date());
    const earliestWeekStart = paymentHistoryRows.reduce((earliest, row) => {
      const rowWeekStart = startOfWeek(parseDate(row.booking.start_at));
      return rowWeekStart < earliest ? rowWeekStart : earliest;
    }, currentWeekStart);
    const weeks = [];

    for (let weekStart = currentWeekStart; weekStart >= earliestWeekStart; weekStart = addDays(weekStart, -7)) {
      const weekKey = getWeekKey(weekStart);
      weeks.push(weekMap.get(weekKey) || {
        key: weekKey,
        start: weekStart,
        label: formatWeekRange(weekStart),
        rows: [],
        total: 0,
        employeeTotal: 0,
        companyTotal: 0
      });
    }

    return weeks;
  }, [paymentHistoryRows]);

  useEffect(() => {
    if (!paymentHistoryWeeks.length) return;
    if (!paymentHistoryWeeks.some((week) => week.key === selectedPaymentWeekKey)) {
      setSelectedPaymentWeekKey(paymentHistoryWeeks[0].key);
    }
  }, [paymentHistoryWeeks, selectedPaymentWeekKey]);

  const selectedPaymentWeekIndex = paymentHistoryWeeks.findIndex((week) => week.key === selectedPaymentWeekKey);
  const selectedPaymentWeek = paymentHistoryWeeks[selectedPaymentWeekIndex >= 0 ? selectedPaymentWeekIndex : 0] || null;
  const canGoToPreviousPaymentWeek = selectedPaymentWeekIndex >= 0 && selectedPaymentWeekIndex < paymentHistoryWeeks.length - 1;
  const canGoToNextPaymentWeek = selectedPaymentWeekIndex > 0;

  const goToPreviousPaymentWeek = () => {
    if (!canGoToPreviousPaymentWeek) return;
    setSelectedPaymentWeekKey(paymentHistoryWeeks[selectedPaymentWeekIndex + 1].key);
  };

  const goToNextPaymentWeek = () => {
    if (!canGoToNextPaymentWeek) return;
    setSelectedPaymentWeekKey(paymentHistoryWeeks[selectedPaymentWeekIndex - 1].key);
  };

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
            {esModoPedido ? (
              <>
                <MetricCard label="Pedidos" value={pedidosNoCancelados.length} hint="totales no cancelados" />
                <MetricCard label="Cerrados" value={pedidosCerrados.length} hint="pedidos finalizados" />
                <MetricCard label="Valor total" value={formatMoney(totalMonetarioPedidos)} hint="suma monetaria de pedidos" />
              </>
            ) : (
              <>
                <MetricCard label="Hoy" value={todayBookings.length} hint="turno(s) asignado(s)" />
                <MetricCard label="Próximos" value={activeUpcomingBookings.length} hint="turno(s) activos" />
              </>
            )}
            <MetricCard
              label="Disponibilidad"
              value={availabilityDayCount}
              hint={todayAvailabilityLabel}
              variant="availability"
            />
            {preciosHabilitados && !esModoPedido && (
              <>
                <MetricCard
                  label="Pendiente cobro"
                  value={pendingSettlementSummary.count}
                  hint={formatMoney(pendingSettlementSummary.total)}
                />
                <MetricCard label="Recaudación" variant="earnings">
                  <div className="employee-closed-week-lines">
                    <div className="employee-closed-week-row is-current">
                      <span>Esta semana</span>
                      <strong>{formatMoney(weeklyClosedSummary.current.total)}</strong>
                      <small>{weeklyClosedSummary.current.count} {esModoPedido ? 'pedidos' : 'turnos'}</small>
                    </div>
                    <div className="employee-closed-week-row">
                      <span>Semana anterior</span>
                      <strong>{formatMoney(weeklyClosedSummary.previous.total)}</strong>
                      <small>{weeklyClosedSummary.previous.count} {esModoPedido ? 'pedidos' : 'turnos'}</small>
                    </div>
                  </div>
                </MetricCard>
              </>
            )}
          </div>

          <div className="employee-layout employee-layout-summary">
            <article className="employee-card">
              <div className="employee-card-header employee-upcoming-header">
                <div className="employee-upcoming-header-top">
                  <div>
                    <p className="admin-kicker">{esModoPedido ? 'Pedidos' : 'Agenda'}</p>
                    <h2>{esModoPedido ? 'Próximos pedidos' : 'Próximos turnos'}</h2>
                  </div>
                  <button
                    className="admin-link-button employee-upcoming-refresh"
                    type="button"
                    onClick={refreshEmployeeWorkspace}
                    title={esModoPedido ? 'Actualizar pedidos' : 'Actualizar turnos'}
                  >
                    Actualizar
                  </button>
                </div>
                {upcomingDates.length > 0 && (
                  <div className="employee-upcoming-date-filter" role="tablist" aria-label="Filtrar por fecha">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={selectedUpcomingDate == null}
                      className={`employee-date-chip employee-date-chip-all${selectedUpcomingDate == null ? ' is-selected' : ''}`}
                      onClick={() => setSelectedUpcomingDate(null)}
                    >
                      <span className="employee-date-chip-day">Todos</span>
                    </button>
                    <button
                      type="button"
                      className="employee-date-nav"
                      onClick={() => setWeekOffset((offset) => Math.max(0, offset - 1))}
                      disabled={weekOffset === 0}
                      aria-label="Días anteriores"
                      title="Días anteriores"
                    >
                      ‹
                    </button>
                    <div className="employee-date-week">
                      {weekDays.map((item) => (
                        <button
                          type="button"
                          role="tab"
                          key={item.key}
                          aria-selected={selectedUpcomingDate === item.key}
                          className={`employee-date-chip${selectedUpcomingDate === item.key ? ' is-selected' : ''}${item.hasBookings ? ' has-bookings' : ''}`}
                          onClick={() => setSelectedUpcomingDate((current) => (current === item.key ? null : item.key))}
                        >
                          <span className="employee-date-chip-day">{item.day}</span>
                          <span className="employee-date-chip-month">{item.month}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="employee-date-nav"
                      onClick={() => setWeekOffset((offset) => offset + 1)}
                      aria-label="Días siguientes"
                      title="Días siguientes"
                    >
                      ›
                    </button>
                  </div>
                )}
              </div>

              <div className="employee-upcoming-list">
                {filteredUpcomingBookings.length === 0 ? (
                  <div className="employee-empty-line">No tenés {esModoPedido ? 'pedidos' : 'turnos'} próximos asignados.</div>
                ) : filteredUpcomingBookings.map((booking) => {
                  const service = getServiceForBooking(booking, services);
                  const bookingTitle = getBookingTitle(booking, service);
                  const isClosed = isClosedBooking(booking);
                  const customerFields = getCustomerFields(booking);
                  const kindLabel = getBookingKind(booking);

                  return (
                    <div
                      className={`employee-upcoming-row${isClosed ? ' is-closed' : ''}`}
                      key={booking.id}
                    >
                      <button
                        type="button"
                        className="employee-upcoming-row-main"
                        onClick={() => setDetailBookingId(booking.id)}
                      >
                        <span className="employee-upcoming-row-info">
                          <span className="employee-upcoming-row-title">{bookingTitle}</span>
                          <span className="employee-upcoming-row-client">{customerFields.name}</span>
                          <span className="employee-upcoming-row-date">
                            {formatDate(booking.start_at)} · {formatTime(booking.start_at)}-{formatTime(booking.end_at)}
                          </span>
                        </span>
                        <span className="employee-upcoming-row-badges">
                          <span className={`employee-upcoming-row-kind employee-upcoming-row-kind-${kindLabel.toLowerCase()}`}>
                            {kindLabel}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="employee-upcoming-row-arrow"
                        onClick={() => setDetailBookingId(booking.id)}
                        aria-label={`Ver detalle del ${esModoPedido ? 'pedido' : 'turno'} de ${customerFields.name}`}
                        title="Ver detalle"
                      >
                        ›
                      </button>
                    </div>
                  );
                })}
              </div>
            </article>
          </div>
        </>
      )}

      {activeView === 'agenda' && !esModoPedido && (
        <article className="employee-card employee-agenda-card">
          <AgendaGrid
            user={user}
            accessProfile="employee"
            employeeId={employeeId}
            refreshKey={refreshKey}
            onBookingsChanged={refreshEmployeeWorkspace}
            promotions={enabledPromotions}
            companySlug={companySlug}
            companyContext={effectiveCompanyContext}
            onRequestNewBooking={onRequestNewBooking && empleadosPuedenReservar ? onRequestNewBooking : undefined}
          />
        </article>
      )}

      {activeView === 'agenda' && esModoPedido && (
        <article className="employee-card">
          <div className="employee-card-header employee-upcoming-header">
            <div className="employee-upcoming-header-top">
              <div>
                <p className="admin-kicker">Pedidos</p>
                <h2>Listado cronológico</h2>
              </div>
              <div className="employee-top-actions-inline">
                <button
                  className="admin-link-button employee-upcoming-refresh"
                  type="button"
                  onClick={() => setPedidoDiaOffset(0)}
                  title="Ir a hoy"
                >
                  Hoy
                </button>
                <button
                  className="admin-link-button employee-upcoming-refresh"
                  type="button"
                  onClick={refreshEmployeeWorkspace}
                  title="Actualizar pedidos"
                >
                  Actualizar
                </button>
              </div>
            </div>
            <div className="employee-upcoming-date-filter" aria-label="Navegación por día">
              <button
                type="button"
                className="employee-date-nav"
                onClick={() => setPedidoDiaOffset((value) => value - 1)}
                aria-label="Día anterior"
                title="Día anterior"
              >
                ‹
              </button>
              <button type="button" className="employee-date-chip is-selected" onClick={() => {}}>
                <span className="employee-date-chip-day">{formatDate(fechaPedidoSeleccionada)}</span>
              </button>
              <button
                type="button"
                className="employee-date-nav"
                onClick={() => setPedidoDiaOffset((value) => value + 1)}
                aria-label="Día siguiente"
                title="Día siguiente"
              >
                ›
              </button>
            </div>
          </div>

          <div className="employee-upcoming-list">
            {pedidosAgendaRows.length === 0 ? (
              <div className="employee-empty-line">No hay pedidos para este día.</div>
            ) : pedidosAgendaRows.map((booking) => {
              const service = getServiceForBooking(booking, services);
              const bookingTitle = getBookingTitle(booking, service);
              const customerFields = getCustomerFields(booking);

              return (
                <div className="employee-upcoming-row" key={booking.id}>
                  <button
                    type="button"
                    className="employee-upcoming-row-main"
                    onClick={() => setDetailBookingId(booking.id)}
                  >
                    <span className="employee-upcoming-row-info">
                      <span className="employee-upcoming-row-title">{bookingTitle}</span>
                      <span className="employee-upcoming-row-client">{customerFields.name}</span>
                      <span className="employee-upcoming-row-date">
                        Creado {formatTime(booking.created_at || booking.start_at)} · Entrega {formatDate(booking.start_at)} · {formatTime(booking.start_at)}-{formatTime(booking.end_at)}
                      </span>
                    </span>
                    <span className="employee-upcoming-row-badges">
                      <span className="employee-upcoming-row-kind employee-upcoming-row-kind-servicio">Pedido</span>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </article>
      )}

      {activeView === 'close-attention' && (
        <article className="employee-card employee-agenda-card employee-close-attention-card">
          <AgendaGrid
            user={user}
            accessProfile="employee"
            employeeId={employeeId}
            refreshKey={refreshKey}
            onBookingsChanged={refreshEmployeeWorkspace}
            promotions={enabledPromotions}
            companySlug={companySlug}
            companyContext={effectiveCompanyContext}
            closeAttentionPage
          />
        </article>
      )}

      {activeView === 'profile' && (
        <div className="employee-profile-view">
          <article className="employee-card employee-profile-details-card">
            <div className="employee-card-header employee-card-header-actions-only">
              {isProfileEditing ? (
                <span>Editar</span>
              ) : (
                <button className="agenda-option-button employee-profile-edit-button" type="button" onClick={() => setIsProfileEditing(true)}>Editar</button>
              )}
            </div>

            <div className="employee-profile-data-layout">
              <label className="employee-profile-photo-field">
                <span>Foto de perfil</span>
                <span className="employee-profile-avatar" aria-hidden="true">
                  {(isProfileEditing ? profileForm.photo_url : employee?.photo_url) ? <img src={isProfileEditing ? profileForm.photo_url : employee.photo_url} alt="" /> : (employee?.name || 'E').slice(0, 1).toUpperCase()}
                </span>
                {isProfileEditing && <input type="file" accept="image/*" onChange={updateProfilePhoto} />}
              </label>

              <div className="employee-profile-form-grid">
                <label>Nombre<input value={profileForm.first_name} onChange={(event) => updateProfileField('first_name', event.target.value)} disabled={!isProfileEditing} /></label>
                <label>Apellido<input value={profileForm.last_name} onChange={(event) => updateProfileField('last_name', event.target.value)} disabled={!isProfileEditing} /></label>
                <label className="employee-profile-field-wide">Mail para notificaciones<input type="email" value={profileForm.email} onChange={(event) => updateProfileField('email', event.target.value)} disabled={!isProfileEditing} /></label>
                <label>Fecha de nacimiento<input type="date" value={profileForm.birth_date} max={new Date().toISOString().slice(0, 10)} onChange={(event) => updateProfileField('birth_date', event.target.value)} disabled={!isProfileEditing} /></label>
                <label>Edad<input value={calculateAge(profileForm.birth_date)} disabled /></label>
                <label className="employee-profile-field-wide">Celular<input value={profileForm.phone} onChange={(event) => updateProfileField('phone', event.target.value)} disabled={!isProfileEditing} /></label>
                <label>Calle<input value={profileForm.address_street} onChange={(event) => updateProfileField('address_street', event.target.value)} disabled={!isProfileEditing} /></label>
                <label>Nro.<input value={profileForm.address_number} onChange={(event) => updateProfileField('address_number', event.target.value)} disabled={!isProfileEditing} /></label>
                <label className="employee-profile-field-wide">Localidad<input value={profileForm.address_locality} onChange={(event) => updateProfileField('address_locality', event.target.value)} disabled={!isProfileEditing} /></label>
                <label className="employee-profile-field-wide employee-profile-services-field">
                  Servicios que atiende
                  <div className="employee-profile-services-list" role="list" aria-label="Servicios asignados por administración">
                    {assignedServiceNames.length ? assignedServiceNames.map((serviceName) => (
                      <span className="employee-profile-service-chip" role="listitem" key={serviceName}>{serviceName}</span>
                    )) : (
                      <span className="employee-profile-service-empty">Sin servicios asignados por administración.</span>
                    )}
                  </div>
                </label>
              </div>
            </div>

            {profileError && <div className="agenda-customer-error">{profileError}</div>}
            {isProfileEditing && (
              <div className="employee-profile-actions">
                <button className="agenda-option-button" type="button" onClick={cancelProfileEdit} disabled={isSavingProfile}>Cancelar</button>
                <button className="agenda-close-button" type="button" onClick={saveEmployeeProfile} disabled={isSavingProfile}>{isSavingProfile ? 'Guardando...' : 'Guardar'}</button>
              </div>
            )}
          </article>

          <article className="employee-card employee-profile-activity-card">
            <div className="employee-card-header">
              <div>
                <p className="admin-kicker">{esModoPedido ? 'Historial de pedidos' : 'Mis actividades'}</p>
                <h2>{esModoPedido ? 'Pedidos realizados' : 'Turnos realizados'}</h2>
              </div>
              <span>{visibleActivityRows.length}</span>
            </div>

            <div className="employee-activity-filter-row" aria-label={`Filtro de historial de ${esModoPedido ? 'pedidos' : 'turnos'}`}>
              <div className="employee-activity-filter-tabs" role="tablist" aria-label="Rango">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activityHistoryMode === 'week'}
                  className={activityHistoryMode === 'week' ? 'is-active' : ''}
                  onClick={() => setActivityHistoryMode('week')}
                >
                  Semana
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activityHistoryMode === 'all'}
                  className={activityHistoryMode === 'all' ? 'is-active' : ''}
                  onClick={() => setActivityHistoryMode('all')}
                >
                  Todos
                </button>
              </div>

              {activityHistoryMode === 'week' && selectedActivityWeek && (
                <div className="employee-activity-week-nav">
                  <button className="agenda-week-button" type="button" onClick={goToPreviousActivityWeek} disabled={!canGoToPreviousActivityWeek} aria-label="Semana anterior">←</button>
                  <div>
                    <strong>Semana del {selectedActivityWeek.label}</strong>
                    <span>Lunes a domingo</span>
                  </div>
                  <button className="agenda-week-button" type="button" onClick={goToNextActivityWeek} disabled={!canGoToNextActivityWeek} aria-label="Semana siguiente">→</button>
                </div>
              )}
            </div>

            <div className="employee-profile-list">
              {visibleActivityRows.length ? visibleActivityRows.map((booking) => {
                const service = getServiceForBooking(booking, services);
                const isClosed = isClosedBooking(booking);
                return (
                  <div className="employee-profile-row" key={booking.id}>
                    <div>
                      <strong>{getBookingTitle(booking, service)}</strong>
                      <span>{formatDate(booking.start_at)} · {formatTime(booking.start_at)}-{formatTime(booking.end_at)} · {getCustomerFields(booking).name}</span>
                    </div>
                    <small className={isClosed ? 'is-muted' : 'is-active'}>{isClosed ? 'Cerrado' : 'Asignado'}</small>
                  </div>
                );
              }) : <div className="employee-empty-line">No hay {esModoPedido ? 'pedidos' : 'turnos'} para el rango seleccionado.</div>}
            </div>
          </article>

          {preciosHabilitados && (
            <article className="employee-card employee-profile-payments-card">
              <div className="employee-card-header">
                <div>
                  <p className="admin-kicker">{esModoPedido ? 'Cobros de pedidos' : 'Cobros'}</p>
                  <h2>{esModoPedido ? 'Historial de cobros de pedidos' : 'Historial de cobros'}</h2>
                </div>
                <span>{paymentHistoryRows.length}</span>
              </div>
              <div className="employee-profile-list employee-payment-list">
                {selectedPaymentWeek ? (
                  <section className="employee-payment-week" key={selectedPaymentWeek.key}>
                    <div className="employee-payment-week-nav">
                      <button className="agenda-week-button" type="button" onClick={goToPreviousPaymentWeek} disabled={!canGoToPreviousPaymentWeek} aria-label="Semana anterior">←</button>
                      <div>
                        <strong>Semana del {selectedPaymentWeek.label}</strong>
                        <span>{selectedPaymentWeek.rows.length} {esModoPedido ? 'pedido(s)' : 'turno(s)'}</span>
                      </div>
                      <button className="agenda-week-button" type="button" onClick={goToNextPaymentWeek} disabled={!canGoToNextPaymentWeek} aria-label="Semana siguiente">→</button>
                    </div>
                    <div className="employee-payment-week-header">
                      <div>
                        <strong>Resumen semanal</strong>
                        <span>{selectedPaymentWeekIndex + 1} de {paymentHistoryWeeks.length}</span>
                      </div>
                      <div className="employee-payment-week-totals">
                        <span>Total <strong>{formatMoney(selectedPaymentWeek.total)}</strong></span>
                        {selectedPaymentWeek.employeeTotal > 0 && <span>Empleado <strong>{formatMoney(selectedPaymentWeek.employeeTotal)}</strong></span>}
                        {selectedPaymentWeek.companyTotal > 0 && <span>Empresa <strong>{formatMoney(selectedPaymentWeek.companyTotal)}</strong></span>}
                      </div>
                    </div>
                    {selectedPaymentWeek.rows.length ? selectedPaymentWeek.rows.map(({ booking, amount, employeeAmount, companyAmount }) => {
                      const service = getServiceForBooking(booking, services);
                      return (
                        <div className="employee-payment-row" key={booking.id}>
                          <div>
                            <strong>{getBookingTitle(booking, service)}</strong>
                            <span>{formatDate(booking.start_at)} · {getCustomerFields(booking).name}</span>
                          </div>
                          <div className="employee-payment-amounts">
                            <span>{esModoPedido ? 'Total cobrado del pedido' : 'Total cobrado'} <strong>{formatMoney(amount)}</strong></span>
                            {employeeAmount != null ? <span>Empleado <strong>{formatMoney(employeeAmount)}</strong></span> : <span>Rendición <strong>Pendiente</strong></span>}
                            {companyAmount != null && <span>Empresa <strong>{formatMoney(companyAmount)}</strong></span>}
                          </div>
                        </div>
                      );
                    }) : <div className="employee-empty-line">No hay {esModoPedido ? 'cobros de pedidos' : 'cobros'} registrados en esta semana.</div>}
                  </section>
                ) : <div className="employee-empty-line">Todavía no tenés {esModoPedido ? 'cobros de pedidos' : 'cobros'} registrados.</div>}
              </div>
            </article>
          )}
        </div>
      )}

      {activeView === 'availability' && (
        <EmployeeAvailabilityPanel
          user={user}
          mode="employee"
          employeeId={employeeId}
          employeeName={employee?.name || user?.email || 'Empleado'}
          onAvailabilityChanged={refreshEmployeeWorkspace}
          hideHeading
          companySlug={companySlug}
          companyContext={effectiveCompanyContext}
        />
      )}

      {detailBooking && (() => {
        const service = getServiceForBooking(detailBooking, services);
        const bookingTitle = getBookingTitle(detailBooking, service);
        const isClosed = isClosedBooking(detailBooking);
        const closedAmount = closedBookingAmounts[detailBooking.id];
        const customerFields = getCustomerFields(detailBooking);
        const statusLabel = isClosed ? 'Cerrado' : 'Asignado';
        const sucursalesHabilitadas = effectiveCompanyContext?.configuracion_operativa?.sucursales_habilitadas === true;
        const branchName = sucursalesHabilitadas && detailBooking.branch_id
          ? (Array.isArray(effectiveCompanyContext?.branches) ? effectiveCompanyContext.branches : []).find((branch) => String(branch.id) === String(detailBooking.branch_id))?.name || null
          : null;

        return (
          <div className="employee-booking-detail-overlay" role="dialog" aria-modal="true" onClick={() => setDetailBookingId(null)}>
            <div className="employee-booking-detail-modal" onClick={(event) => event.stopPropagation()}>
              <header className="employee-booking-detail-header">
                <div>
                  <p className="admin-kicker">Detalle del {esModoPedido ? 'pedido' : 'turno'}</p>
                  <h2>{bookingTitle}</h2>
                </div>
                <button
                  type="button"
                  className="employee-booking-detail-close"
                  onClick={() => setDetailBookingId(null)}
                  aria-label="Cerrar detalle"
                >
                  ✕
                </button>
              </header>
              <div className="employee-booking-detail-body">
                <div className="employee-booking-detail-field">
                  <span>Cliente</span>
                  <strong>{customerFields.name}</strong>
                </div>
                <div className="employee-booking-detail-field">
                  <span>Correo</span>
                  <strong>{customerFields.email}</strong>
                </div>
                <div className="employee-booking-detail-field">
                  <span>Fecha</span>
                  <strong>{formatDate(detailBooking.start_at)}</strong>
                </div>
                <div className="employee-booking-detail-field">
                  <span>Horario</span>
                  <strong>{formatTime(detailBooking.start_at)}-{formatTime(detailBooking.end_at)}</strong>
                </div>
                {branchName && (
                  <div className="employee-booking-detail-field">
                    <span>Sucursal</span>
                    <strong>{branchName}</strong>
                  </div>
                )}
                <div className="employee-booking-detail-field">
                  <span>Estado</span>
                  <strong className={isClosed ? 'is-muted' : 'is-active'}>{statusLabel}</strong>
                </div>
                {preciosHabilitados && isClosed && closedAmount !== undefined && (
                  <div className="employee-booking-detail-field">
                    <span>Cobrado</span>
                    <strong>{formatMoney(closedAmount)}</strong>
                  </div>
                )}
                {preciosHabilitados && isClosed && (
                  <div className="employee-booking-detail-field">
                    <span>Rendición</span>
                    <strong className={detailBooking.is_settled === true ? 'is-active' : 'is-muted'}>{detailBooking.is_settled === true ? 'Rendido' : 'Pendiente'}</strong>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}