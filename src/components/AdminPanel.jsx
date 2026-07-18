import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import ActivityIcon from './ActivityIcon';
import FormCard from './FormCard';
import { formatDisplayDateTime } from '../utils/dateFormat';

const emptyEmployee = {
  name: '',
  first_name: '',
  last_name: '',
  birth_date: '',
  phone: '',
  email: '',
  address_street: '',
  address_number: '',
  address_locality: '',
  photo_url: '',
  active: true,
  is_admin: false,
  serviceIds: [],
  promotionIds: []
};

const emptyService = {
  name: '',
  icon: '✨',
  color: '#42A5F5',
  default_duration: 30,
  base_price: '',
  activity_discount_check_id: '',
  active: true
};

const localEmployeeId = '00000000-0000-4000-8000-000000000101';
const localOtherEmployeeId = '00000000-0000-4000-8000-000000000102';

const buildLocalAdminData = () => ({
  employees: [
    {
      id: localEmployeeId,
      name: 'empleadolocal',
      first_name: 'Empleado',
      last_name: 'Local',
      phone: '1130986789',
      email: 'empleado.local@empresa-prueba.com',
      photo_url: '',
      active: true,
      is_admin: false,
      internal_username: 'empleadolocal'
    },
    {
      id: localOtherEmployeeId,
      name: 'cespinosa',
      first_name: 'Cintia',
      last_name: 'Espinosa',
      phone: '1130986789',
      email: 'matiasdlobo79@gmail.com',
      photo_url: '',
      active: true,
      is_admin: false,
      internal_username: 'cespinosa'
    }
  ],
  services: [
    { id: 1, name: 'Gastroenterologia', icon: '🩺', color: '#3fc9d5', default_duration: 30, base_price: 10000, active: true },
    { id: 2, name: 'Control general', icon: '✨', color: '#20a6b2', default_duration: 30, base_price: 8000, active: true }
  ],
  employeeServices: [
    { employee_id: localEmployeeId, service_id: 1 },
    { employee_id: localEmployeeId, service_id: 2 },
    { employee_id: localOtherEmployeeId, service_id: 1 }
  ]
});

const buildLocalSettlementRows = (employeeId) => {
  const today = new Date();
  const buildDate = (hours, minutes = 0) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, hours, minutes, 0, 0).toISOString();
  const employeeName = String(employeeId) === localOtherEmployeeId ? 'Mariana Torres' : 'Cliente Local';

  return [
    {
      id: '00000000-0000-4000-8000-000000000401',
      service_name: 'Gastroenterologia',
      employee_id: employeeId,
      employee_name: String(employeeId) === localOtherEmployeeId ? 'cespinosa' : 'empleadolocal',
      customer_name: employeeName,
      user_email: 'cliente.local@example.com',
      start_at: buildDate(10, 0),
      end_at: buildDate(10, 30),
      total_amount: 10000
    },
    {
      id: '00000000-0000-4000-8000-000000000402',
      service_name: 'Control general',
      employee_id: employeeId,
      employee_name: String(employeeId) === localOtherEmployeeId ? 'cespinosa' : 'empleadolocal',
      customer_name: 'Lucas Perez',
      user_email: 'lucas.perez@example.com',
      start_at: buildDate(11, 0),
      end_at: buildDate(11, 30),
      total_amount: 8000
    }
  ];
};

const parseMoney = (value) => {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  return Number(normalized) || 0;
};

const formatMoney = (value) => new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0
}).format(Number(value) || 0);

const formatSettlementDate = (value) => new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
}).format(new Date(value));

const formatSettlementTime = (value) => new Date(value).toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
}).replace(/^24:/, '00');

const getEmployeeDisplayName = (employee) => {
  const fullName = [employee?.first_name, employee?.last_name]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');

  return fullName || employee?.display_name || employee?.name || 'Empleado';
};

const getEmployeeUsername = (employee) =>
  employee?.internal_username || employee?.username || employee?.name || 'sin usuario';

const downloadSettlementPdf = async ({ employee, rows, percent }) => {
  const { jsPDF } = await import('jspdf');
  const employeeRows = rows.filter((row) => !row.employee_id || String(row.employee_id) === String(employee?.id));
  const normalizedPercent = Number(percent) || 0;
  const totals = employeeRows.reduce((summary, row) => {
    const total = Number(row.total_amount ?? row.totalAmount ?? 0);
    const employeeAmount = total * normalizedPercent / 100;
    return {
      total: summary.total + total,
      employee: summary.employee + employeeAmount,
      company: summary.company + total - employeeAmount
    };
  }, { total: 0, employee: 0, company: 0 });

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  let currentY = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Rendicion de turnos', margin, currentY);

  currentY += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Empleado: ${getEmployeeDisplayName(employee)}`, margin, currentY);
  doc.text(`Usuario: ${getEmployeeUsername(employee)}`, margin + 70, currentY);
  doc.text(`Fecha: ${formatSettlementDate(new Date())}`, pageWidth / 2 - 20, currentY);
  doc.text(`Porcentaje empleado: ${normalizedPercent}%`, pageWidth - 70, currentY);

  currentY += 10;
  doc.setFont('helvetica', 'bold');
  doc.text(`Total cobrado: ${formatMoney(totals.total)}`, margin, currentY);
  doc.text(`Empleado: ${formatMoney(totals.employee)}`, pageWidth / 2 - 20, currentY);
  doc.text(`Empresa: ${formatMoney(totals.company)}`, pageWidth - 70, currentY);

  currentY += 9;
  const columns = [
    { label: 'Servicio', x: margin, width: 44 },
    { label: 'Cliente', x: 58, width: 46 },
    { label: 'Fecha', x: 106, width: 24 },
    { label: 'Inicio', x: 132, width: 18 },
    { label: 'Fin', x: 152, width: 18 },
    { label: 'Total', x: 174, width: 26 },
    { label: '%', x: 202, width: 12 },
    { label: 'Empleado', x: 218, width: 28 },
    { label: 'Empresa', x: 250, width: 28 }
  ];

  doc.setFillColor(232, 245, 247);
  doc.rect(margin, currentY - 5, pageWidth - margin * 2, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  columns.forEach((column) => doc.text(column.label, column.x, currentY));
  currentY += 7;

  doc.setFont('helvetica', 'normal');
  employeeRows.forEach((row) => {
    const total = Number(row.total_amount ?? row.totalAmount ?? 0);
    const employeeAmount = total * normalizedPercent / 100;
    const companyAmount = total - employeeAmount;

    if (currentY > 190) {
      doc.addPage();
      currentY = 14;
    }

    const values = [
      row.service_name || row.serviceName || 'Servicio',
      row.customer_name || row.customerName || 'Cliente',
      formatSettlementDate(row.start_at || row.startAt),
      formatSettlementTime(row.start_at || row.startAt),
      formatSettlementTime(row.end_at || row.endAt),
      formatMoney(total),
      `${normalizedPercent}%`,
      formatMoney(employeeAmount),
      formatMoney(companyAmount)
    ];

    columns.forEach((column, index) => {
      const text = doc.splitTextToSize(String(values[index]), column.width);
      doc.text(text.slice(0, 2), column.x, currentY);
    });
    currentY += 8;
  });

  currentY += 3;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Totales', margin, currentY);
  doc.text(formatMoney(totals.total), 174, currentY);
  doc.text(formatMoney(totals.employee), 218, currentY);
  doc.text(formatMoney(totals.company), 250, currentY);

  const safeEmployeeName = normalizeComparableText(employee?.name || 'empleado').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'empleado';
  doc.save(`rendicion-${safeEmployeeName}-${new Date().toISOString().slice(0, 10)}.pdf`);
};

const getCurrentMonthName = () => new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(new Date()).toUpperCase();

const getDiscountValue = (discount) => Number(discount?.value ?? discount?.percent) || 0;

const getActivityDiscountLabel = (discount) => `${String(discount?.name || '').trim() || 'Check servicio'} (${discount?.valueType === 'amount' ? formatMoney(getDiscountValue(discount)) : `${getDiscountValue(discount)}%`})`;

const isMissingSaveServiceSignatureError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 'PGRST202' || message.includes('schema cache') || message.includes('could not find the function');
};

const saveAdminServiceRecord = async ({
  serviceId,
  name,
  icon,
  color,
  defaultDuration,
  basePrice,
  active,
  accountId,
  sessionToken,
  activityDiscountCheckId,
  companySlug
}) => {
  const baseArgs = {
    service_id_value: serviceId,
    name_value: name,
    icon_value: icon,
    color_value: color,
    default_duration_value: defaultDuration,
    base_price_value: basePrice,
    active_value: active,
    account_id_value: accountId,
    session_token_value: sessionToken,
    company_slug_value: companySlug
  };

  const resultWithCheck = await supabase.rpc('save_admin_service', {
    ...baseArgs,
    activity_discount_check_id_value: activityDiscountCheckId || null
  }).single();

  if (!resultWithCheck.error || !isMissingSaveServiceSignatureError(resultWithCheck.error)) {
    return resultWithCheck;
  }

  return supabase.rpc('save_admin_service', baseArgs).single();
};

const serviceIconGroups = [
  {
    label: 'Belleza',
    icons: ['💆', '💇', '💅', '💅🏻', '💅🏼', '💅🏽', '💅🏾', '💅🏿', '🖐️', '🦶', '🧖', '🧴', '🪒', '🪄', '⚡', '🔆', '✨', '✂️', '💄', '💋', '👁️', '👄', '🪮', '🧼', '🧽', '🫧', '🌸', '🌺', '🌷', '🪷']
  },
  {
    label: 'Bienestar',
    icons: ['🧘', '🩺', '💪', '🫶', '🦶', '🦷', '👂', '👃', '🧠', '❤️', '💙', '💚', '🌿', '🍃', '☀️', '🌙']
  },
  {
    label: 'Energía',
    icons: ['✨', '⭐', '🌟', '💫', '🔥', '⚡', '💎', '🎯', '🏆', '🎁', '🎉', '🎀', '🔔', '📌', '🪄', '🧿']
  },
  {
    label: 'Profesiones',
    icons: ['👩‍⚕️', '👨‍⚕️', '👩‍🔬', '👨‍🔬', '👩‍🏫', '👨‍🏫', '👩‍💼', '👨‍💼', '🧑‍🍳', '🧑‍🎨', '🧑‍🔧', '🧑‍💻']
  },
  {
    label: 'Redes',
    icons: ['whatsapp', 'telegram', '☎️', '💬', '💭', '📲', '📱', '📩', '📧', '📞', '📢', '📣', '🔔', '🌐', '🔗', '📍']
  },
  {
    label: 'Comercio',
    icons: ['🛒', '🛍️', '💳', '💵', '💰', '🧾', '🏷️', '📦', '🚚', '⭐', '✅', '🕒']
  }
];

const internalRoleLabels = {
  admin: 'Administrador',
  employee: 'Empleado'
};

const requestStatusLabels = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada'
};

const normalizeComparableText = (value) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const normalizeUsernamePart = (value) =>
  normalizeComparableText(value).replace(/[^a-z0-9]/g, '');

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const generateEmployeeUsername = (firstName, lastName) => {
  const normalizedFirstName = normalizeUsernamePart(firstName);
  const normalizedLastName = normalizeUsernamePart(lastName);

  if (!normalizedFirstName || !normalizedLastName) return '';

  return `${normalizedFirstName.slice(0, 1)}${normalizedLastName}`;
};

const getEmployeeServiceIds = (employeeId, links) =>
  links
    .filter((relation) => relation.employee_id === employeeId)
    .map((relation) => String(relation.service_id));

const getEmployeePromotionIds = (employeeId, promotions) =>
  promotions
    .map((promotion, index) => ({ promotion, id: `promotion-${index}` }))
    .filter(({ promotion }) => Array.isArray(promotion?.employeeIds) && promotion.employeeIds.some((id) => String(id) === String(employeeId)))
    .map(({ id }) => id);

const getPromotionServiceName = (promotion, index, pricesEnabled) =>
  promotion?.title || promotion?.name || (pricesEnabled ? `Promoción ${index + 1}` : `Banner ${index + 1}`);

const getEmployeeActivityNames = (employeeId, links, services, promotions) => {
  const serviceIds = new Set(getEmployeeServiceIds(employeeId, links));
  const promotionNames = promotions
    .map((promotion, index) => ({ promotion, index }))
    .filter(({ promotion }) => Array.isArray(promotion?.employeeIds) && promotion.employeeIds.some((id) => String(id) === String(employeeId)))
    .map(({ promotion, index }) => getPromotionServiceName(promotion, index, Boolean(promotion?.price || promotion?.title || promotion?.description || promotion?.value)))
    .filter(Boolean);

  return [
    ...services
    .filter((service) => serviceIds.has(String(service.id)))
    .map((service) => service.name),
    ...promotionNames
  ].join(' · ');
};

const serviceMatchesPayload = (service, payload) =>
  service &&
  service.name === payload.name &&
  (service.icon || null) === payload.icon &&
  service.color === payload.color &&
  Number(service.default_duration) === Number(payload.default_duration) &&
  Number(service.base_price || 0) === Number(payload.base_price || 0) &&
  (!Object.prototype.hasOwnProperty.call(service, 'activity_discount_check_id') || String(service.activity_discount_check_id || '') === String(payload.activity_discount_check_id || '')) &&
  service.active === payload.active;

const employeeMatchesPayload = (employee, payload) =>
  employee &&
  employee.name === payload.name &&
  (employee.first_name || null) === payload.first_name &&
  (employee.last_name || null) === payload.last_name &&
  (employee.birth_date || null) === payload.birth_date &&
  (employee.phone || null) === payload.phone &&
  (employee.address_street || null) === payload.address_street &&
  (employee.address_number || null) === payload.address_number &&
  (employee.address_locality || null) === payload.address_locality &&
  (employee.photo_url || null) === payload.photo_url &&
  (employee.email || null) === payload.email &&
  employee.active === payload.active;

const formatRequestDate = (value) => {
  if (!value) return 'Sin fecha';

  return formatDisplayDateTime(value);
};

const calculateAge = (birthDateValue) => {
  if (!birthDateValue) return '';

  const birthDate = new Date(`${birthDateValue}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return '';

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age >= 0 ? String(age) : '';
};

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
  reader.readAsDataURL(file);
});

const formatSupabaseError = (error) => [
  error.message,
  error.code ? `Código: ${error.code}` : '',
  error.details ? `Detalle: ${error.details}` : '',
  error.hint ? `Ayuda: ${error.hint}` : ''
].filter(Boolean).join('\n');

export default function AdminPanel({ view, user, onDataChanged, adminProfileSummary = null, companySlug, companyContext }) {
  const [employees, setEmployees] = useState([]);
  const [services, setServices] = useState([]);
  const [employeeServices, setEmployeeServices] = useState([]);
  const [appConfig, setAppConfig] = useState(null);
  const [promotions, setPromotions] = useState([]);
  const emptyBookingCostSummary = { assigned: { bookingCount: 0, total: 0 }, closed: { bookingCount: 0, total: 0 }, pending: { bookingCount: 0, total: 0 } };
  const [bookingCostSummary, setBookingCostSummary] = useState(emptyBookingCostSummary);
  const [accessRequests, setAccessRequests] = useState([]);
  const [employeeForm, setEmployeeForm] = useState(emptyEmployee);
  const [serviceForm, setServiceForm] = useState(emptyService);
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [isEmployeeFormOpen, setIsEmployeeFormOpen] = useState(false);
  const [isServiceFormOpen, setIsServiceFormOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');
  const emojiPickerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settlementEmployee, setSettlementEmployee] = useState(null);
  const [settlementRows, setSettlementRows] = useState([]);
  const [settlementPercent, setSettlementPercent] = useState('70');
  const [selectedSettlementIds, setSelectedSettlementIds] = useState([]);
  const [isSettlementLoading, setIsSettlementLoading] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [localSettledBookingIds, setLocalSettledBookingIds] = useState([]);
  const preciosHabilitados = companyContext?.configuracion_operativa?.precios_habilitados !== false;
  const descuentosHabilitados = preciosHabilitados && companyContext?.configuracion_operativa?.descuentos_habilitados !== false;
  const promocionesHabilitadas = companyContext?.configuracion_operativa?.promociones_habilitadas !== false;

  const activeServices = useMemo(
    () => services.filter((service) => service.active !== false),
    [services]
  );
  const enabledPromotions = useMemo(
    () => promocionesHabilitadas
      ? promotions
        .map((promotion, index) => ({ promotion, index }))
        .filter(({ promotion }) => promotion?.enabled !== false && (preciosHabilitados ? (promotion?.title || promotion?.description || promotion?.value || promotion?.imageDataUrl) : promotion?.imageDataUrl))
      : [],
    [promocionesHabilitadas, preciosHabilitados, promotions]
  );
  const activityDiscountChecks = useMemo(
    () => descuentosHabilitados
      ? (Array.isArray(appConfig?.discounts) ? appConfig.discounts : [])
        .filter((discount) => discount?.enabled !== false && discount?.discountType === 'activity' && discount?.id)
      : [],
    [descuentosHabilitados, appConfig]
  );
  const promotionServices = useMemo(
    () => enabledPromotions.map(({ promotion, index }) => ({
      id: `promotion-${index}`,
      name: getPromotionServiceName(promotion, index, preciosHabilitados),
      icon: '✨',
      color: '#67e8f9',
      default_duration: 30,
      active: true,
      promotion
    })),
    [enabledPromotions, preciosHabilitados]
  );

  const employeeUsernamePreview = useMemo(
    () => generateEmployeeUsername(employeeForm.first_name, employeeForm.last_name),
    [employeeForm.first_name, employeeForm.last_name]
  );

  const selectedSettlementRows = useMemo(
    () => settlementRows.filter((row) => selectedSettlementIds.includes(String(row.id))),
    [settlementRows, selectedSettlementIds]
  );

  const settlementTotals = useMemo(() => {
    const percent = Number(settlementPercent) || 0;

    return selectedSettlementRows.reduce((summary, row) => {
      const total = Number(row.total_amount || 0);
      const employeeAmount = total * percent / 100;

      return {
        total: summary.total + total,
        employee: summary.employee + employeeAmount,
        company: summary.company + total - employeeAmount
      };
    }, { total: 0, employee: 0, company: 0 });
  }, [selectedSettlementRows, settlementPercent]);

  const internalAdminAccountId = user?.isInternal && user?.role === 'admin' ? user.id : null;
  const internalSessionToken = user?.isInternal ? user.sessionToken : null;

  const filteredIconGroups = useMemo(() => {
    const normalizedSearch = normalizeComparableText(emojiSearch);
    if (!normalizedSearch) return serviceIconGroups;

    return serviceIconGroups
      .map((group) => ({
        ...group,
        icons: group.icons.filter((icon) => normalizeComparableText(`${group.label} ${icon}`).includes(normalizedSearch))
      }))
      .filter((group) => group.icons.length);
  }, [emojiSearch]);

  const loadAdminData = useCallback(async () => {
    setIsLoading(true);

    if (user?.isLocalInternal) {
      const localData = buildLocalAdminData();
      setEmployees(localData.employees);
      setServices(localData.services);
      setEmployeeServices(localData.employeeServices);
      setAppConfig({ promotions: [], discounts: [] });
      setPromotions([]);
      setBookingCostSummary({ assigned: { bookingCount: 2, total: 18000 }, closed: { bookingCount: 2, total: 18000 }, pending: { bookingCount: 1, total: 9000 } });
      setAccessRequests([]);
      setIsLoading(false);
      return;
    }

    const [adminResult, configResult] = await Promise.all([
      supabase.rpc('get_admin_panel_data', {
        account_id_value: internalAdminAccountId,
        session_token_value: internalSessionToken,
        request_status_value: view === 'employees' ? 'pending' : null,
        company_slug_value: companySlug
      }),
      supabase.rpc('get_app_configuration', {
        company_slug_value: companySlug
      })
    ]);

    const { data, error } = adminResult;

    if (error) {
      alert(`No se pudo cargar la administración. ${formatSupabaseError(error)}`);
      setIsLoading(false);
      return;
    }

    setEmployees(data?.employees || []);
    setServices(data?.services || []);
    setEmployeeServices(data?.employeeServices || []);
    setAppConfig(configResult.data || null);
    setPromotions(Array.isArray(configResult.data?.promotions) ? configResult.data.promotions : []);
    const summary = data?.adminBookingCostSummary || {};
    const legacyClosedSummary = data?.currentMonthClosureSummary || {};
    setBookingCostSummary({
      assigned: {
        bookingCount: Number(summary?.assigned?.booking_count || summary?.assigned?.bookingCount || 0),
        total: Number(summary?.assigned?.total || 0)
      },
      closed: {
        bookingCount: Number(summary?.closed?.booking_count || summary?.closed?.bookingCount || legacyClosedSummary?.booking_count || legacyClosedSummary?.bookingCount || 0),
        total: Number(summary?.closed?.total || legacyClosedSummary?.total || 0)
      },
      pending: {
        bookingCount: Number(summary?.pending?.booking_count || summary?.pending?.bookingCount || 0),
        total: Number(summary?.pending?.total || 0)
      }
    });
    setAccessRequests(view === 'employees' ? data?.accessRequests || [] : []);
    setIsLoading(false);
  }, [internalAdminAccountId, internalSessionToken, view, companySlug, user?.isLocalInternal]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadAdminData();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadAdminData]);

  useEffect(() => {
    if (!isEmojiPickerOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!emojiPickerRef.current?.contains(event.target)) {
        setIsEmojiPickerOpen(false);
        setEmojiSearch('');
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isEmojiPickerOpen]);

  const resetEmployeeForm = () => {
    setEmployeeForm(emptyEmployee);
    setEditingEmployeeId(null);
  };

  const resetServiceForm = () => {
    setServiceForm(emptyService);
    setEditingServiceId(null);
    setIsEmojiPickerOpen(false);
    setEmojiSearch('');
  };

  const updateEmployeeField = (field, value) => {
    setEmployeeForm((current) => ({ ...current, [field]: value }));
  };

  const updateEmployeePhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Seleccioná una imagen válida para la foto de perfil.');
      return;
    }

    if (file.size > 750 * 1024) {
      alert('La foto debe pesar menos de 750 KB.');
      return;
    }

    try {
      const photoUrl = await fileToDataUrl(file);
      updateEmployeeField('photo_url', photoUrl);
    } catch (error) {
      alert(error.message);
    }
  };

  const updateServiceField = (field, value) => {
    setServiceForm((current) => ({ ...current, [field]: value }));
  };

  const selectServiceIcon = (icon) => {
    updateServiceField('icon', icon);
    setIsEmojiPickerOpen(false);
    setEmojiSearch('');
  };

  const toggleEmployeeService = (serviceId) => {
    setEmployeeForm((current) => {
      const normalizedId = String(serviceId);
      const hasService = current.serviceIds.includes(normalizedId);
      const nextServiceIds = hasService
        ? current.serviceIds.filter((currentId) => currentId !== normalizedId)
        : [...current.serviceIds, normalizedId];

      return {
        ...current,
        serviceIds: nextServiceIds
      };
    });
  };

  const toggleEmployeePromotion = (promotionId) => {
    setEmployeeForm((current) => {
      const normalizedId = String(promotionId);
      const hasPromotion = current.promotionIds.includes(normalizedId);
      const nextPromotionIds = hasPromotion
        ? current.promotionIds.filter((currentId) => currentId !== normalizedId)
        : [...current.promotionIds, normalizedId];

      return {
        ...current,
        promotionIds: nextPromotionIds
      };
    });
  };

  const getServiceActivityCheckId = (service) => {
    if (service?.activity_discount_check_id) return service.activity_discount_check_id;
    const assignedDiscount = (Array.isArray(appConfig?.discounts) ? appConfig.discounts : [])
      .find((discount) => discount?.discountType === 'activity' && (discount.serviceIds || []).some((serviceId) => String(serviceId) === String(service?.id)));
    return assignedDiscount?.id || '';
  };

  const saveServiceActivityCheckAssignment = async (serviceId, checkId) => {
    if (!serviceId) return { error: null };

    const sourceConfig = appConfig || {};
    const nextDiscounts = (Array.isArray(sourceConfig.discounts) ? sourceConfig.discounts : []).map((discount) => {
      if (discount?.discountType !== 'activity') return discount;
      const currentServiceIds = Array.isArray(discount.serviceIds) ? discount.serviceIds.map(String) : [];
      const withoutService = currentServiceIds.filter((currentId) => String(currentId) !== String(serviceId));

      return {
        ...discount,
        serviceIds: String(discount.id) === String(checkId) ? Array.from(new Set([...withoutService, String(serviceId)])) : withoutService
      };
    });

    const result = await supabase.rpc('save_admin_app_configuration', {
      company_name_value: sourceConfig.company_name || null,
      banner_data_url_value: sourceConfig.banner_data_url || null,
      banner_file_name_value: sourceConfig.banner_file_name || null,
      banner_mime_type_value: sourceConfig.banner_mime_type || null,
      banner_images_value: Array.isArray(sourceConfig.banner_images) ? sourceConfig.banner_images : [],
      promotions_value: Array.isArray(sourceConfig.promotions) ? sourceConfig.promotions : promotions,
      discounts_value: nextDiscounts,
      client_can_choose_employee_value: Boolean(sourceConfig.client_can_choose_employee),
      account_id_value: internalAdminAccountId,
      session_token_value: internalSessionToken,
      company_slug_value: companySlug
    });

    if (!result.error) {
      setAppConfig(result.data || { ...sourceConfig, discounts: nextDiscounts });
    }

    return result;
  };

  const editEmployee = (employee) => {
    setEditingEmployeeId(employee.id);
    setIsEmployeeFormOpen(true);
    setEmployeeForm({
      name: employee.name || '',
      first_name: employee.first_name || '',
      last_name: employee.last_name || '',
      birth_date: employee.birth_date || '',
      phone: employee.phone || '',
      email: employee.email || '',
      address_street: employee.address_street || '',
      address_number: employee.address_number || '',
      address_locality: employee.address_locality || '',
      photo_url: employee.photo_url || '',
      active: employee.active !== false,
      is_admin: employee.is_admin === true,
      serviceIds: getEmployeeServiceIds(employee.id, employeeServices),
      promotionIds: getEmployeePromotionIds(employee.id, promotions)
    });
  };

  const saveEmployeePromotionAssignments = async (employeeId) => {
    if (!employeeId) return { error: null };

    const sourceConfig = appConfig || {};
    const sourcePromotions = Array.isArray(sourceConfig.promotions) ? sourceConfig.promotions : promotions;
    const nextPromotions = sourcePromotions.map((promotion, index) => {
      const promotionId = `promotion-${index}`;
      const currentEmployeeIds = Array.isArray(promotion?.employeeIds) ? promotion.employeeIds.map(String) : [];
      const nextEmployeeIds = employeeForm.promotionIds.includes(promotionId)
        ? Array.from(new Set([...currentEmployeeIds, String(employeeId)]))
        : currentEmployeeIds.filter((currentId) => String(currentId) !== String(employeeId));

      return {
        ...promotion,
        employeeIds: nextEmployeeIds
      };
    });

    return supabase.rpc('save_admin_app_configuration', {
      company_name_value: sourceConfig.company_name || null,
      banner_data_url_value: sourceConfig.banner_data_url || null,
      banner_file_name_value: sourceConfig.banner_file_name || null,
      banner_mime_type_value: sourceConfig.banner_mime_type || null,
      banner_images_value: Array.isArray(sourceConfig.banner_images) ? sourceConfig.banner_images : [],
      promotions_value: nextPromotions,
      discounts_value: Array.isArray(sourceConfig.discounts) ? sourceConfig.discounts : [],
      client_can_choose_employee_value: Boolean(sourceConfig.client_can_choose_employee),
      account_id_value: internalAdminAccountId,
      session_token_value: internalSessionToken,
      company_slug_value: companySlug
    });
  };

  const editService = (service) => {
    setEditingServiceId(service.id);
    setIsServiceFormOpen(true);
    setServiceForm({
      name: service.name || '',
      icon: service.icon || '✨',
      color: service.color || '#42A5F5',
      default_duration: service.default_duration || 30,
      base_price: service.base_price === 0 || service.base_price ? String(service.base_price) : '',
      activity_discount_check_id: getServiceActivityCheckId(service),
      active: service.active !== false
    });
  };

  const saveEmployee = async (event) => {
    event.preventDefault();

    const fullName = [employeeForm.first_name.trim(), employeeForm.last_name.trim()].filter(Boolean).join(' ');

    const payload = {
      name: employeeUsernamePreview,
      first_name: employeeForm.first_name.trim() || null,
      last_name: employeeForm.last_name.trim() || null,
      birth_date: employeeForm.birth_date || null,
      phone: employeeForm.phone.trim() || null,
      email: employeeForm.email.trim().toLowerCase() || null,
      address_street: employeeForm.address_street.trim() || null,
      address_number: employeeForm.address_number.trim() || null,
      address_locality: employeeForm.address_locality.trim() || null,
      photo_url: employeeForm.photo_url || null,
      active: editingEmployeeId ? employeeForm.active : true,
      is_admin: employeeForm.is_admin
    };

    if (!payload.first_name || !payload.last_name) {
      alert('Ingresá nombre y apellido para generar el usuario.');
      return;
    }

    if (!payload.name || !fullName) {
      alert('No se pudo generar el usuario del empleado.');
      return;
    }

    if (!payload.email || !isValidEmail(payload.email)) {
      alert('Ingresá un mail válido para notificar al empleado.');
      return;
    }

    setIsSaving(true);

    const adminAccountId = user?.isInternal && user?.role === 'admin' ? user.id : null;
    const employeeResult = editingEmployeeId
      ? await supabase.rpc('update_admin_employee', {
        employee_id_value: editingEmployeeId,
        name_value: payload.name,
        first_name_value: payload.first_name,
        last_name_value: payload.last_name,
        birth_date_value: payload.birth_date,
        phone_value: payload.phone,
        email_value: payload.email,
        address_street_value: payload.address_street,
        address_number_value: payload.address_number,
        address_locality_value: payload.address_locality,
        photo_url_value: payload.photo_url,
        active_value: payload.active,
        is_admin_value: payload.is_admin,
        service_ids_value: employeeForm.serviceIds,
        account_id_value: adminAccountId,
        session_token_value: internalSessionToken,
        company_slug_value: companySlug
      })
      : await supabase.rpc('create_admin_employee', {
        name_value: payload.name,
        first_name_value: payload.first_name,
        last_name_value: payload.last_name,
        birth_date_value: payload.birth_date,
        phone_value: payload.phone,
        email_value: payload.email,
        address_street_value: payload.address_street,
        address_number_value: payload.address_number,
        address_locality_value: payload.address_locality,
        photo_url_value: payload.photo_url,
        service_ids_value: employeeForm.serviceIds,
        is_admin_value: payload.is_admin,
        account_id_value: adminAccountId,
        session_token_value: internalSessionToken,
        company_slug_value: companySlug
      }).single();

    if (employeeResult.error) {
      alert(`No se pudo guardar el empleado:\n${formatSupabaseError(employeeResult.error)}`);
      setIsSaving(false);
      return;
    }

    const savedEmployee = employeeResult;

    if (savedEmployee.error || !savedEmployee.data) {
      alert(`No se pudo verificar el guardado del empleado: ${savedEmployee.error?.message || 'Supabase no devolvió el empleado.'}`);
      setIsSaving(false);
      return;
    }

    if (editingEmployeeId && !employeeMatchesPayload(savedEmployee.data, payload)) {
      alert('Supabase recibió el pedido, pero no aplicó los cambios del empleado. Revisá las policies de UPDATE sobre la tabla employees.');
      setIsSaving(false);
      return;
    }

    if (!editingEmployeeId) {
      alert(`${payload.is_admin ? 'Administrador' : 'Empleado'} activo creado. Usuario: ${savedEmployee.data.internal_username}. Contraseña inicial: 123456. Se le pedirá cambiarla en el primer ingreso.`);
    }

    const promotionAssignmentResult = await saveEmployeePromotionAssignments(savedEmployee.data.id);

    if (promotionAssignmentResult.error) {
      alert(`El empleado se guardó, pero no se pudieron guardar sus promociones:\n${formatSupabaseError(promotionAssignmentResult.error)}`);
      setIsSaving(false);
      return;
    }

    resetEmployeeForm();
    setIsEmployeeFormOpen(false);
    await loadAdminData();
    onDataChanged?.();
    setIsSaving(false);
  };

  const deleteEmployee = async (employee) => {
    const shouldDelete = window.confirm(`¿Eliminar a ${employee.name}?`);
    if (!shouldDelete) return;

    const now = new Date().toISOString().slice(0, 19);

    const { data: existingBookings, error: bookingError } = await supabase
      .from('bookings')
      .select('id')
      .eq('employee_id', employee.id)
      .in('status', ['reserved', 'confirmed'])
      .gte('end_at', now)
      .limit(1);

    if (bookingError) {
      alert('No se pudo validar si el empleado tiene turnos.');
      return;
    }

    if (existingBookings?.length) {
      alert('No se puede eliminar un empleado con turnos futuros. Cancelá o reasigná esos turnos primero.');
      return;
    }

    const employeeResult = await supabase.rpc('delete_admin_employee', {
      employee_id_value: employee.id,
      account_id_value: internalAdminAccountId,
      session_token_value: internalSessionToken
    });

    if (employeeResult.error) {
      alert(`No se pudo eliminar el empleado. ${employeeResult.error.message}`);
      return;
    }

    if (editingEmployeeId === employee.id) resetEmployeeForm();
    await loadAdminData();
    onDataChanged?.();
  };

  const resetEmployeePassword = async (employee) => {
    const shouldReset = window.confirm(`¿Resetear la contraseña de ${employee.name} a 123456? Se le pedirá cambiarla al ingresar.`);
    if (!shouldReset) return;

    const { data, error } = await supabase.rpc('reset_admin_employee_password', {
      employee_id_value: employee.id,
      account_id_value: internalAdminAccountId,
      session_token_value: internalSessionToken
    }).single();

    if (error) {
      alert(`No se pudo resetear la contraseña. ${formatSupabaseError(error)}`);
      return;
    }

    alert(`Contraseña reseteada. Usuario: ${data.username}. Clave temporal: ${data.temporary_password}. Se le pedirá cambiarla al ingresar.`);
    await loadAdminData();
  };

  const openSettlement = async (employee) => {
    setSettlementEmployee(employee);
    setSettlementRows([]);
    setSelectedSettlementIds([]);
    setSettlementPercent('70');
    setIsSettlementLoading(true);

    if (user?.isLocalInternal) {
      const rows = buildLocalSettlementRows(employee.id).filter((row) => !localSettledBookingIds.includes(String(row.id)));
      setSettlementRows(rows);
      setSelectedSettlementIds(rows.map((row) => String(row.id)));
      setIsSettlementLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc('get_employee_pending_settlement_bookings', {
      employee_id_value: employee.id,
      account_id_value: internalAdminAccountId,
      session_token_value: internalSessionToken,
      company_slug_value: companySlug
    });

    setIsSettlementLoading(false);

    if (error) {
      alert(`No se pudo cargar la rendición. ${formatSupabaseError(error)}`);
      setSettlementEmployee(null);
      return;
    }

    const rows = (Array.isArray(data) ? data : [])
      .filter((row) => !row.employee_id || String(row.employee_id) === String(employee.id))
      .map((row) => ({
        ...row,
        total_amount: Number(row.total_amount || 0)
      }));

    setSettlementRows(rows);
    setSelectedSettlementIds(rows.map((row) => String(row.id)));
  };

  const closeSettlement = () => {
    if (isSettling) return;

    setSettlementEmployee(null);
    setSettlementRows([]);
    setSelectedSettlementIds([]);
  };

  const toggleSettlementRow = (bookingId) => {
    const normalizedId = String(bookingId);
    setSelectedSettlementIds((current) => current.includes(normalizedId)
      ? current.filter((id) => id !== normalizedId)
      : [...current, normalizedId]);
  };

  const toggleAllSettlementRows = () => {
    setSelectedSettlementIds((current) => current.length === settlementRows.length
      ? []
      : settlementRows.map((row) => String(row.id)));
  };

  const confirmSettlement = async () => {
    if (!settlementEmployee) return;
    if (!selectedSettlementRows.length) {
      alert('Seleccioná al menos un turno para rendir.');
      return;
    }

    const percent = Number(settlementPercent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      alert('Ingresá un porcentaje entre 0 y 100.');
      return;
    }

    setIsSettling(true);

    if (user?.isLocalInternal) {
      await downloadSettlementPdf({ employee: settlementEmployee, rows: selectedSettlementRows, percent });
      setIsSettling(false);
      setLocalSettledBookingIds((current) => Array.from(new Set([...current, ...selectedSettlementIds])));
      setSettlementRows((current) => current.filter((row) => !selectedSettlementIds.includes(String(row.id))));
      setSelectedSettlementIds([]);
      return;
    }

    const { data, error } = await supabase.rpc('settle_employee_bookings', {
      employee_id_value: settlementEmployee.id,
      booking_ids_value: selectedSettlementRows.map((row) => row.id),
      commission_percent_value: percent,
      account_id_value: internalAdminAccountId,
      session_token_value: internalSessionToken,
      company_slug_value: companySlug
    });

    if (error) {
      setIsSettling(false);
      alert(`No se pudo confirmar la rendición. ${formatSupabaseError(error)}`);
      return;
    }

    const reportRows = (Array.isArray(data?.items) && data.items.length ? data.items : selectedSettlementRows)
      .filter((row) => !row.employee_id || String(row.employee_id) === String(settlementEmployee.id));
    await downloadSettlementPdf({ employee: settlementEmployee, rows: reportRows, percent });

    setIsSettling(false);
    setSettlementRows((current) => current.filter((row) => !selectedSettlementIds.includes(String(row.id))));
    setSelectedSettlementIds([]);
    await loadAdminData();
    onDataChanged?.();
  };

  const saveService = async (event) => {
    event.preventDefault();

    const payload = {
      name: serviceForm.name.trim(),
      icon: serviceForm.icon.trim() || null,
      color: serviceForm.color || '#42A5F5',
      default_duration: Number(serviceForm.default_duration) || 30,
      base_price: preciosHabilitados ? parseMoney(serviceForm.base_price) : 0,
      activity_discount_check_id: preciosHabilitados ? serviceForm.activity_discount_check_id || '' : '',
      active: serviceForm.active
    };

    const selectedActivityCheck = activityDiscountChecks.find((discount) => String(discount.id) === String(payload.activity_discount_check_id));
    if (preciosHabilitados && selectedActivityCheck?.valueType === 'amount' && Number(selectedActivityCheck.value || 0) > payload.base_price) {
      alert(`El check ${selectedActivityCheck.name || selectedActivityCheck.id} no puede superar el precio base del servicio.`);
      return;
    }

    if (!payload.name) {
      alert('Ingresá el nombre del servicio.');
      return;
    }

    const normalizedName = normalizeComparableText(payload.name);
    const duplicatedService = services.find((service) =>
      String(service.id) !== String(editingServiceId) &&
      normalizeComparableText(service.name) === normalizedName
    );

    if (duplicatedService) {
      alert(`Ya existe un servicio llamado ${duplicatedService.name}. Revisá mayúsculas, acentos o tildes antes de crear otro.`);
      return;
    }

    setIsSaving(true);

    const serviceResult = await saveAdminServiceRecord({
      serviceId: editingServiceId,
      name: payload.name,
      icon: payload.icon,
      color: payload.color,
      defaultDuration: payload.default_duration,
      basePrice: payload.base_price,
      active: payload.active,
      accountId: internalAdminAccountId,
      sessionToken: internalSessionToken,
      activityDiscountCheckId: payload.activity_discount_check_id,
      companySlug
    });

    if (serviceResult.error) {
      alert(`No se pudo guardar el servicio: ${serviceResult.error.message}`);
      setIsSaving(false);
      return;
    }

    if (!serviceResult.data) {
      alert('No se pudo verificar el guardado: Supabase no devolvió el servicio.');
      setIsSaving(false);
      return;
    }

    if (!serviceMatchesPayload(serviceResult.data, payload)) {
      alert('Supabase recibió el pedido, pero no aplicó los cambios.');
      setIsSaving(false);
      return;
    }

    const assignmentResult = await saveServiceActivityCheckAssignment(serviceResult.data.id, payload.activity_discount_check_id);
    if (assignmentResult.error) {
      alert(`El servicio se guardó, pero no se pudo asignar el check: ${assignmentResult.error.message}`);
      setIsSaving(false);
      return;
    }

    setServices((currentServices) => {
      const serviceWithCheck = {
        ...serviceResult.data,
        activity_discount_check_id: payload.activity_discount_check_id || ''
      };
      if (editingServiceId) {
        return currentServices.map((service) =>
          String(service.id) === String(serviceResult.data.id) ? serviceWithCheck : service
        );
      }

      return [...currentServices, serviceWithCheck];
    });

    resetServiceForm();
    setIsServiceFormOpen(false);
    await loadAdminData();
    onDataChanged?.();
    setIsSaving(false);
  };

  const toggleServiceStatus = async (service) => {
    const nextActive = service.active === false;
    const { data: updatedService, error } = await saveAdminServiceRecord({
      serviceId: service.id,
      name: service.name,
      icon: service.icon,
      color: service.color,
      defaultDuration: service.default_duration,
      basePrice: Number(service.base_price || 0),
      active: nextActive,
      accountId: internalAdminAccountId,
      sessionToken: internalSessionToken,
      activityDiscountCheckId: getServiceActivityCheckId(service)
    });

    if (error) {
      alert(`No se pudo cambiar el estado del servicio: ${error.message}`);
      return;
    }

    if (updatedService?.active !== nextActive) {
      alert('Supabase recibió el pedido, pero no cambió el estado.');
      return;
    }

    await loadAdminData();
    onDataChanged?.();
  };

  const deleteService = async (service) => {
    const shouldDelete = window.confirm(`¿Eliminar el servicio ${service.name}?`);
    if (!shouldDelete) return;

    const { data: existingBookings, error: bookingError } = await supabase
      .from('bookings')
      .select('id')
      .eq('service', service.id)
      .limit(1);

    if (bookingError) {
      alert('No se pudo validar si el servicio tiene turnos.');
      return;
    }

    if (existingBookings?.length) {
      alert('No se puede eliminar un servicio con turnos cargados. Podés desactivarlo para que no se ofrezca más.');
      return;
    }

    const serviceResult = await supabase.rpc('delete_admin_service', {
      service_id_value: service.id,
      account_id_value: internalAdminAccountId,
      session_token_value: internalSessionToken
    });

    if (serviceResult.error) {
      alert(`No se pudo eliminar el servicio. ${serviceResult.error.message}`);
      return;
    }

    if (editingServiceId === service.id) resetServiceForm();
    await loadAdminData();
    onDataChanged?.();
  };

  const approveAccessRequest = async (request) => {
    setIsSaving(true);

    const { error } = await supabase.rpc('approve_internal_registration', {
      request_id_value: request.id,
      employee_id_value: null,
      account_id_value: internalAdminAccountId,
      session_token_value: internalSessionToken
    });

    if (error) {
      alert(`No se pudo aprobar la solicitud: ${error.message}`);
      setIsSaving(false);
      return;
    }

    await loadAdminData();
    onDataChanged?.();
    setIsSaving(false);
  };

  const rejectAccessRequest = async (request) => {
    const shouldReject = window.confirm(`¿Rechazar la solicitud de ${request.display_name}?`);
    if (!shouldReject) return;

    setIsSaving(true);

    const { error } = await supabase.rpc('reject_internal_registration', {
      request_id_value: request.id,
      account_id_value: internalAdminAccountId,
      session_token_value: internalSessionToken
    });

    if (error) {
      alert(`No se pudo rechazar la solicitud: ${error.message}`);
      setIsSaving(false);
      return;
    }

    await loadAdminData();
    onDataChanged?.();
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <section className="admin-shell employee-admin-manager">
        <div className="agenda-modal-card admin-loading-card">
          <div className="agenda-modal-header">Administración</div>
          <div className="agenda-modal-body agenda-empty-state">Cargando datos...</div>
        </div>
      </section>
    );
  }

  if (view === 'employees') {
    return (
      <section className="admin-shell employee-admin-manager">
        <div className="admin-page-heading">
          <div>
            <h1>Administración de empleados</h1>
            <p>Gestioná perfiles internos, servicios asignados y datos de contacto.</p>
          </div>
          {adminProfileSummary}
        </div>

        <div className="admin-external-actions">
          <button className="admin-link-button" type="button" onClick={loadAdminData}>
            Actualizar
          </button>
        </div>

        <div className="admin-metric-grid employee-metric-grid" aria-label="Resumen de empleados">
          <article className="admin-metric-card">
            <span>Empleados</span>
            <strong>{employees.length}</strong>
            <small>Total registrados.</small>
          </article>
          <article className="admin-metric-card">
            <span>Activos</span>
            <strong>{employees.filter((employee) => employee.active !== false).length}</strong>
            <small>Disponibles para turnos.</small>
          </article>
          <article className="admin-metric-card">
            <span>Pendientes</span>
            <strong>{accessRequests.length}</strong>
            <small>Solicitudes de acceso.</small>
          </article>
          <article className="admin-metric-card">
            <span>Servicios</span>
            <strong>{activeServices.length}</strong>
            <small>Servicios asignables.</small>
          </article>
        </div>

        <div className="admin-hero employee-legacy-heading">
          <div>
            <span className="admin-kicker">ABM</span>
            <h1>Empleados</h1>
          </div>
        </div>

        {accessRequests.length > 0 && (
          <div className="admin-pending-panel">
            <div className="agenda-modal-header">Pendiente de acción</div>
            <div className="admin-pending-list">
              {accessRequests.map((request) => (
                <article className="admin-record-card admin-record-card-plain access-request-card" key={request.id}>
                  <div className="admin-record-avatar" aria-hidden="true">
                    {request.photo_url ? <img src={request.photo_url} alt="" /> : (request.display_name || request.username || 'U').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="admin-record-main">
                    <div className="admin-record-title">{request.display_name}</div>
                    <div className="admin-record-meta">
                      @{request.username || 'sin-usuario'} · {internalRoleLabels[request.role] || request.role} · {requestStatusLabels[request.status] || request.status} · {formatRequestDate(request.created_at)}
                    </div>
                    <div className="admin-record-services">
                      {request.role === 'employee'
                        ? 'Se creará como empleado al aprobar.'
                        : 'Acceso administrativo interno'}
                    </div>
                    <div className="admin-record-profile-line">
                      {request.birth_date ? `${calculateAge(request.birth_date)} años` : 'Sin nacimiento'} · {request.phone || 'Sin celular'} · {[request.address_street, request.address_number, request.address_locality].filter(Boolean).join(' ') || 'Sin dirección'}
                    </div>
                  </div>

                  <div className="admin-record-actions">
                    <button className="agenda-close-button access-request-action" type="button" disabled={isSaving} onClick={() => approveAccessRequest(request)} aria-label="Aprobar solicitud" title="Aprobar solicitud">
                      <span className="admin-action-label-full">Aprobar</span>
                      <span className="admin-action-label-compact" aria-hidden="true">✓</span>
                    </button>
                    <button className="agenda-danger-button access-request-action" type="button" disabled={isSaving} onClick={() => rejectAccessRequest(request)} aria-label="Rechazar solicitud" title="Rechazar solicitud">
                      <span className="admin-action-label-full">Rechazar</span>
                      <span className="admin-action-label-compact" aria-hidden="true">X</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        <div className="admin-layout">
          <FormCard
            title={editingEmployeeId ? 'Editar empleado' : 'Nuevo empleado'}
            className="employee-form-card"
            headerClassName="admin-collapsible-form-header"
            bodyClassName="admin-collapsible-form-body"
            isOpen={isEmployeeFormOpen}
            onToggle={() => setIsEmployeeFormOpen((current) => !current)}
            toggleLabel={isEmployeeFormOpen ? 'Ocultar formulario de empleado' : 'Mostrar formulario de empleado'}
            onSubmit={saveEmployee}
          >
              <label className="admin-photo-field">
                Foto de perfil
                <span className="admin-photo-control">
                  <span className="admin-photo-preview" aria-hidden="true">
                    {employeeForm.photo_url ? <img src={employeeForm.photo_url} alt="" /> : 'Foto'}
                  </span>
                  <input type="file" accept="image/*" onChange={updateEmployeePhoto} />
                </span>
              </label>

              <div className="admin-two-columns">
                <label>
                  Nombre
                  <input value={employeeForm.first_name} onChange={(event) => updateEmployeeField('first_name', event.target.value)} placeholder="Julio" />
                </label>
                <label>
                  Apellido
                  <input value={employeeForm.last_name} onChange={(event) => updateEmployeeField('last_name', event.target.value)} placeholder="Pérez" />
                </label>
              </div>

              <label>
                Mail para notificaciones
                <input type="email" value={employeeForm.email} onChange={(event) => updateEmployeeField('email', event.target.value)} placeholder="empleado@correo.com" />
              </label>

              <label>
                Usuario
                <input value={employeeUsernamePreview} disabled placeholder="mlobo" />
              </label>

              <div className="admin-two-columns">
                <label>
                  Fecha de nacimiento
                  <input type="date" value={employeeForm.birth_date} max={new Date().toISOString().slice(0, 10)} onChange={(event) => updateEmployeeField('birth_date', event.target.value)} />
                </label>
                <label>
                  Edad
                  <input value={calculateAge(employeeForm.birth_date)} disabled placeholder="Auto" />
                </label>
              </div>

              <label>
                Celular
                <input value={employeeForm.phone} onChange={(event) => updateEmployeeField('phone', event.target.value)} placeholder="11 5555 5555" />
              </label>

              <div className="admin-address-grid">
                <label>
                  Calle
                  <input value={employeeForm.address_street} onChange={(event) => updateEmployeeField('address_street', event.target.value)} placeholder="Av. Siempre Viva" />
                </label>
                <label>
                  Nro.
                  <input value={employeeForm.address_number} onChange={(event) => updateEmployeeField('address_number', event.target.value)} placeholder="742" />
                </label>
                <label>
                  Localidad
                  <input value={employeeForm.address_locality} onChange={(event) => updateEmployeeField('address_locality', event.target.value)} placeholder="CABA" />
                </label>
              </div>

              <label className="admin-switch-row">
                <input type="checkbox" checked={editingEmployeeId ? employeeForm.active : true} disabled={!editingEmployeeId} onChange={(event) => updateEmployeeField('active', event.target.checked)} />
                Empleado activo
              </label>
              <label className="admin-switch-row">
                <input type="checkbox" checked={employeeForm.is_admin} onChange={(event) => updateEmployeeField('is_admin', event.target.checked)} />
                Administrador
              </label>

              <div className="admin-fieldset">
                <div className="admin-fieldset-title">Servicios que atiende</div>
                <div className="admin-chip-grid">
                  {activeServices.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      className={`admin-service-chip ${employeeForm.serviceIds.includes(String(service.id)) ? 'is-selected' : ''}`}
                      style={{ '--service-chip-color': service.color || '#3fc9d5' }}
                      onClick={() => toggleEmployeeService(service.id)}
                    >
                      <ActivityIcon service={service} size="small" />
                      {service.name}
                    </button>
                  ))}
                  {promotionServices.map((promotionService) => (
                    <button
                      key={promotionService.id}
                      type="button"
                      className={`admin-service-chip admin-promotion-service-chip ${employeeForm.promotionIds.includes(promotionService.id) ? 'is-selected' : ''}`}
                      style={{ '--service-chip-color': promotionService.color }}
                      title="Promoción asignable desde la agenda"
                      onClick={() => toggleEmployeePromotion(promotionService.id)}
                    >
                      <ActivityIcon service={promotionService} size="small" />
                      {promotionService.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="admin-actions">
                <button className="agenda-close-button" type="submit" disabled={isSaving} aria-label={editingEmployeeId ? 'Guardar empleado' : 'Crear empleado'} title={editingEmployeeId ? 'Guardar empleado' : 'Crear empleado'}>
                  {editingEmployeeId ? 'Guardar' : 'Crear'}
                </button>
                {editingEmployeeId && (
                  <button className="agenda-option-button" type="button" onClick={resetEmployeeForm} aria-label="Cancelar edición" title="Cancelar edición">
                    Limpiar
                  </button>
                )}
              </div>
          </FormCard>

          <div className="admin-list employee-record-list employee-button-list">
            {employees.map((employee) => (
              <article className={`admin-record-card admin-record-card-plain employee-record-card ${employee.active === false ? 'is-muted' : ''}`} key={employee.id}>
                <div className="admin-management-card-header">
                  <span className="admin-record-avatar" aria-hidden="true">
                    {employee.photo_url ? <img src={employee.photo_url} alt="" /> : (employee.name || 'E').slice(0, 1).toUpperCase()}
                  </span>
                  <strong>{employee.name}</strong>
                  {preciosHabilitados && (
                    <button className="employee-header-settlement-button" type="button" onClick={() => openSettlement(employee)} aria-label={`Rendición de ${employee.name}`} title="Rendición">
                      Rendición
                    </button>
                  )}
                </div>
                <div className="admin-record-main admin-management-card-main">
                  <div className="admin-management-card-fields">
                    <div className="admin-management-card-field">
                      <span>Estado</span>
                      <strong className={employee.active === false ? 'is-muted' : 'is-active'}>{employee.active === false ? 'Inactivo' : 'Activo'}</strong>
                    </div>
                    <div className="admin-management-card-field">
                      <span>Perfil</span>
                      <strong>{employee.is_admin ? 'Administrador' : 'Empleado'}</strong>
                    </div>
                    <div className="admin-management-card-field admin-management-card-field-wide">
                      <span>Celular</span>
                      <strong>{employee.phone || 'Sin celular'}</strong>
                    </div>
                    <div className="admin-management-card-field admin-management-card-field-wide">
                      <span>Correo</span>
                      <strong>{employee.email || 'Sin mail'}</strong>
                    </div>
                    <div className="admin-management-card-field admin-management-card-field-wide">
                      <span>Servicios</span>
                      <strong>{getEmployeeActivityNames(employee.id, employeeServices, services, promotions) || 'Sin servicios asignados'}</strong>
                    </div>
                  </div>
                </div>
                <div className="admin-record-actions admin-management-card-actions">
                  <button className="agenda-close-button employee-list-action" type="button" onClick={() => editEmployee(employee)} aria-label="Editar empleado" title="Editar empleado">
                    <span className="employee-list-action-full">Editar</span>
                    <span className="employee-list-action-icon" aria-hidden="true">✏️</span>
                  </button>
                  <button className="agenda-option-button employee-list-action" type="button" onClick={() => resetEmployeePassword(employee)} aria-label="Resetear contraseña" title="Resetear contraseña">
                    <span className="employee-list-action-full">Reset clave</span>
                    <span className="employee-list-action-icon" aria-hidden="true">🔑</span>
                  </button>
                  <button className="agenda-danger-button employee-list-action" type="button" onClick={() => deleteEmployee(employee)} aria-label="Eliminar empleado" title="Eliminar empleado">
                    <span className="employee-list-action-full">Eliminar</span>
                    <span className="employee-list-action-icon" aria-hidden="true">🗑️</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        {preciosHabilitados && settlementEmployee && (
          <div className="modal" role="dialog" aria-modal="true" aria-label="Rendición de empleado">
            <div className="agenda-modal-card settlement-modal">
              <div className="agenda-modal-header">Rendición · {settlementEmployee.name}</div>
              <div className="agenda-modal-body settlement-body">
                {isSettlementLoading ? (
                  <div className="agenda-empty-state">Cargando turnos pendientes...</div>
                ) : settlementRows.length === 0 ? (
                  <div className="agenda-empty-state">No hay turnos cerrados pendientes de rendición.</div>
                ) : (
                  <>
                    <div className="settlement-toolbar">
                      <label className="settlement-check-all">
                        <input type="checkbox" checked={settlementRows.length > 0 && selectedSettlementIds.length === settlementRows.length} onChange={toggleAllSettlementRows} />
                        Total
                      </label>
                      <label className="settlement-percent-field">
                        % empleado
                        <input type="number" min="0" max="100" step="0.01" value={settlementPercent} onChange={(event) => setSettlementPercent(event.target.value)} />
                      </label>
                    </div>

                    <div className="settlement-list">
                      {settlementRows.map((row) => {
                        const total = Number(row.total_amount || 0);
                        const employeeAmount = total * (Number(settlementPercent) || 0) / 100;
                        const companyAmount = total - employeeAmount;

                        return (
                          <label className="settlement-row" key={row.id}>
                            <input type="checkbox" checked={selectedSettlementIds.includes(String(row.id))} onChange={() => toggleSettlementRow(row.id)} />
                            <span className="settlement-row-main">
                              <strong>{row.service_name || 'Servicio'}</strong>
                              <small>{row.customer_name || 'Cliente sin nombre'} · {formatSettlementDate(row.start_at)} · {formatSettlementTime(row.start_at)}-{formatSettlementTime(row.end_at)}</small>
                            </span>
                            <span className="settlement-row-amounts">
                              <strong>{formatMoney(total)}</strong>
                              <small>Empleado {formatMoney(employeeAmount)} · Empresa {formatMoney(companyAmount)}</small>
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    <div className="settlement-summary">
                      <div><span>Total</span><strong>{formatMoney(settlementTotals.total)}</strong></div>
                      <div><span>Empleado</span><strong>{formatMoney(settlementTotals.employee)}</strong></div>
                      <div><span>Empresa</span><strong>{formatMoney(settlementTotals.company)}</strong></div>
                    </div>
                  </>
                )}

                <div className="agenda-modal-actions booking-detail-actions">
                  <button className="agenda-option-button" type="button" onClick={closeSettlement} disabled={isSettling}>Cerrar</button>
                  <button className="agenda-close-button" type="button" onClick={confirmSettlement} disabled={isSettlementLoading || isSettling || !selectedSettlementRows.length}>
                    {isSettling ? 'Confirmando...' : 'Confirmar rendición'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="admin-shell service-admin-manager">
      <div className="admin-page-heading">
        <div>
          <h1>Administración de servicios</h1>
          <p>Configurá servicios, colores y disponibilidad operativa.</p>
        </div>
        {adminProfileSummary}
      </div>

      <div className="admin-external-actions">
        <button className="admin-link-button" type="button" onClick={loadAdminData}>
          Actualizar
        </button>
      </div>

      <div className="admin-metric-grid service-metric-grid" aria-label="Resumen de servicios">
        <article className="admin-metric-card">
          <span>Servicios</span>
          <strong>{services.length}</strong>
          <small>Total configuradas.</small>
        </article>
        <article className="admin-metric-card">
          <span>Activas</span>
          <strong>{services.filter((service) => service.active !== false).length}</strong>
          <small>Disponibles para turnos.</small>
        </article>
        <article className="admin-metric-card">
          <span>Pausadas</span>
          <strong>{services.filter((service) => service.active === false).length}</strong>
          <small>Ocultas temporalmente.</small>
        </article>
        <article className="admin-metric-card">
          <span>Asignaciones</span>
          <strong>{employeeServices.length}</strong>
          <small>Empleado por servicio.</small>
        </article>
        {preciosHabilitados && (
          <article className="admin-metric-card admin-metric-card-monthly-closures admin-booking-cost-summary-card">
            <span>{getCurrentMonthName()}</span>
            <strong>{formatMoney(bookingCostSummary.assigned.total + bookingCostSummary.closed.total + bookingCostSummary.pending.total)}</strong>
            <small>Asignados: {bookingCostSummary.assigned.bookingCount} / {formatMoney(bookingCostSummary.assigned.total)}</small>
            <small>Cerrados: {bookingCostSummary.closed.bookingCount} / {formatMoney(bookingCostSummary.closed.total)}</small>
            <small>Pendientes: {bookingCostSummary.pending.bookingCount} / {formatMoney(bookingCostSummary.pending.total)}</small>
          </article>
        )}
      </div>

      <div className="admin-hero service-legacy-heading">
        <div>
          <span className="admin-kicker">ABM</span>
          <h1>Servicios</h1>
        </div>
      </div>

      <div className="admin-layout">
        <FormCard
          title={editingServiceId ? 'Editar servicio' : 'Nuevo servicio'}
          className="service-form-card"
          headerClassName="admin-collapsible-form-header"
          bodyClassName="admin-collapsible-form-body"
          isOpen={isServiceFormOpen}
          onToggle={() => setIsServiceFormOpen((current) => !current)}
          toggleLabel={isServiceFormOpen ? 'Ocultar formulario de servicio' : 'Mostrar formulario de servicio'}
          onSubmit={saveService}
        >
            <label>
              Nombre
              <input value={serviceForm.name} onChange={(event) => updateServiceField('name', event.target.value)} placeholder="Peluquería" />
            </label>
            <div className="admin-fieldset">
              <div className="admin-fieldset-title">Icono</div>
              <div className="admin-emoji-picker-anchor" ref={emojiPickerRef}>
                <div className="admin-emoji-selected-row">
                  <input
                    className="admin-emoji-input"
                    value={serviceForm.icon}
                    onChange={(event) => updateServiceField('icon', event.target.value)}
                    placeholder="Pegá un emoji o símbolo"
                    maxLength="12"
                  />
                  <button className="agenda-option-button admin-emoji-open-button" type="button" onClick={() => setIsEmojiPickerOpen((current) => !current)}>
                    Elegir
                  </button>
                </div>

                {isEmojiPickerOpen && (
                  <div className="admin-emoji-popover">
                    <input
                      className="admin-emoji-search"
                      value={emojiSearch}
                      onChange={(event) => setEmojiSearch(event.target.value)}
                      placeholder="Buscar categoría"
                    />
                    <div className="admin-emoji-popover-scroll">
                      {filteredIconGroups.length === 0 ? (
                        <div className="admin-emoji-empty">Sin resultados</div>
                      ) : filteredIconGroups.map((group) => (
                        <div className="admin-emoji-group" key={group.label}>
                          <div className="admin-emoji-group-title">{group.label}</div>
                          <div className="admin-emoji-grid">
                            {group.icons.map((icon) => (
                              <button
                                key={`${group.label}-${icon}`}
                                type="button"
                                className={`admin-emoji-button ${serviceForm.icon === icon ? 'is-selected' : ''}`}
                                onClick={() => selectServiceIcon(icon)}
                              >
                                {icon === 'whatsapp' || icon === 'telegram' ? <ActivityIcon service={{ icon, color: serviceForm.color }} size="small" /> : icon}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <label>
              Color
              <input type="color" value={serviceForm.color} onChange={(event) => updateServiceField('color', event.target.value)} />
            </label>

            {preciosHabilitados && (
              <label>
                Precio base
                <input type="text" inputMode="decimal" value={serviceForm.base_price} onChange={(event) => updateServiceField('base_price', event.target.value)} placeholder="20000" />
              </label>
            )}

            {preciosHabilitados && activityDiscountChecks.length > 0 && (
              <label>
                Check servicio
                <select value={serviceForm.activity_discount_check_id} onChange={(event) => updateServiceField('activity_discount_check_id', event.target.value)}>
                  <option value="">Sin check</option>
                  {activityDiscountChecks.map((discount) => (
                    <option value={discount.id} key={discount.id}>{getActivityDiscountLabel(discount)}</option>
                  ))}
                </select>
              </label>
            )}

            <label className="admin-switch-row">
              <input type="checkbox" checked={serviceForm.active} onChange={(event) => updateServiceField('active', event.target.checked)} />
              Servicio activo
            </label>

            <div className="admin-actions">
              <button className="agenda-close-button" type="submit" disabled={isSaving} aria-label={editingServiceId ? 'Guardar servicio' : 'Crear servicio'} title={editingServiceId ? 'Guardar servicio' : 'Crear servicio'}>
                {editingServiceId ? 'Guardar' : 'Crear'}
              </button>
              {editingServiceId && (
                <button className="agenda-option-button" type="button" onClick={resetServiceForm} aria-label="Cancelar edición" title="Cancelar edición">
                  Limpiar
                </button>
              )}
            </div>
        </FormCard>

        <div className="admin-list service-record-list service-button-grid">
          {services.map((service) => {
            const activityCheckId = getServiceActivityCheckId(service);
            const activityCheck = activityDiscountChecks.find((discount) => String(discount.id) === String(activityCheckId));

            return (
              <article className={`admin-record-card service-record-card ${service.active === false ? 'is-muted' : ''}`} key={service.id}>
                <div className="admin-management-card-header" style={{ '--admin-management-card-color': service.color || '#174c55' }}>
                  <ActivityIcon service={service} size="small" />
                  <strong>{service.name}</strong>
                </div>
                <div className="admin-record-main admin-management-card-main">
                  <div className="admin-management-card-fields">
                    {preciosHabilitados && (
                      <div className="admin-management-card-field">
                        <span>Precio</span>
                        <strong>{formatMoney(service.base_price)}</strong>
                      </div>
                    )}
                    <div className="admin-management-card-field">
                      <span>Asignados</span>
                      <strong>{employeeServices.filter((relation) => Number(relation.service_id) === Number(service.id)).length}</strong>
                    </div>
                    {activityCheckId && (
                      <div className="admin-management-card-field admin-management-card-field-wide">
                        <span>Check servicio</span>
                        <strong>{activityCheck?.name || 'Configurado'}</strong>
                      </div>
                    )}
                    <div className="admin-management-card-field admin-management-card-field-wide admin-management-card-status-row">
                      <span>Estado</span>
                      <strong className={service.active === false ? 'is-muted' : 'is-active'}>{service.active === false ? 'Pausada' : 'Activa'}</strong>
                    </div>
                  </div>
                </div>
                <div className="admin-record-actions admin-management-card-actions">
                  <button className="agenda-close-button service-card-action" type="button" onClick={() => editService(service)} aria-label="Editar servicio" title="Editar servicio">
                    Editar
                  </button>
                  <button className="agenda-option-button service-card-action" type="button" onClick={() => toggleServiceStatus(service)} aria-label={service.active === false ? 'Activar servicio' : 'Desactivar servicio'} title={service.active === false ? 'Activar servicio' : 'Desactivar servicio'}>
                    {service.active === false ? 'Activar' : 'Pausar'}
                  </button>
                  <button className="agenda-danger-button service-card-action" type="button" onClick={() => deleteService(service)} aria-label="Eliminar servicio" title="Eliminar servicio">
                    Eliminar
                  </button>
                </div>
              </article>
            );
          })}
          {promotionServices.map((promotionService) => (
            <article className="admin-record-card service-record-card promotion-record-card" key={promotionService.id}>
              <div className="admin-management-card-header" style={{ '--admin-management-card-color': promotionService.color || '#174c55' }}>
                <ActivityIcon service={promotionService} size="small" />
                <strong>{promotionService.name}</strong>
              </div>
              <div className="admin-record-main admin-management-card-main">
                <div className="admin-management-card-fields">
                  <div className="admin-management-card-field">
                    <span>Tipo</span>
                    <strong>{preciosHabilitados ? 'Promo' : 'Banner reservable'}</strong>
                  </div>
                  <div className="admin-management-card-field admin-management-card-field-wide">
                    <span>{preciosHabilitados ? 'Precio' : 'Atención'}</span>
                    <strong>{preciosHabilitados ? formatMoney(promotionService.promotion?.price) : 'Asignable a empleados'}</strong>
                  </div>
                  <div className="admin-management-card-field admin-management-card-field-wide">
                    <span>Administración</span>
                    <strong>Desde Configuración</strong>
                  </div>
                  <div className="admin-management-card-field admin-management-card-field-wide admin-management-card-status-row">
                    <span>Estado</span>
                    <strong className="is-active">Activa</strong>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
