import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import BookingItem from './BookingItem';
import CancelBookingModal from './CancelBookingModal';
import CustomerModal from './CustomerModal';
import EmployeeModal from './EmployeeModal';
import ServiceModal from './ServiceModal';
import ActivityIcon from './ActivityIcon';
import { generateDetalleFacturaPdf } from './DetalleFactura';
import { formatDisplayDate } from '../utils/dateFormat';

const SLOT_MINUTES = 30;
const START_HOUR = 8;
const SLOTS = 30;
const AGENDA_TOTAL_MINUTES = SLOT_MINUTES * SLOTS;
const ALLOWED_SLOT_MINUTES = new Set([15, 30, 45, 60]);
const EMPTY_SLOT_HEIGHT = 60;
const BOOKED_SLOT_PADDING_HEIGHT = 10;
const BOOKING_STACK_HEIGHT = 48;
const ACTIVE_BOOKING_STATUSES = new Set(['confirmed', 'reserved', 'pending_assignment']);
const TOUCH_TAP_MOVE_TOLERANCE = 8;

/* =========================
   TIME (FIX DEFINITIVO)
========================= */

// 👉 genera hora LOCAL real (sin drift)
const getValidSlotMinutes = (value) => {
  const minutes = Number(value) || SLOT_MINUTES;
  return ALLOWED_SLOT_MINUTES.has(minutes) ? minutes : SLOT_MINUTES;
};

const buildSlotDate = (day, slotIndex, slotMinutes = SLOT_MINUTES) => {
  const d = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    START_HOUR,
    0,
    0,
    0
  );

  d.setMinutes(d.getMinutes() + slotIndex * slotMinutes);
  return d;
};

const formatTime = (date) =>
  `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

const formatDuration = (startSlot, endSlot, slotMinutes = SLOT_MINUTES) => {
  const totalMinutes = (endSlot - startSlot + 1) * slotMinutes;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) return `${minutes} min`;
  if (!minutes) return `${hours} h`;
  return `${hours} h ${minutes} min`;
};

const rangesOverlap = (startA, endA, startB, endB) =>
  startA < endB && endA > startB;

const companyHasBookingConflict = (bookings, range) =>
  bookings.some((booking) => {
    if (!isActiveBooking(booking)) return false;

    const bookingRange = buildRangeFromBooking(booking);
    return rangesOverlap(bookingRange.startLocal, bookingRange.endLocal, range.startLocal, range.endLocal);
  });

const isActiveBooking = (booking) =>
  ACTIVE_BOOKING_STATUSES.has(String(booking.status || '').trim().toLowerCase());

const isClosedBooking = (booking) =>
  ['completed', 'closed'].includes(String(booking?.status || '').trim().toLowerCase());

const isVisibleGridBooking = (booking) =>
  isActiveBooking(booking) || isClosedBooking(booking) || isWaitlistBooking(booking);

const isPendingAssignmentBooking = (booking) =>
  isActiveBooking(booking) && (!booking.employee_id || booking.status === 'pending_assignment');

const isWaitlistBooking = (booking) =>
  String(booking?.status || '').trim().toLowerCase() === 'waitlist';

const getBookingStatusLabel = (booking) => {
  if (isClosedBooking(booking)) return 'Cerrado';
  if (isWaitlistBooking(booking)) return 'En espera';
  if (isPendingAssignmentBooking(booking)) return 'Pendiente';
  if (isActiveBooking(booking)) return 'Asignado';
  if (String(booking?.status || '').trim().toLowerCase() === 'cancelled') return 'Cancelado';
  return 'Pendiente';
};

const capitalizeNamePart = (value) => {
  const cleanValue = String(value || '').trim();
  if (!cleanValue) return '';
  return `${cleanValue[0].toUpperCase()}${cleanValue.slice(1)}`;
};

const normalizeComparableText = (value) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const getPromotionBookingLabel = (promotion, index) =>
  promotion?.bookingLabel || [promotion?.title || `Banner ${index + 1}`, promotion?.description, promotion?.value].filter(Boolean).join(' · ');

const findPromotionByBookingDescription = (sourcePromotions, bookingDescription) => {
  const normalizedDescription = normalizeComparableText(bookingDescription);
  if (!normalizedDescription) return null;

  return (sourcePromotions || [])
    .map((promotion, index) => ({ promotion, index }))
    .find(({ promotion, index }) => normalizeComparableText(getPromotionBookingLabel(promotion, index)) === normalizedDescription)?.promotion || null;
};

const formatAssignmentError = (error) => {
  const message = String(error?.message || error || '');

  if (message.includes('bookings_user_no_active_overlap_excl') || message.includes('bookings_customer_email_no_active_overlap_excl')) {
    return 'El cliente ya tiene un turno asignado en ese horario.';
  }

  if (message.includes('bookings_employee_no_active_overlap_excl')) {
    return 'El empleado ya tiene un turno asignado en ese horario.';
  }

  return message || 'No se pudo asignar el empleado.';
};

const formatPersonShortName = (person) => {
  if (!person) return 'Pendiente';

  const firstName = String(person.first_name || '').trim();
  const lastName = String(person.last_name || '').trim();

  if (firstName && lastName) return `${capitalizeNamePart(firstName)} ${lastName[0].toUpperCase()}`;
  if (firstName) return capitalizeNamePart(firstName);

  const nameParts = String(person.name || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (nameParts.length >= 2) return `${capitalizeNamePart(nameParts[0])} ${nameParts[1][0].toUpperCase()}`;
  return capitalizeNamePart(nameParts[0]) || 'Pendiente';
};

const splitCustomerName = (value) => {
  const parts = String(value || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) };
};

const getBookingActivityLabel = (booking, service) => {
  if (!booking.service && booking.booking_description) {
    return String(booking.booking_description).split('·')[0].trim() || 'Promo';
  }

  return service?.name || 'Turno';
};

const parseBookingDate = (value) => {
  if (value instanceof Date) return value;
  return new Date(value);
};

const formatDateForDb = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const formatDateOnlyForDb = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const formatDateInputForDisplay = (value) => {
  const [year, month, day] = String(value || '').split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
};

const parseDisplayDateInput = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';

  const [, dayValue, monthValue, yearValue] = match;
  const day = Number(dayValue);
  const month = Number(monthValue);
  const year = Number(yearValue);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';

  return `${yearValue}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const formatMoney = (value) => new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0
}).format(Number(value) || 0);

const parseMoney = (value) => {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  return Number(normalized) || 0;
};

const getDiscountValue = (discount) => Number(discount?.value ?? discount?.percent) || 0;

const getDiscountKey = (discount) => `${discount?.discountType || 'general'}-${discount?.name}-${discount?.valueType || 'percent'}-${getDiscountValue(discount)}`;

const formatDiscountOption = (discount) => `${discount.name} ${discount.valueType === 'amount' ? formatMoney(getDiscountValue(discount)) : `${getDiscountValue(discount)}%`}`;

const isCashPaymentDiscount = (discount) => normalizeComparableText(discount?.name).includes('efectivo');

const getDiscountAmount = (discount, baseAmount) => {
  const cleanBaseAmount = Math.max(0, Number(baseAmount) || 0);
  const discountValue = getDiscountValue(discount);
  if (discount?.valueType === 'amount') return Math.min(cleanBaseAmount, Math.max(0, discountValue));
  return Math.round(cleanBaseAmount * Math.min(100, Math.max(0, discountValue))) / 100;
};

const getSurchargeValue = (surcharge) => Number(surcharge?.value ?? surcharge?.percent) || 0;

const getSurchargeKey = (surcharge) => `${surcharge?.paymentMethod || 'card'}-${surcharge?.name}-${getSurchargeValue(surcharge)}`;

const formatPaymentMethod = (method) => ({ cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta' }[method] || 'Tarjeta');

const formatSurchargeOption = (surcharge) => `${surcharge.name || formatPaymentMethod(surcharge.paymentMethod)} +${getSurchargeValue(surcharge)}%`;

const formatSurchargeInvoiceLabel = (surcharge) => `Recargo ${surcharge.name || formatPaymentMethod(surcharge.paymentMethod)} (+${getSurchargeValue(surcharge)}%)`;

const getSurchargeAmount = (surcharge, baseAmount) => {
  const cleanBaseAmount = Math.max(0, Number(baseAmount) || 0);
  return Math.round(cleanBaseAmount * Math.min(100, Math.max(0, getSurchargeValue(surcharge))) / 100 * 100) / 100;
};

const roundMoneyAmount = (amount) => Math.round((Number(amount) || 0) * 100) / 100;

const formatClosureInvoiceNumber = (closure) => `FAC-${String(closure?.id || '').replace(/-/g, '').slice(0, 8).toUpperCase() || String(Date.now()).slice(-8)}`;

const getClientKey = (booking) => {
  const clientAccountId = String(booking.client_account_id || '').trim();
  if (clientAccountId) return `account:${clientAccountId}`;
  const email = String(booking.user_email || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  return `name:${String(booking.customer_name || 'Cliente sin datos').trim().toLowerCase()}`;
};

const getClientName = (booking) => booking.customer_name || booking.user_email || 'Cliente sin datos';

const getClientEmail = (booking) => booking.user_email || '';

const buildReservationRange = (day, startSlot, endSlot, slotMinutes = SLOT_MINUTES) => {
  const startLocal = buildSlotDate(day, startSlot, slotMinutes);
  const endLocal = buildSlotDate(day, endSlot + 1, slotMinutes);

  return {
    startLocal,
    endLocal,
    start_at: formatDateForDb(startLocal),
    end_at: formatDateForDb(endLocal)
  };
};

const buildRangeFromBooking = (booking) => {
  const startLocal = parseBookingDate(booking.start_at);
  const endLocal = parseBookingDate(booking.end_at);

  return {
    startLocal,
    endLocal,
    start_at: formatDateForDb(startLocal),
    end_at: formatDateForDb(endLocal)
  };
};

const buildLocalMockAgendaData = (employeeId) => {
  const today = new Date();
  const localEmployeeId = employeeId || '00000000-0000-4000-8000-000000000101';
  const otherEmployeeId = '00000000-0000-4000-8000-000000000102';
  const buildDate = (hour, minute = 0) => formatDateForDb(new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute, 0, 0));

  return {
    bookings: [
      {
        id: '00000000-0000-4000-8000-000000000201',
        company_id: '00000000-0000-4000-8000-000000000301',
        user_id: null,
        user_email: 'pendiente@example.com',
        customer_name: 'Cliente X',
        service: 1,
        employee_id: otherEmployeeId,
        booking_description: null,
        start_at: buildDate(11, 30),
        end_at: buildDate(12, 0),
        status: 'confirmed'
      },
      {
        id: '00000000-0000-4000-8000-000000000202',
        company_id: '00000000-0000-4000-8000-000000000301',
        user_id: null,
        user_email: '',
        customer_name: 'Nombre provisorio',
        service: 2,
        employee_id: localEmployeeId,
        booking_description: null,
        start_at: buildDate(13, 0),
        end_at: buildDate(13, 30),
        status: 'reserved'
      }
    ],
    services: [
      { id: 1, name: 'Gastroenterologia', icon: '🩺', color: '#3fc9d5', active: true },
      { id: 2, name: 'Control general', icon: '✨', color: '#20a6b2', active: true }
    ],
    employees: [
      { id: localEmployeeId, name: 'Empleado Local', first_name: 'Empleado', last_name: 'Local', active: true },
      { id: otherEmployeeId, name: 'Cintia E', first_name: 'Cintia', last_name: 'Ejemplo', active: true }
    ],
    employeeServices: [
      { employee_id: localEmployeeId, service_id: 1 },
      { employee_id: localEmployeeId, service_id: 2 },
      { employee_id: otherEmployeeId, service_id: 1 }
    ],
    employeeAvailability: [
      { employee_id: localEmployeeId, weekday: today.getDay(), available_date: formatDateOnlyForDb(today), start_time: '08:00', end_time: '20:00', active: true },
      { employee_id: otherEmployeeId, weekday: today.getDay(), available_date: formatDateOnlyForDb(today), start_time: '08:00', end_time: '20:00', active: true }
    ]
  };
};

const employeeHasBookingConflict = (bookings, employeeId, range) => {
  if (!range) return false;

  const newStart = range.startLocal.getTime();
  const newEnd = range.endLocal.getTime();

  return bookings.some((booking) => {
    if (String(booking.employee_id) !== String(employeeId)) return false;
    if (!isActiveBooking(booking)) return false;

    return rangesOverlap(
      parseBookingDate(booking.start_at).getTime(),
      parseBookingDate(booking.end_at).getTime(),
      newStart,
      newEnd
    );
  });
};

const normalizeBookingEmail = (value) => String(value || '').trim().toLowerCase();

const clientHasBookingConflict = (bookings, client, range, ignoredBookingId = null) => {
  if (!range) return false;

  const clientUserId = client?.userId ? String(client.userId) : '';
  const clientAccountId = client?.accountId ? String(client.accountId) : '';
  const clientEmail = normalizeBookingEmail(client?.email);
  const newStart = range.startLocal.getTime();
  const newEnd = range.endLocal.getTime();

  if (!clientUserId && !clientAccountId && !clientEmail) return false;

  return bookings.some((booking) => {
    if (ignoredBookingId && String(booking.id) === String(ignoredBookingId)) return false;
    if (!isActiveBooking(booking)) return false;

    const matchesUser = clientUserId && String(booking.user_id || '') === clientUserId;
    const matchesAccount = clientAccountId && String(booking.client_account_id || '') === clientAccountId;
    const matchesEmail = clientEmail && normalizeBookingEmail(booking.user_email) === clientEmail;

    if (!matchesUser && !matchesAccount && !matchesEmail) return false;

    return rangesOverlap(
      parseBookingDate(booking.start_at).getTime(),
      parseBookingDate(booking.end_at).getTime(),
      newStart,
      newEnd
    );
  });
};

const timeToMinutes = (value) => {
  const [hours = 0, minutes = 0] = String(value || '').slice(0, 5).split(':').map(Number);
  return (hours * 60) + minutes;
};

const employeeHasAvailability = (availability, employeeId, range, skipAvailabilityCheck = false, branchId = null) => {
  if (skipAvailabilityCheck) return true;
  if (!range) return false;

  const rangeStart = range.startLocal;
  const rangeEnd = range.endLocal;
  const weekday = rangeStart.getDay();
  const rangeDate = formatDateOnlyForDb(rangeStart);
  const startMinutes = (rangeStart.getHours() * 60) + rangeStart.getMinutes();
  const isSameDay = rangeStart.getFullYear() === rangeEnd.getFullYear() &&
    rangeStart.getMonth() === rangeEnd.getMonth() &&
    rangeStart.getDate() === rangeEnd.getDate();
  const endMinutes = isSameDay ? (rangeEnd.getHours() * 60) + rangeEnd.getMinutes() : 24 * 60;

  return availability.some((item) => {
    if (item.active === false) return false;
    if (String(item.employee_id) !== String(employeeId)) return false;
    if (branchId && item.branch_id && String(item.branch_id) !== String(branchId)) return false;
    if (item.available_date) {
      if (String(item.available_date) !== rangeDate) return false;
    } else if (Number(item.weekday) !== weekday) {
      return false;
    }

    return timeToMinutes(item.start_time) <= startMinutes && timeToMinutes(item.end_time) >= endMinutes;
  });
};

/* =========================
   WEEK
========================= */

const getVisibleDayCount = () => {
  if (typeof window === 'undefined') return 7;
  if (window.innerWidth <= 640) return 2;
  if (window.innerWidth <= 900) return 3;
  return 7;
};

const getWeekDays = (offset, visibleDayCount) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offset);

  return [...Array(visibleDayCount)].map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
};

const isPastDay = (day) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(day);
  target.setHours(0, 0, 0, 0);

  return target < today;
};

const isFutureDay = (day) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(day);
  target.setHours(0, 0, 0, 0);

  return target > today;
};

const isPastBookingStart = (booking) =>
  parseBookingDate(booking?.start_at).getTime() <= Date.now();

/* =========================
   COMPONENT
========================= */

function CloseAttentionModal({ bookings, services, employees, promotions, discounts, surcharges, accessProfile, employeeId, user, initialServiceDate, companyContext, onClose, onClosed }) {
  const todayInput = formatDateOnlyForDb(new Date());
  const initialDate = initialServiceDate && initialServiceDate <= todayInput ? initialServiceDate : todayInput;
  const [serviceDate] = useState(initialDate);
  const [closureCutoffDate] = useState(todayInput);
  const [selectedClientKey, setSelectedClientKey] = useState('');
  const [selectedBookingIds, setSelectedBookingIds] = useState(null);
  const [lineDiscounts, setLineDiscounts] = useState({});
  const [totalDiscountIds, setTotalDiscountIds] = useState([]);
  const [payments, setPayments] = useState({ cash: '', transfer: '', card: '' });
  const [isClosing, setIsClosing] = useState(false);
  const [confirmedInvoiceDetails, setConfirmedInvoiceDetails] = useState(null);
  const isEmployeeView = accessProfile === 'employee';
  const isClosureConfirmed = Boolean(confirmedInvoiceDetails);
  const activeDiscounts = useMemo(() => (discounts || []).filter((discount) => discount?.enabled !== false && discount?.name && getDiscountValue(discount) > 0), [discounts]);
  const activeSurcharges = useMemo(() => (surcharges || []).filter((surcharge) => surcharge?.enabled !== false && surcharge?.name && getSurchargeValue(surcharge) > 0), [surcharges]);
  const lineDiscountOptions = activeDiscounts.filter((discount) => discount.discountType !== 'activity' && !isCashPaymentDiscount(discount) && (discount.scope === 'line' || discount.scope === 'both'));
  const activityDiscountOptions = activeDiscounts.filter((discount) => discount.discountType === 'activity');
  const totalDiscountOptions = activeDiscounts.filter((discount) => discount.discountType !== 'activity' && (discount.scope === 'total' || discount.scope === 'both'));
  const pendingClosureBookings = useMemo(() => bookings
    .filter((booking) => isActiveBooking(booking) && booking.employee_id)
    .filter((booking) => formatDateOnlyForDb(parseBookingDate(booking.start_at)) <= closureCutoffDate)
    .sort((left, right) => parseBookingDate(left.start_at) - parseBookingDate(right.start_at)), [bookings, closureCutoffDate]);
  const clients = useMemo(() => {
    const map = new Map();
    pendingClosureBookings.forEach((booking) => {
      const bookingDate = formatDateOnlyForDb(parseBookingDate(booking.start_at));
      const clientKey = getClientKey(booking);
      const key = `${bookingDate}|${clientKey}`;
      const current = map.get(key) || { key, clientKey, serviceDate: bookingDate, name: getClientName(booking), email: getClientEmail(booking), canEmployeeClose: false };
      if (String(booking.employee_id) === String(employeeId)) current.canEmployeeClose = true;
      map.set(key, current);
    });
    return [...map.values()].filter((client) => !isEmployeeView || client.canEmployeeClose);
  }, [employeeId, isEmployeeView, pendingClosureBookings]);

  const effectiveSelectedClientKey = clients.some((client) => client.key === selectedClientKey) ? selectedClientKey : clients[0]?.key || '';
  const selectedClient = clients.find((client) => client.key === effectiveSelectedClientKey);
  const clientBookings = useMemo(() => pendingClosureBookings.filter((booking) =>
    selectedClient &&
    formatDateOnlyForDb(parseBookingDate(booking.start_at)) === selectedClient.serviceDate &&
    getClientKey(booking) === selectedClient.clientKey
  ), [pendingClosureBookings, selectedClient]);
  const effectiveSelectedBookingIds = useMemo(() => {
    const availableIds = clientBookings.map((booking) => booking.id);
    if (!Array.isArray(selectedBookingIds)) return availableIds;
    return selectedBookingIds.filter((id) => availableIds.includes(id));
  }, [clientBookings, selectedBookingIds]);
  const bookingPriceById = useMemo(() => {
    const prices = new Map();
    clientBookings.forEach((booking) => {
      const service = services.find((item) => Number(item.id) === Number(booking.service));
      if (service?.base_price != null) {
        prices.set(booking.id, Number(service.base_price) || 0);
        return;
      }
      const promotionTitle = getBookingActivityLabel(booking, service);
      const promotion = (promotions || []).find((item) => normalizeComparableText(item?.title) === normalizeComparableText(promotionTitle));
      prices.set(booking.id, Number(promotion?.price) || parseMoney(promotion?.value || booking.booking_description));
    });
    return prices;
  }, [clientBookings, promotions, services]);

  const selectedItems = useMemo(() => clientBookings
    .filter((booking) => effectiveSelectedBookingIds.includes(booking.id))
    .map((booking) => {
      const service = services.find((item) => Number(item.id) === Number(booking.service));
      const employee = employees.find((item) => String(item.id) === String(booking.employee_id));
      const basePrice = bookingPriceById.get(booking.id) || 0;
      const activityDiscount = activityDiscountOptions.find((discount) =>
        String(discount.id) === String(service?.activity_discount_check_id) ||
        (discount.serviceIds || []).some((serviceId) => String(serviceId) === String(service?.id))
      );
      const availableLineDiscounts = activityDiscount ? [...lineDiscountOptions, activityDiscount] : lineDiscountOptions;
      const appliedDiscounts = availableLineDiscounts.filter((discount) => (lineDiscounts[booking.id] || []).includes(getDiscountKey(discount)));
      const lineDiscountTotal = Math.min(basePrice, appliedDiscounts.reduce((total, discount) => total + getDiscountAmount(discount, basePrice), 0));
      return {
        booking,
        serviceName: getBookingActivityLabel(booking, service),
        employee,
        employeeName: formatPersonShortName(employee),
        basePrice,
        lineDiscountTotal,
        subtotal: Math.max(0, basePrice - lineDiscountTotal),
        appliedDiscounts
      };
    }), [activityDiscountOptions, bookingPriceById, clientBookings, effectiveSelectedBookingIds, employees, lineDiscountOptions, lineDiscounts, services]);
  const grossTotal = selectedItems.reduce((total, item) => total + item.basePrice, 0);
  const lineDiscountTotal = selectedItems.reduce((total, item) => total + item.lineDiscountTotal, 0);
  const subtotal = selectedItems.reduce((total, item) => total + item.subtotal, 0);
  const selectedTotalDiscounts = totalDiscountOptions.filter((discount) => totalDiscountIds.includes(getDiscountKey(discount)));
  // Modelo contable del cierre (estilo caja):
  //   valor_servicios (bruto) - descuento_promocion - descuento_efectivo + recargo_tarjeta = total_final
  // Cada medio de pago recibe el IMPORTE BASE (valor de servicio) que cubre. El
  // descuento por efectivo se calcula sobre la base de efectivo y el recargo de
  // tarjeta sobre la base de tarjeta. Preparado para sumar IVA discriminado a
  // futuro (una linea impuesto_iva sobre el neto segun cliente/medio de pago).
  const paymentBaseAmounts = {
    cash: parseMoney(payments.cash),
    transfer: parseMoney(payments.transfer),
    card: parseMoney(payments.card)
  };
  const cashPaymentDiscounts = selectedTotalDiscounts.filter(isCashPaymentDiscount);
  const nonCashTotalDiscounts = selectedTotalDiscounts.filter((discount) => !isCashPaymentDiscount(discount));

  // descuento_promocion: descuentos por linea + descuentos sobre total (sin "pago en efectivo").
  const nonCashDiscountTotal = Math.min(
    subtotal,
    nonCashTotalDiscounts.reduce((total, discount) => total + getDiscountAmount(discount, subtotal), 0)
  );
  const promotionDiscountTotal = roundMoneyAmount(lineDiscountTotal + nonCashDiscountTotal);
  // valor_servicios neto de promociones: es lo que deben cubrir los importes base.
  const serviceNetTotal = Math.max(0, roundMoneyAmount(grossTotal - promotionDiscountTotal));

  // descuento_efectivo: se calcula sobre el importe base cargado en el medio efectivo.
  const cashPaymentDiscountTotal = Math.max(0, Math.min(
    paymentBaseAmounts.cash,
    cashPaymentDiscounts.reduce((total, discount) => total + getDiscountAmount(discount, paymentBaseAmounts.cash), 0)
  ));

  // recargo_tarjeta (y otros medios): sobre el importe base de cada medio.
  const selectedSurchargeDetails = activeSurcharges
    .map((surcharge) => ({
      surcharge,
      baseAmount: paymentBaseAmounts[surcharge.paymentMethod] || 0,
      amount: getSurchargeAmount(surcharge, paymentBaseAmounts[surcharge.paymentMethod] || 0)
    }))
    .filter((item) => item.amount > 0);
  const paymentSurchargeAmounts = ['cash', 'transfer', 'card'].reduce((summary, method) => ({
    ...summary,
    [method]: selectedSurchargeDetails.filter((item) => item.surcharge.paymentMethod === method).reduce((total, item) => total + item.amount, 0)
  }), { cash: 0, transfer: 0, card: 0 });
  const surchargeTotal = roundMoneyAmount(selectedSurchargeDetails.reduce((total, item) => total + item.amount, 0));

  // Lo que efectivamente se cobra por cada medio = base - descuento efectivo + recargo.
  const chargedPaymentAmounts = {
    cash: roundMoneyAmount(Math.max(0, paymentBaseAmounts.cash - cashPaymentDiscountTotal) + paymentSurchargeAmounts.cash),
    transfer: roundMoneyAmount(paymentBaseAmounts.transfer + paymentSurchargeAmounts.transfer),
    card: roundMoneyAmount(paymentBaseAmounts.card + paymentSurchargeAmounts.card)
  };

  // Detalle de descuentos sobre total para la factura (efectivo sobre base de efectivo).
  const selectedTotalDiscountDetails = selectedTotalDiscounts.map((discount) => ({
    discount,
    amount: isCashPaymentDiscount(discount)
      ? Math.min(paymentBaseAmounts.cash, getDiscountAmount(discount, paymentBaseAmounts.cash))
      : getDiscountAmount(discount, subtotal)
  }));

  const totalDiscountTotal = roundMoneyAmount(nonCashDiscountTotal + cashPaymentDiscountTotal);
  const netTotal = Math.max(0, roundMoneyAmount(serviceNetTotal - cashPaymentDiscountTotal));
  // total_final = neto de servicios - descuento efectivo + recargos.
  const finalTotal = roundMoneyAmount(Math.max(0, serviceNetTotal - cashPaymentDiscountTotal + surchargeTotal));
  const displayFinalTotal = finalTotal;
  const totalSavings = Math.max(0, roundMoneyAmount(grossTotal - netTotal));

  // Importe base total asignado a medios de pago; debe cubrir el neto de servicios.
  const totalPaymentInputAmount = roundMoneyAmount(paymentBaseAmounts.cash + paymentBaseAmounts.transfer + paymentBaseAmounts.card);
  const chargedTotal = roundMoneyAmount(chargedPaymentAmounts.cash + chargedPaymentAmounts.transfer + chargedPaymentAmounts.card);
  const displayChargedTotal = chargedTotal;
  // Saldo por asignar: valor de servicios (neto) que aun no fue cubierto por un medio de pago.
  const paymentDifference = roundMoneyAmount(totalPaymentInputAmount - serviceNetTotal);
  const closureCutoffLabel = formatDateInputForDisplay(closureCutoffDate);

  const toggleLineDiscount = (bookingId, discountKey) => {
    if (isClosureConfirmed) return;
    setLineDiscounts((current) => {
      const currentDiscounts = current[bookingId] || [];
      return { ...current, [bookingId]: currentDiscounts.includes(discountKey) ? currentDiscounts.filter((key) => key !== discountKey) : [...currentDiscounts, discountKey] };
    });
  };

  const closeModal = () => {
    onClose();
    if (isClosureConfirmed) onClosed?.();
  };

  const buildCurrentInvoiceDetails = (closure = null) => ({
    invoiceNumber: closure ? formatClosureInvoiceNumber(closure) : undefined,
    invoiceDate: closure?.created_at || closure?.closed_at || new Date(),
    clientName: selectedClient?.name,
    clientEmail: selectedClient?.email,
    items: selectedItems.map((item) => ({
      serviceName: item.serviceName,
      employeeName: item.employeeName,
      basePrice: item.basePrice,
      startAt: item.booking.start_at,
      endAt: item.booking.end_at
    })),
    discountDetails: [
      ...selectedItems.flatMap((item) => item.appliedDiscounts.map((discount) => ({
        label: `Desc. ${formatDiscountOption(discount)}`,
        amount: getDiscountAmount(discount, item.basePrice)
      }))),
      ...selectedTotalDiscountDetails.map(({ discount, amount }) => ({
        label: `Desc. ${formatDiscountOption(discount)}`,
        amount
      }))
    ].filter((item) => item.amount > 0),
    surchargeDetails: selectedSurchargeDetails.map(({ surcharge, amount }) => ({
      label: formatSurchargeInvoiceLabel(surcharge),
      amount
    })),
    totals: {
      grossTotal,
      discountTotal: lineDiscountTotal + totalDiscountTotal,
      surchargeTotal,
      finalTotal
    },
    payments: chargedPaymentAmounts
  });

  const confirmClosure = async () => {
    if (isClosureConfirmed) return;
    if (!selectedItems.length) return alert('Seleccioná al menos un turno para cerrar.');
    if (Math.abs(paymentDifference) > 0.01) return alert('La suma de los importes base por medio de pago debe cubrir el valor de los servicios.');
    setIsClosing(true);
    const rpcPayload = {
      service_date_value: selectedClient?.serviceDate || serviceDate,
      client_name_value: selectedClient?.name || null,
      client_email_value: selectedClient?.email || null,
      booking_ids_value: selectedItems.map((item) => item.booking.id),
      closure_items_value: selectedItems.map((item) => ({ bookingId: item.booking.id, serviceName: item.serviceName, employeeId: item.employee?.id || item.booking.employee_id || null, employeeName: item.employeeName, basePrice: item.basePrice, lineDiscountTotal: item.lineDiscountTotal, subtotal: item.subtotal, appliedDiscounts: item.appliedDiscounts })),
      total_discounts_value: selectedTotalDiscounts,
      surcharges_value: selectedSurchargeDetails.map(({ surcharge, baseAmount, amount }) => ({ ...surcharge, baseAmount, amount })),
      gross_total_value: grossTotal,
      line_discount_total_value: lineDiscountTotal,
      total_discount_total_value: totalDiscountTotal,
      total_surcharge_total_value: surchargeTotal,
      final_total_value: finalTotal,
      cash_amount_value: chargedPaymentAmounts.cash,
      transfer_amount_value: chargedPaymentAmounts.transfer,
      card_amount_value: chargedPaymentAmounts.card,
      account_id_value: user?.isInternal ? user.id : null,
      session_token_value: user?.isInternal ? user.sessionToken : null
    };
    
    console.log('CLOSE_BOOKING - RPC Payload:', {
      service_date: rpcPayload.service_date_value,
      client_name: rpcPayload.client_name_value,
      client_email: rpcPayload.client_email_value,
      booking_ids: rpcPayload.booking_ids_value,
      num_items: selectedItems.length,
      selectedItems: selectedItems.map(item => ({
        id: item.booking.id,
        customer_name: item.booking.customer_name,
        user_email: item.booking.user_email,
        client_account_id: item.booking.client_account_id,
        status: item.booking.status,
        start_at: item.booking.start_at,
        start_at_date: formatDateOnlyForDb(parseBookingDate(item.booking.start_at))
      })),
      selectedClient: {
        key: selectedClient?.key,
        clientKey: selectedClient?.clientKey,
        serviceDate: selectedClient?.serviceDate,
        name: selectedClient?.name,
        email: selectedClient?.email,
        canEmployeeClose: selectedClient?.canEmployeeClose
      }
    });
    
    const { data, error } = await supabase.rpc('close_booking_attention', rpcPayload);
    setIsClosing(false);
    
    console.log('CLOSE_BOOKING - Response:', { data, error });
    
    // Check if we have valid data with an ID (successful closure)
    if (data && data.id) {
      console.log('CLOSE_BOOKING - Success:', data.id);
      setConfirmedInvoiceDetails(buildCurrentInvoiceDetails(data));
      alert('✅ Atención cerrada correctamente.');
      return;
    }
    
    // If we have an actual error message, show it
    if (error && error.message) {
      console.error('Close booking error:', error);
      return alert(`❌ No se pudo cerrar la atención: ${error.message}`);
    }
    
    // Fallback: unknown error
    alert('❌ Error desconocido al cerrar la atención.');
  };

  const generateInvoice = async () => {
    const invoiceDetails = confirmedInvoiceDetails;
    if (!invoiceDetails) return alert('Confirmá el cierre antes de abrir la factura.');

    await generateDetalleFacturaPdf({
      companyContext,
      clientName: invoiceDetails.clientName,
      clientEmail: invoiceDetails.clientEmail,
      items: invoiceDetails.items,
      discountDetails: invoiceDetails.discountDetails,
      surchargeDetails: invoiceDetails.surchargeDetails,
      totals: invoiceDetails.totals,
      payments: invoiceDetails.payments,
      invoiceDate: invoiceDetails.invoiceDate,
      invoiceNumber: invoiceDetails.invoiceNumber
    });
  };

  return (
    <div className="modal">
      <div className="agenda-modal-card close-attention-modal">
        <div className="agenda-modal-header">Cerrar atención</div>
        <div className="agenda-modal-body close-attention-body">
          <div className="close-attention-controls">
            <label>Hasta hoy<input type="text" value={closureCutoffLabel} readOnly /></label>
            <label>Cliente<select value={effectiveSelectedClientKey} onChange={(event) => { if (isClosureConfirmed) return; setSelectedClientKey(event.target.value); setSelectedBookingIds(null); setLineDiscounts({}); setTotalDiscountIds([]); setPayments({ cash: '', transfer: '', card: '' }); }} disabled={isClosureConfirmed}>{clients.length ? clients.map((client) => <option key={client.key} value={client.key}>{formatDisplayDate(`${client.serviceDate}T00:00:00`)} · {client.name}{client.email ? ` · ${client.email}` : ''}</option>) : <option value="">Sin clientes para cerrar</option>}</select></label>
          </div>
          <div className="close-attention-items">
            {clientBookings.length ? clientBookings.map((booking) => {
              const service = services.find((item) => Number(item.id) === Number(booking.service));
              const employee = employees.find((item) => String(item.id) === String(booking.employee_id));
              const item = selectedItems.find((selectedItem) => selectedItem.booking.id === booking.id);
              const isSelected = effectiveSelectedBookingIds.includes(booking.id);
              const activityDiscount = activityDiscountOptions.find((discount) =>
                String(discount.id) === String(service?.activity_discount_check_id) ||
                (discount.serviceIds || []).some((serviceId) => String(serviceId) === String(service?.id))
              );
              const availableLineDiscounts = activityDiscount ? [...lineDiscountOptions, activityDiscount] : lineDiscountOptions;
              return <article className="close-attention-item" key={booking.id}>
                <label className="settings-check-row close-attention-item-check"><input type="checkbox" checked={isSelected} disabled={isClosureConfirmed} onChange={() => setSelectedBookingIds((current) => { if (isClosureConfirmed) return current; const currentIds = Array.isArray(current) ? current : clientBookings.map((itemBooking) => itemBooking.id); return currentIds.includes(booking.id) ? currentIds.filter((id) => id !== booking.id) : [...currentIds, booking.id]; })} /><span>{getBookingActivityLabel(booking, service)}</span></label>
                <div className="close-attention-item-meta">{formatDisplayDate(booking.start_at)} · {formatTime(parseBookingDate(booking.start_at))} - {formatTime(parseBookingDate(booking.end_at))} · {formatPersonShortName(employee)}</div>
                <div className="close-attention-price-row"><span>Base: {formatMoney(item?.basePrice ?? bookingPriceById.get(booking.id) ?? 0)}</span><strong>Subtotal: {formatMoney(item?.subtotal || 0)}</strong></div>
                {isSelected && availableLineDiscounts.length > 0 && <div className="close-attention-discounts">{availableLineDiscounts.map((discount) => {
                  const discountKey = getDiscountKey(discount);
                  return <label className="settings-check-row" key={`${booking.id}-${discountKey}`}><input type="checkbox" checked={(lineDiscounts[booking.id] || []).includes(discountKey)} disabled={isClosureConfirmed} onChange={() => toggleLineDiscount(booking.id, discountKey)} /><span>{formatDiscountOption(discount)}</span></label>;
                })}</div>}
              </article>;
            }) : <div className="agenda-empty-state">No hay turnos pendientes de cierre.</div>}
          </div>
          {totalDiscountOptions.length > 0 && <div className="close-attention-section"><strong>Descuentos sobre total</strong><div className="close-attention-discounts">{totalDiscountOptions.map((discount) => {
            const discountKey = getDiscountKey(discount);
            return <label className="settings-check-row" key={discountKey}><input type="checkbox" checked={totalDiscountIds.includes(discountKey)} disabled={isClosureConfirmed} onChange={() => setTotalDiscountIds((current) => { if (isClosureConfirmed) return current; return current.includes(discountKey) ? current.filter((key) => key !== discountKey) : [...current, discountKey]; })} /><span>{formatDiscountOption(discount)}</span></label>;
          })}</div></div>}
          <div className="close-attention-section close-attention-payments"><label>Efectivo<input type="text" inputMode="decimal" value={payments.cash} onChange={(event) => setPayments((current) => ({ ...current, cash: event.target.value }))} placeholder="0" disabled={isClosureConfirmed} /></label><label>Transferencia<input type="text" inputMode="decimal" value={payments.transfer} onChange={(event) => setPayments((current) => ({ ...current, transfer: event.target.value }))} placeholder="0" disabled={isClosureConfirmed} /></label><label>Tarjeta<input type="text" inputMode="decimal" value={payments.card} onChange={(event) => setPayments((current) => ({ ...current, card: event.target.value }))} placeholder="0" disabled={isClosureConfirmed} /></label></div>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, margin: '4px 4px 0' }}>Cargá el importe base (valor de servicio) que cubre cada medio.</div>
          {(cashPaymentDiscountTotal > 0 || surchargeTotal > 0) && <div style={{ fontSize: '12px', color: '#7c2d12', fontWeight: 800, margin: '2px 4px 0' }}>Se cobra · Efectivo {formatMoney(chargedPaymentAmounts.cash)} · Transferencia {formatMoney(chargedPaymentAmounts.transfer)} · Tarjeta {formatMoney(chargedPaymentAmounts.card)}</div>}
          {activeSurcharges.length > 0 && <div className="close-attention-section"><strong>Recargos aplicados</strong><div className="close-attention-discounts">{activeSurcharges.map((surcharge) => {
            const baseAmount = paymentBaseAmounts[surcharge.paymentMethod] || 0;
            const amount = getSurchargeAmount(surcharge, baseAmount);
            return <span className="settings-check-row" key={getSurchargeKey(surcharge)}><span>{formatSurchargeOption(surcharge)} sobre {formatPaymentMethod(surcharge.paymentMethod)}: +{formatMoney(amount)}{amount > 0 ? ` · Base: ${formatMoney(baseAmount)}` : ''}</span></span>;
          })}</div></div>}
          <div className="close-attention-total">
            <span><span>Valor servicios</span><span>{formatMoney(grossTotal)}</span></span>
            {promotionDiscountTotal > 0 && <span><span>Descuento promoción</span><span>-{formatMoney(promotionDiscountTotal)}</span></span>}
            {cashPaymentDiscountTotal > 0 && <span><span>Descuento efectivo</span><span>-{formatMoney(cashPaymentDiscountTotal)}</span></span>}
            {surchargeTotal > 0 && <span><span>Recargo tarjeta</span><span>+{formatMoney(surchargeTotal)}</span></span>}
            <strong><span>Total final</span><span>{formatMoney(displayFinalTotal)}</span></strong>
            <span><span>Pagado</span><span>{formatMoney(displayChargedTotal)}</span></span>
            <span><span>Base asignada</span><span>{formatMoney(totalPaymentInputAmount)} / {formatMoney(serviceNetTotal)}</span></span>
            {Math.abs(paymentDifference) > 0.01 && <span className="close-attention-difference">{paymentDifference > 0 ? 'Base asignada de más' : 'Falta asignar'}: {formatMoney(Math.abs(paymentDifference))}</span>}
          </div>
          <div className="agenda-modal-actions"><button className="agenda-close-button" type="button" onClick={closeModal}>Cerrar</button>{isClosureConfirmed ? <button className="agenda-option-button" type="button" onClick={generateInvoice}>Abrir factura</button> : <button className="agenda-danger-button" type="button" onClick={confirmClosure} disabled={isClosing || !selectedItems.length || Math.abs(paymentDifference) > 0.01}>{isClosing ? 'Cerrando...' : 'Confirmar cierre'}</button>}</div>
        </div>
      </div>
    </div>
  );
}

function BookingDetailsModal({ booking, service, employee, companyContext, canEditCustomer, canDownloadPdf = false, onClose, onSave }) {
  const initialName = splitCustomerName(booking?.customer_name || '');
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [email, setEmail] = useState(booking?.user_email || '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!booking) return null;

  const startTime = formatTime(parseBookingDate(booking.start_at));
  const endTime = formatTime(parseBookingDate(booking.end_at));
  const bookingDate = formatDisplayDate(booking.start_at);
  const activityLabel = getBookingActivityLabel(booking, service);
  const employeeLabel = formatPersonShortName(employee);
  const statusLabel = getBookingStatusLabel(booking);
  const customerName = booking.customer_name || 'Cliente sin datos';
  const customerEmail = booking.user_email || 'Sin mail cargado';
  const sucursalesHabilitadas = companyContext?.configuracion_operativa?.sucursales_habilitadas === true;
  const branchLabel = sucursalesHabilitadas && booking.branch_id
    ? (Array.isArray(companyContext?.branches) ? companyContext.branches : []).find((branch) => String(branch.id) === String(booking.branch_id))?.name || null
    : null;

  const downloadBookingPdf = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 16;
    let currentY = 18;
    const rows = [
      ['Servicio', activityLabel],
      ['Cliente', customerName],
      ['Mail', customerEmail],
      ['Empleado', employee ? employeeLabel : 'No visible'],
      ['Estado', statusLabel],
      ['Fecha', bookingDate],
      ['Horario', `${startTime} - ${endTime}`]
    ];

    if (booking.booking_description) rows.push(['Detalle', booking.booking_description]);
    if (branchLabel) rows.push(['Sucursal', branchLabel]);
    if (booking.priceDetails?.baseLabel) rows.push(['Costo', booking.priceDetails.baseLabel]);
    if (booking.priceDetails?.netLabel) rows.push(['Neto', booking.priceDetails.netLabel]);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Detalle del turno', margin, currentY);
    currentY += 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generado: ${formatDisplayDate(new Date())}`, margin, currentY);
    currentY += 10;

    rows.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, margin, currentY);
      doc.setFont('helvetica', 'normal');
      const textLines = doc.splitTextToSize(String(value || '-'), 150);
      doc.text(textLines, margin + 32, currentY);
      currentY += Math.max(7, textLines.length * 5);
    });

    const safeName = normalizeComparableText(customerName).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'turno';
    doc.save(`detalle-turno-${safeName}-${String(booking.id || '').slice(0, 8) || 'sin-id'}.pdf`);
  };

  const generateClosedBookingInvoice = async () => {
    const invoiceDetails = booking.priceDetails?.invoice;
    if (!invoiceDetails) return alert('No hay datos de cierre para generar la factura.');

    await generateDetalleFacturaPdf({
      companyContext,
      clientName: invoiceDetails.clientName || customerName,
      clientEmail: invoiceDetails.clientEmail || customerEmail,
      items: invoiceDetails.items,
      discountDetails: invoiceDetails.discountDetails,
      surchargeDetails: invoiceDetails.surchargeDetails,
      totals: {
        grossTotal: invoiceDetails.grossTotal,
        discountTotal: invoiceDetails.discountTotal,
        surchargeTotal: invoiceDetails.surchargeTotal,
        finalTotal: invoiceDetails.finalTotal
      },
      payments: invoiceDetails.payments,
      invoiceDate: invoiceDetails.invoiceDate,
      invoiceNumber: invoiceDetails.invoiceNumber
    });
  };

  const saveCustomerDetails = async () => {
    setErrorMessage('');
    setIsSaving(true);

    try {
      await onSave({ firstName, lastName, email });
      setIsEditing(false);
    } catch (error) {
      setErrorMessage(error?.message || 'No se pudieron guardar los datos del cliente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal">
      <div className="agenda-modal-card booking-detail-modal" style={{ '--service-chip-color': service?.color || '#15b8c8' }}>
        <div className="agenda-modal-header">Detalle del turno</div>
        <div className="agenda-modal-body booking-detail-body">
          <div className="booking-detail-summary">
            <div className="booking-detail-service"><ActivityIcon service={service} size="small" /> <b>{activityLabel}</b></div>
            <div><b>Cliente:</b> {customerName}</div>
            <div><b>Mail:</b> {customerEmail}</div>
            <div><b>Empleado:</b> {employeeLabel}</div>
            <div><b>Estado:</b> {statusLabel}</div>
            {branchLabel && <div><b>Sucursal:</b> {branchLabel}</div>}
            {booking.priceDetails?.baseLabel && <div><b>Costo:</b> {booking.priceDetails.baseLabel}</div>}
            {booking.priceDetails?.isClosed && booking.priceDetails.netLabel && <div><b>Neto:</b> {booking.priceDetails.netLabel}</div>}
            {booking.priceDetails?.isClosed && booking.priceDetails.employeeLabel && <div><b>Rendición empleado:</b> {booking.priceDetails.employeeLabel}</div>}
            {booking.priceDetails?.isClosed && booking.priceDetails.companyLabel && <div><b>Rendición empresa:</b> {booking.priceDetails.companyLabel}</div>}
            <div><b>Fecha:</b> {bookingDate}</div>
            <div><b>Horario:</b> {startTime} - {endTime}</div>
          </div>

          {isEditing && (
            <div className="booking-detail-form">
              <label className="agenda-customer-field">Nombre<input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" /></label>
              <label className="agenda-customer-field">Apellido<input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" /></label>
              <label className="agenda-customer-field">Mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
              {errorMessage && <div className="agenda-customer-error">{errorMessage}</div>}
            </div>
          )}

          <div className="agenda-modal-actions booking-detail-actions">
            {isEditing ? (
              <>
                <button className="agenda-option-button" type="button" onClick={() => { setIsEditing(false); setErrorMessage(''); }} disabled={isSaving}>Cancelar</button>
                <button className="agenda-close-button" type="button" onClick={saveCustomerDetails} disabled={isSaving}>{isSaving ? 'Guardando...' : 'Guardar'}</button>
              </>
            ) : (
              <>
                <button className="agenda-option-button" type="button" onClick={onClose}>Cerrar</button>
                {booking.priceDetails?.invoice && <button className="agenda-option-button" type="button" onClick={generateClosedBookingInvoice}>Abrir factura</button>}
                {canDownloadPdf && <button className="agenda-option-button" type="button" onClick={downloadBookingPdf}>PDF</button>}
                {canEditCustomer && <button className="agenda-close-button" type="button" onClick={() => setIsEditing(true)}>Editar datos</button>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AgendaGrid({ user, refreshKey, accessProfile = 'admin', employeeId, onBookingsChanged, clientCanChooseEmployee = false, selectedPromotion = null, promotions = [], adminProfileSummary = null, companySlug, companyContext, onRequestNewBooking = null, pendingView = false }) {
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeServices, setEmployeeServices] = useState([]);
  const [employeeAvailability, setEmployeeAvailability] = useState([]);
  const [bookingClosureItems, setBookingClosureItems] = useState([]);
  const [bookingClosures, setBookingClosures] = useState([]);
  const [bookingClosureInvoices, setBookingClosureInvoices] = useState([]);
  const [availabilityLoadFailed, setAvailabilityLoadFailed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [offset, setOffset] = useState(0);
  const [visibleDayCount, setVisibleDayCount] = useState(getVisibleDayCount);
  const days = useMemo(() => getWeekDays(offset, visibleDayCount), [offset, visibleDayCount]);

  const [selection, setSelection] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [availableEmployees, setAvailableEmployees] = useState([]);
  const [availableEmployeesMessage, setAvailableEmployeesMessage] = useState('No hay empleados disponibles para ese horario.');
  const [isLoadingAvailableEmployees, setIsLoadingAvailableEmployees] = useState(false);
  const [pendingEmployee, setPendingEmployee] = useState(null);
  const [bookingToCancel, setBookingToCancel] = useState(null);
  const [bookingDetails, setBookingDetails] = useState(null);
  const [assignmentRequest, setAssignmentRequest] = useState(null);
  const [assignmentEmployees, setAssignmentEmployees] = useState([]);
  const [assignmentEmptyReason, setAssignmentEmptyReason] = useState('');
  const [isLoadingAssignmentEmployees, setIsLoadingAssignmentEmployees] = useState(false);
  const [closeAttentionOpen, setCloseAttentionOpen] = useState(false);
  const [closeAttentionInitialDate, setCloseAttentionInitialDate] = useState(formatDateOnlyForDb(new Date()));
  const [closureDiscounts, setClosureDiscounts] = useState([]);
  const [closureSurcharges, setClosureSurcharges] = useState([]);
  const [closurePromotions, setClosurePromotions] = useState(promotions);

  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [mobileRangeStart, setMobileRangeStart] = useState(null);
  const touchTapRef = useRef(null);
  const handledTouchTapRef = useRef(false);
  const configuredPromotions = useMemo(
    () => Array.isArray(promotions) && promotions.length ? promotions : Array.isArray(companyContext?.promotions) ? companyContext.promotions : [],
    [companyContext, promotions]
  );
  const isAdminView = accessProfile === 'admin';
  const isEmployeeView = accessProfile === 'employee';
  const isClientView = accessProfile === 'client';
  const configuracionOperativa = companyContext?.configuracion_operativa || {};
  const slotMinutes = getValidSlotMinutes(configuracionOperativa.intervalo_grilla_minutos);
  const totalSlots = Math.max(1, Math.floor(AGENDA_TOTAL_MINUTES / slotMinutes));
  const preciosHabilitados = configuracionOperativa.precios_habilitados !== false;
  const descuentosHabilitados = preciosHabilitados && configuracionOperativa.descuentos_habilitados !== false;
  const recargosHabilitados = preciosHabilitados && configuracionOperativa.recargos_habilitados !== false;
  const promocionesHabilitadas = preciosHabilitados && configuracionOperativa.promociones_habilitadas !== false;
  const turnosSuperpuestosHabilitados = configuracionOperativa.turnos_superpuestos_habilitados !== false;
  const empleadosPuedenReservar = configuracionOperativa.empleados_pueden_reservar !== false;
  const empleadosVenAgendaCompleta = configuracionOperativa.empleados_ven_agenda_completa !== false;
  const visibilidadTurnosEmpleado = configuracionOperativa.visibilidad_turnos_empleado || 'completa';
  const empleadosCancelanTurnos = configuracionOperativa.empleados_cancelan_turnos || 'propios';
  const empleadosVenDetalleTurnos = configuracionOperativa.empleados_ven_detalle_turnos || 'propios';
  const pdfDetalleTurnoHabilitado = configuracionOperativa.pdf_detalle_turno_habilitado === true;
  const sucursalesHabilitadas = configuracionOperativa.sucursales_habilitadas === true;
  const branches = useMemo(
    () => (Array.isArray(companyContext?.branches) ? companyContext.branches : []),
    [companyContext]
  );
  const showBranchSelector = sucursalesHabilitadas && branches.length > 0;
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const activeBranchId = showBranchSelector ? (selectedBranchId || branches[0]?.id || null) : null;
  const [branchServices, setBranchServices] = useState([]);
  const showAgendaBranchFilter = showBranchSelector && !isClientView;
  const serviceOfferedAtBranch = (serviceId, branchId) => {
    if (!showBranchSelector || !branchId) return true;
    if (serviceId === null || serviceId === undefined) return true; // promociones / sin id
    return branchServices.some((rel) => String(rel.branch_id) === String(branchId) && String(rel.service_id) === String(serviceId));
  };
  const matchesAgendaBranchFilter = (booking) =>
    !showBranchSelector || !activeBranchId || String(booking?.branch_id || '') === String(activeBranchId);
  const applyCompanyFilter = (query) => companyContext?.id ? query.eq('company_id', companyContext.id) : query;
  const canGoBack = !isClientView || offset > 0;
  const isCompactAgenda = visibleDayCount <= 3;
  const timeColumnWidth = isCompactAgenda ? 46 : 64;
  const canEmployeeInteractWithEmptySlots = !isEmployeeView || empleadosPuedenReservar;

  const activeSelection = dragStart && dragEnd
    ? {
        day: dragStart.d,
        start: Math.min(dragStart.s, dragEnd.s),
        end: Math.max(dragStart.s, dragEnd.s)
      }
    : mobileRangeStart
      ? {
          day: mobileRangeStart.day,
          start: mobileRangeStart.slot,
          end: mobileRangeStart.slot
        }
    : selection;

  const selectedRange = useMemo(() => {
    if (!selection) return null;
    return buildReservationRange(days[selection.day], selection.start, selection.end, slotMinutes);
  }, [selection, days, slotMinutes]);

  const selectedRangeLabel = selection && selectedRange
    ? `${formatTime(selectedRange.startLocal)} - ${formatTime(selectedRange.endLocal)} (${formatDuration(selection.start, selection.end, slotMinutes)})`
    : '';
  const branchSelectorNode = showBranchSelector ? (
    <div className="booking-branch-selector" role="group" aria-label="Seleccionar sucursal">
      <span className="booking-branch-selector-label">Sucursal</span>
      <div className="booking-branch-pills">
        {branches.map((branch) => (
          <button
            key={branch.id}
            type="button"
            className={`booking-branch-pill ${String(selectedBranchId) === String(branch.id) ? 'is-selected' : ''}`}
            onClick={() => setSelectedBranchId(branch.id)}
          >
            {branch.name}
          </button>
        ))}
      </div>
    </div>
  ) : null;
  const promotionServices = useMemo(() => {
    const source = selectedPromotion ? [selectedPromotion] : promotions;

    return source
      .filter((promotion) => promotion?.enabled !== false)
      .map((promotion, index) => ({
        id: null,
        promotionKey: `promotion-${promotion.promotionIndex ?? index}-${promotion.title || promotion.bookingLabel || 'promo'}`,
        isPromotion: true,
        promotion,
        name: promotion.title || promotion.bookingLabel || `Banner ${(promotion.promotionIndex ?? index) + 1}`,
        icon: '✨',
        color: '#3fc9d5',
        active: true
      }));
  }, [promotions, selectedPromotion]);
  const bookingPromotion = selectedService?.promotion || selectedPromotion;
  const bookingPromotionText = bookingPromotion
    ? bookingPromotion.bookingLabel || [bookingPromotion.title, bookingPromotion.description, bookingPromotion.value].filter(Boolean).join(' · ')
    : '';
  const bookingPromotionImageUrl = bookingPromotion?.imageDataUrl || '';
  const bookingDescription = bookingPromotion
    ? bookingPromotionText || `Banner ${(bookingPromotion.promotionIndex ?? 0) + 1}`
    : '';
  const reservationOptions = (selectedPromotion ? promotionServices : services)
    .filter((option) => option?.isPromotion || serviceOfferedAtBranch(option?.id, activeBranchId));
  const pendingAssignmentBookings = useMemo(() => bookings
    .filter((booking) => isPendingAssignmentBooking(booking) || isWaitlistBooking(booking))
    .filter((booking) => parseBookingDate(booking.start_at) >= new Date())
    .sort((left, right) => parseBookingDate(left.start_at) - parseBookingDate(right.start_at)), [bookings]);

  /* =========================
     LOAD DATA
  ========================= */

  useEffect(() => {
    const updateVisibleDays = () => {
      setVisibleDayCount(getVisibleDayCount());
    };

    window.addEventListener('resize', updateVisibleDays);

    return () => {
      window.removeEventListener('resize', updateVisibleDays);
    };
  }, []);

  const fetchAll = async () => {
    if (user?.isLocalInternal) {
      const mockData = buildLocalMockAgendaData(employeeId);
      return [
        { data: mockData.bookings, error: null },
        { data: mockData.services, error: null },
        { data: mockData.employees, error: null },
        { data: mockData.employeeAvailability, error: null },
        { data: null, error: null },
        { data: mockData, error: null },
        { data: {
          services: mockData.services,
          employees: mockData.employees,
          employeeServices: mockData.employeeServices,
          employeeAvailability: mockData.employeeAvailability
        }, error: null },
        { data: [], error: null },
        { data: { branchServices: [], employeeBranches: [] }, error: null }
      ];
    }

    const adminDataRequest = isAdminView
      ? supabase.rpc('get_admin_panel_data', {
          account_id_value: user?.isInternal && user?.role === 'admin' ? user.id : null,
          session_token_value: user?.isInternal ? user.sessionToken : null,
          request_status_value: null,
          company_slug_value: companySlug
        })
      : Promise.resolve({ data: null, error: null });
    const internalEmployeeDataRequest = isEmployeeView && user?.isInternal
      ? supabase.rpc('get_internal_employee_workspace', {
          account_id_value: user.id,
          session_token_value: user.sessionToken,
          company_slug_value: companySlug
        })
      : Promise.resolve({ data: null, error: null });
    const bookingOptionsRequest = isClientView || isAdminView || isEmployeeView
      ? supabase.rpc('get_client_booking_options', {
          company_slug_value: companySlug
        })
      : Promise.resolve({ data: null, error: null });
    const closureInvoicesRequest = isAdminView || (isEmployeeView && user?.isInternal)
      ? supabase.rpc('get_booking_closure_invoices', {
          account_id_value: user?.isInternal ? user.id : null,
          session_token_value: user?.isInternal ? user.sessionToken : null,
          company_slug_value: companySlug
        })
      : Promise.resolve({ data: [], error: null });
    const usesInternalEmployeeData = isEmployeeView && user?.isInternal;

    const branchRelationsRequest = showBranchSelector
      ? supabase.rpc('get_branch_relations', { company_slug_value: companySlug })
      : Promise.resolve({ data: { branchServices: [], employeeBranches: [] }, error: null });

    return Promise.all([
      isAdminView || usesInternalEmployeeData
        ? Promise.resolve({ data: null, error: null })
        : isClientView
          ? applyCompanyFilter(supabase
              .from('bookings')
              .select('*')
              .in('status', ['confirmed', 'reserved', 'pending_assignment', 'waitlist', 'completed', 'closed'])
            )
          : applyCompanyFilter(supabase.from('bookings').select('*')),
      isAdminView || usesInternalEmployeeData || isClientView ? Promise.resolve({ data: null, error: null }) : applyCompanyFilter(supabase.from('services').select('*')),
      isAdminView || usesInternalEmployeeData || isClientView ? Promise.resolve({ data: null, error: null }) : applyCompanyFilter(supabase.from('employees').select('*').is('deleted_at', null)),
      usesInternalEmployeeData || isClientView ? Promise.resolve({ data: null, error: null }) : applyCompanyFilter(supabase.from('employee_availability').select('*')),
      adminDataRequest,
      internalEmployeeDataRequest,
      bookingOptionsRequest,
      closureInvoicesRequest,
      branchRelationsRequest
    ]);
  };

  const applyAll = ([{ data: bk }, { data: srv }, { data: emp }, availabilityResult = {}, adminDataResult = {}, internalEmployeeDataResult = {}, bookingOptionsResult = {}, closureInvoicesResult = {}, branchRelationsResult = {}]) => {
    const adminData = adminDataResult.data || {};
    const internalEmployeeData = internalEmployeeDataResult.data || {};
    const bookingOptions = bookingOptionsResult.data || {};
    const branchRelations = branchRelationsResult.data || {};
    const usesInternalEmployeeData = isEmployeeView && user?.isInternal;
    const fallbackServices = bookingOptions.services || [];
    const fallbackEmployees = bookingOptions.employees || [];
    const fallbackEmployeeServices = bookingOptions.employeeServices || [];
    const fallbackAvailability = bookingOptions.employeeAvailability || [];

    const bookingOptionsBookings = Array.isArray(bookingOptions.bookings) ? bookingOptions.bookings : [];
    const loadedBookings = isAdminView
      ? adminData.bookings || []
      : usesInternalEmployeeData
        ? internalEmployeeData.bookings || []
        : isClientView
          ? (bookingOptionsBookings.length ? bookingOptionsBookings : (bk || []))
          : bk || [];
    const visibleBookings = isEmployeeView && (!empleadosVenAgendaCompleta || visibilidadTurnosEmpleado === 'solo_propios')
      ? loadedBookings.filter((booking) =>
          String(booking.employee_id) === String(employeeId)
          || (String(booking.status || '').toLowerCase() === 'pending_assignment' && !booking.employee_id)
        )
      : loadedBookings;

    setBookings(visibleBookings);
    setServices(isAdminView ? adminData.services || fallbackServices : usesInternalEmployeeData ? fallbackServices.length ? fallbackServices : internalEmployeeData.services || [] : isClientView ? fallbackServices : srv || []);
    setEmployees(isAdminView ? adminData.employees || fallbackEmployees : usesInternalEmployeeData ? fallbackEmployees.length ? fallbackEmployees : internalEmployeeData.employees || [] : isClientView ? fallbackEmployees : emp || []);
    setEmployeeServices(isAdminView ? adminData.employeeServices || fallbackEmployeeServices : usesInternalEmployeeData ? fallbackEmployeeServices.length ? fallbackEmployeeServices : internalEmployeeData.employeeServices || [] : isClientView ? fallbackEmployeeServices : []);
    setEmployeeAvailability(usesInternalEmployeeData ? internalEmployeeData.agendaAvailability || internalEmployeeData.availability || fallbackAvailability : isClientView || isAdminView ? fallbackAvailability : availabilityResult.data || []);
    setBookingClosureItems(isAdminView ? adminData.bookingClosureItems || [] : usesInternalEmployeeData ? internalEmployeeData.bookingClosureItems || [] : []);
    setBookingClosures(isAdminView ? adminData.bookingClosures || [] : usesInternalEmployeeData ? internalEmployeeData.bookingClosures || [] : []);
    setBookingClosureInvoices(Array.isArray(closureInvoicesResult.data) ? closureInvoicesResult.data : []);
    setBranchServices(Array.isArray(branchRelations.branchServices) ? branchRelations.branchServices : []);
    setAvailabilityLoadFailed(isClientView || isAdminView || usesInternalEmployeeData ? Boolean(bookingOptionsResult.error) : Boolean(availabilityResult.error));
  };

  const bookingPriceDetailsById = useMemo(() => {
    const closuresById = new Map((bookingClosures || []).map((closure) => [String(closure.id), closure]));
    const invoicesByClosureId = new Map((bookingClosureInvoices || []).map((invoice) => [String(invoice.closure_id), invoice]));
    const bookingsById = new Map((bookings || []).map((booking) => [String(booking.id), booking]));
    const subtotalByClosure = (bookingClosureItems || []).reduce((map, item) => {
      const closureId = String(item.closure_id || '');
      map.set(closureId, (map.get(closureId) || 0) + Number(item.subtotal || 0));
      return map;
    }, new Map());
    const itemsByClosure = (bookingClosureItems || []).reduce((map, item) => {
      const closureId = String(item.closure_id || '');
      const current = map.get(closureId) || [];
      current.push(item);
      map.set(closureId, current);
      return map;
    }, new Map());

    return bookings.reduce((map, booking) => {
      const service = services.find((item) => Number(item.id) === Number(booking.service));
      const closureItem = (bookingClosureItems || []).find((item) => String(item.booking_id) === String(booking.id));
      const closure = closuresById.get(String(closureItem?.closure_id || booking.closure_id || ''));
      const promotionTitle = getBookingActivityLabel(booking, service);
      const promotion = (promotions || []).find((item) => normalizeComparableText(item?.title) === normalizeComparableText(promotionTitle));
      const fallbackBaseAmount = Number(service?.base_price ?? promotion?.price ?? 0) || parseMoney(promotion?.value || booking.booking_description);
      const baseAmount = Number(closureItem?.base_price ?? fallbackBaseAmount);

      if (isClosedBooking(booking) && closureItem) {
        const itemSubtotal = Number(closureItem.subtotal || 0);
        const closureSubtotal = subtotalByClosure.get(String(closureItem.closure_id || '')) || 0;
        const closureTotalDiscount = Number(closure?.total_discount_total || 0);
        const closureTotalSurcharge = Number(closure?.total_surcharge_total || 0);
        const proportionalDiscount = closureSubtotal > 0 ? (itemSubtotal / closureSubtotal) * closureTotalDiscount : 0;
        const proportionalSurcharge = closureSubtotal > 0 ? (itemSubtotal / closureSubtotal) * closureTotalSurcharge : 0;
        const netAmount = Math.max(0, itemSubtotal - proportionalDiscount + proportionalSurcharge);
        const employeeAmount = Number(booking.settlement_employee_amount ?? 0);
        const companyAmount = Number(booking.settlement_company_amount ?? 0);
        const lineDiscountTotal = Number(closureItem.line_discount_total || 0);
        const appliedDiscounts = Array.isArray(closureItem.applied_discounts) ? closureItem.applied_discounts : [];
        const totalDiscounts = Array.isArray(closure?.total_discounts) ? closure.total_discounts : [];
        const closureSurcharges = Array.isArray(closure?.surcharges) ? closure.surcharges : [];
        const closureItems = itemsByClosure.get(String(closureItem.closure_id || '')) || [closureItem];
        const invoiceSnapshot = invoicesByClosureId.get(String(closureItem.closure_id || ''));
        const invoiceItems = closureItems.map((item) => {
          const itemBooking = bookingsById.get(String(item.booking_id)) || booking;
          const itemService = services.find((serviceItem) => Number(serviceItem.id) === Number(itemBooking?.service));
          const itemEmployee = employees.find((employeeItem) => String(employeeItem.id) === String(item.employee_id || itemBooking?.employee_id));
          return {
            serviceName: item.service_name || getBookingActivityLabel(itemBooking, itemService),
            employeeName: item.employee_name || formatPersonShortName(itemEmployee),
            basePrice: Number(item.base_price || 0),
            startAt: itemBooking?.start_at || booking.start_at,
            endAt: itemBooking?.end_at || booking.end_at
          };
        });
        const closureLineDiscountDetails = closureItems.flatMap((item) => {
          const itemDiscountTotal = Number(item.line_discount_total || 0);
          const itemDiscounts = Array.isArray(item.applied_discounts) ? item.applied_discounts : [];
          if (itemDiscountTotal <= 0) return [];
          return [{
            label: itemDiscounts[0] ? `Desc. ${formatDiscountOption(itemDiscounts[0])}` : `Desc. ${item.service_name || 'servicio'}`,
            amount: itemDiscountTotal
          }];
        });
        const closureTotalDiscountAmount = Number(closure?.total_discount_total || 0);
        const closureTotalDiscountDetails = closureTotalDiscountAmount > 0 ? [{
          label: totalDiscounts.length === 1 ? `Desc. ${formatDiscountOption(totalDiscounts[0])}` : 'Desc. sobre total',
          amount: closureTotalDiscountAmount
        }] : [];
        const closureSurchargeDetails = closureSurcharges.map((surcharge) => ({
          label: formatSurchargeInvoiceLabel(surcharge),
          amount: Number(surcharge.amount || 0) || getSurchargeAmount(surcharge, Number(surcharge.baseAmount || 0))
        })).filter((item) => item.amount > 0);

        map[booking.id] = {
          isClosed: true,
          baseLabel: formatMoney(baseAmount),
          netLabel: formatMoney(netAmount),
          employeeLabel: booking.is_settled ? formatMoney(employeeAmount) : 'Aún no liquidada',
          companyLabel: booking.is_settled ? formatMoney(companyAmount) : 'Aún no liquidada',
          invoice: invoiceSnapshot ? {
            invoiceNumber: invoiceSnapshot.invoice_number,
            invoiceDate: invoiceSnapshot.invoiced_at || invoiceSnapshot.created_at,
            clientName: invoiceSnapshot.client_name || booking.customer_name,
            clientEmail: invoiceSnapshot.client_email || booking.user_email,
            items: Array.isArray(invoiceSnapshot.items) ? invoiceSnapshot.items : [],
            grossTotal: Number(invoiceSnapshot.totals?.grossTotal || invoiceSnapshot.totals?.gross_total || 0),
            discountTotal: Number(invoiceSnapshot.totals?.discountTotal || invoiceSnapshot.totals?.discount_total || 0),
            surchargeTotal: Number(invoiceSnapshot.totals?.surchargeTotal || invoiceSnapshot.totals?.surcharge_total || 0),
            finalTotal: Number(invoiceSnapshot.totals?.finalTotal || invoiceSnapshot.totals?.final_total || 0),
            discountDetails: Array.isArray(invoiceSnapshot.discount_details) ? invoiceSnapshot.discount_details : [],
            surchargeDetails: Array.isArray(invoiceSnapshot.surcharge_details) ? invoiceSnapshot.surcharge_details : [],
            payments: invoiceSnapshot.payments || { cash: 0, transfer: 0, card: 0 }
          } : {
            invoiceNumber: formatClosureInvoiceNumber(closure || { id: closureItem.closure_id }),
            invoiceDate: closure?.closed_at || booking.closed_at || closure?.service_date,
            clientName: closure?.client_name || booking.customer_name,
            clientEmail: closure?.client_email || booking.user_email,
            items: invoiceItems,
            grossTotal: Number(closure?.gross_total || 0),
            discountTotal: Number(closure?.line_discount_total || 0) + Number(closure?.total_discount_total || 0),
            surchargeTotal: Number(closure?.total_surcharge_total || 0),
            finalTotal: Number(closure?.final_total || 0),
            discountDetails: [...closureLineDiscountDetails, ...closureTotalDiscountDetails],
            surchargeDetails: closureSurchargeDetails,
            payments: {
              cash: Number(closure?.cash_amount || 0),
              transfer: Number(closure?.transfer_amount || 0),
              card: Number(closure?.card_amount || 0)
            }
          }
        };
        return map;
      }

      if (baseAmount > 0) {
        map[booking.id] = {
          isClosed: false,
          baseLabel: formatMoney(baseAmount)
        };
      }

      return map;
    }, {});
  }, [bookingClosureInvoices, bookingClosureItems, bookingClosures, bookings, employees, promotions, services]);

  const loadAll = async () => {
    const results = await fetchAll();
    applyAll(results);
  };

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await loadAll();
      onBookingsChanged?.();
    } finally {
      setIsRefreshing(false);
    }
  };

  const openCloseAttention = async () => {
    if (!preciosHabilitados) return;

    const { data } = await supabase.rpc('get_app_configuration', {
      company_slug_value: companySlug
    });
    setClosureDiscounts(descuentosHabilitados && Array.isArray(data?.discounts) ? data.discounts : []);
    setClosureSurcharges(recargosHabilitados && Array.isArray(data?.surcharges) ? data.surcharges : []);
    setClosurePromotions(promocionesHabilitadas && Array.isArray(data?.promotions) ? data.promotions : []);
    setCloseAttentionInitialDate(formatDateOnlyForDb(new Date()));
    setCloseAttentionOpen(true);
  };

  useEffect(() => {
    let active = true;

    fetchAll().then((results) => {
      if (active) applyAll(results);
    });

    return () => {
      active = false;
    };
  }, [refreshKey]);

  /* =========================
     EMPLOYEES BY SERVICE
  ========================= */

  const shouldLoadAvailableEmployees = Boolean((selectedService?.id || selectedService?.isPromotion) && selection);

  useEffect(() => {
    if (!showBranchSelector) return;
    setSelectedBranchId((current) => {
      if (current && branches.some((branch) => String(branch.id) === String(current))) return current;
      return branches[0]?.id || '';
    });
  }, [showBranchSelector, branches]);

  useEffect(() => {
    if (!shouldLoadAvailableEmployees) return;

    let active = true;

    const load = async () => {
      setIsLoadingAvailableEmployees(true);
      const usesLoadedEmployeeData = isAdminView || isClientView || (isEmployeeView && user?.isInternal);
      const assignedPromotionEmployeeIds = Array.isArray(selectedService?.promotion?.employeeIds)
        ? selectedService.promotion.employeeIds.map(String)
        : [];
      const rel = selectedService?.isPromotion
        ? employees
            .filter((employee) => assignedPromotionEmployeeIds.some((id) => String(id) === String(employee.id)))
            .map((employee) => ({ employee_id: employee.id }))
        : usesLoadedEmployeeData
        ? employeeServices.filter((relation) => Number(relation.service_id) === Number(selectedService.id))
          : (await applyCompanyFilter(supabase
              .from('employee_services')
              .select('employee_id'))
              .eq('service_id', selectedService.id)).data;

      const ids = rel?.map(r => r.employee_id) || [];
      const filteredIds = ids;

      if (!filteredIds.length) {
        if (active) {
          setAvailableEmployees([]);
          setAvailableEmployeesMessage(selectedService?.isPromotion ? 'Esta promoción no tiene empleados vinculados para atenderla.' : 'No hay empleados vinculados a este servicio.');
          setIsLoadingAvailableEmployees(false);
        }
        return;
      }

      const emp = usesLoadedEmployeeData
        ? employees.filter((employee) => filteredIds.some((id) => String(id) === String(employee.id)))
        : (await applyCompanyFilter(supabase
          .from('employees')
          .select('*')
          .is('deleted_at', null))
            .in('id', filteredIds)).data;

      if (!active) return;

      const serviceEmployees = emp || [];
      const activeEmployees = serviceEmployees.filter((employee) => employee.active !== false);
      const available = activeEmployees.filter((employee) =>
        employee.active !== false &&
        employeeHasAvailability(employeeAvailability, employee.id, selectedRange, availabilityLoadFailed, activeBranchId) &&
        !employeeHasBookingConflict(bookings, employee.id, selectedRange)
      );

      const inactiveCount = serviceEmployees.length - activeEmployees.length;
      const activeWithAvailability = activeEmployees.filter((employee) =>
        employeeHasAvailability(employeeAvailability, employee.id, selectedRange, availabilityLoadFailed, activeBranchId)
      );
      const conflictCount = activeWithAvailability.filter((employee) =>
        employeeHasBookingConflict(bookings, employee.id, selectedRange)
      ).length;

      if (!available.length) {
        if (!serviceEmployees.length) {
          setAvailableEmployeesMessage(selectedService?.isPromotion ? 'Esta promoción no tiene empleados vinculados para atenderla.' : 'No hay empleados vinculados a este servicio.');
        } else if (!activeEmployees.length && inactiveCount > 0) {
          setAvailableEmployeesMessage(selectedService?.isPromotion ? 'Los empleados vinculados a esta promoción estan inactivos. Activalos desde Empleados para asignar turnos.' : 'Los empleados vinculados a este servicio estan inactivos. Activalos desde Empleados para asignar turnos.');
        } else if (!activeWithAvailability.length) {
          setAvailableEmployeesMessage(selectedService?.isPromotion ? 'Los empleados activos de esta promoción no tienen disponibilidad para este horario.' : 'Los empleados activos de este servicio no tienen disponibilidad para este horario.');
        } else if (conflictCount > 0) {
          setAvailableEmployeesMessage('Los empleados disponibles ya tienen un turno en este horario.');
        } else {
          setAvailableEmployeesMessage('No hay empleados disponibles para ese horario.');
        }
      }

      setAvailableEmployees(available);
      setIsLoadingAvailableEmployees(false);
    };

    load();

    return () => {
      active = false;
    };
  }, [shouldLoadAvailableEmployees, selectedService, bookings, employeeAvailability, availabilityLoadFailed, offset, selectedRange, isEmployeeView, isClientView, employeeId, isAdminView, user?.isInternal, employeeServices, employees, activeBranchId, branchServices]);

  useEffect(() => {
    if (!selection || selectedService || !selectedPromotion || !promotionServices.length) return;

    setSelectedService(promotionServices[0]);
  }, [selection, selectedService, selectedPromotion, promotionServices]);

  /* =========================
     SELECTION
  ========================= */

  const start = (d, s) => {
    if (isPastDay(days[d])) return;

    setDragStart({ d, s });
    setDragEnd({ d, s });
  };

  // Abre el panel "Nueva reserva" con dia/hora del slot (si el padre lo habilita).
  const openNewBookingForSlot = (dayIndex, slotIndex) => {
    if (!onRequestNewBooking) return false;
    if (isPastDay(days[dayIndex])) return false;
    const slotDate = buildSlotDate(days[dayIndex], slotIndex, slotMinutes);
    const pad = (value) => String(value).padStart(2, '0');
    const isoDate = `${slotDate.getFullYear()}-${pad(slotDate.getMonth() + 1)}-${pad(slotDate.getDate())}`;
    const isoTime = `${pad(slotDate.getHours())}:${pad(slotDate.getMinutes())}`;
    onRequestNewBooking({ date: isoDate, startTime: isoTime, branchId: activeBranchId || null });
    return true;
  };

  const move = (d, s) => {
    if (!dragStart) return;
    if (d !== dragStart.d) return;

    setDragEnd({ d, s });
  };

  const end = () => {
    if (!dragStart || !dragEnd) return;

    const min = Math.min(dragStart.s, dragEnd.s);
    const max = Math.max(dragStart.s, dragEnd.s);

    if (openNewBookingForSlot(dragStart.d, min)) {
      setDragStart(null);
      setDragEnd(null);
      return;
    }

    setSelection({
      day: dragStart.d,
      start: min,
      end: max
    });

    setDragStart(null);
    setDragEnd(null);
  };

  const getPointerCell = (event) => {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const cell = element?.closest?.('[data-agenda-cell="true"]');

    if (!cell) return null;

    return {
      day: Number(cell.dataset.dayIndex),
      slot: Number(cell.dataset.slotIndex)
    };
  };

  const startPointerSelection = (event, dayIndex, slotIndex) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    // Reserva rápida (admin): un clic abre "Nueva reserva" sin barrido de casillas.
    // Los turnos ya definen su duración por servicio, no por la cantidad de casillas.
    if (onRequestNewBooking && event.pointerType !== 'touch') {
      event.preventDefault();
      openNewBookingForSlot(dayIndex, slotIndex);
      return;
    }

    if (event.pointerType === 'touch') {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      touchTapRef.current = {
        pointerId: event.pointerId,
        dayIndex,
        slotIndex,
        startX: event.clientX,
        startY: event.clientY,
        moved: false
      };
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    start(dayIndex, slotIndex);
  };

  const movePointerSelection = (event) => {
    if (event.pointerType === 'touch' && touchTapRef.current?.pointerId === event.pointerId) {
      const deltaX = Math.abs(event.clientX - touchTapRef.current.startX);
      const deltaY = Math.abs(event.clientY - touchTapRef.current.startY);

      if (deltaX > TOUCH_TAP_MOVE_TOLERANCE || deltaY > TOUCH_TAP_MOVE_TOLERANCE) {
        touchTapRef.current.moved = true;
      }

      return;
    }

    if (!dragStart) return;

    const pointerCell = getPointerCell(event);

    if (!pointerCell || pointerCell.day !== dragStart.d) return;

    event.preventDefault();
    setDragEnd({ d: pointerCell.day, s: pointerCell.slot });
  };

  const selectMobileRangePoint = (dayIndex, slotIndex) => {
    if (isPastDay(days[dayIndex])) return;

    if (openNewBookingForSlot(dayIndex, slotIndex)) return;

    if (!mobileRangeStart || mobileRangeStart.day !== dayIndex) {
      setSelection(null);
      setSelectedService(null);
      setAvailableEmployees([]);
      setPendingEmployee(null);
      setMobileRangeStart({ day: dayIndex, slot: slotIndex });
      return;
    }

    setSelection({
      day: dayIndex,
      start: Math.min(mobileRangeStart.slot, slotIndex),
      end: Math.max(mobileRangeStart.slot, slotIndex)
    });
    setMobileRangeStart(null);
  };

  const finishPointerSelection = (event) => {
    if (event.pointerType === 'touch') {
      const touchTap = touchTapRef.current;
      touchTapRef.current = null;

      if (touchTap?.pointerId === event.pointerId && !touchTap.moved) {
        selectMobileRangePoint(touchTap.dayIndex, touchTap.slotIndex);
        handledTouchTapRef.current = true;
      }

      return;
    }

    end();
  };

  const finishCellPointerSelection = (event) => {
    if (event.pointerType !== 'touch') return;

    finishPointerSelection(event);
  };

  const cancelPointerSelection = (event) => {
    if (event.pointerType === 'touch') {
      touchTapRef.current = null;
      return;
    }

    end();
  };

  const close = () => {
    setSelection(null);
    setSelectedService(null);
    setAvailableEmployees([]);
    setPendingEmployee(null);
    setDragStart(null);
    setDragEnd(null);
    setMobileRangeStart(null);
    touchTapRef.current = null;
    handledTouchTapRef.current = false;
  };

  // Cantidad de casillas de grilla que ocupa una duracion (redondea hacia arriba).
  const slotsForDuration = (durationMinutes) => {
    const minutes = Number(durationMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return 1;
    return Math.max(1, Math.ceil(minutes / slotMinutes));
  };

  // Al elegir el servicio, el turno abarca automaticamente las casillas segun su duracion,
  // tomando como inicio la primera casilla seleccionada.
  const handleSelectService = (service) => {
    setSelectedService(service);

    const duration = service?.default_duration;
    if (!service || service.isPromotion || !(Number(duration) > 0)) return;

    setSelection((current) => {
      if (!current) return current;
      const span = slotsForDuration(duration);
      const startSlot = Math.min(current.start, totalSlots - 1);
      const endSlot = Math.min(startSlot + span - 1, totalSlots - 1);
      return { ...current, start: startSlot, end: endSlot };
    });
  };

  const isOwnBooking = (booking) => (
    (String(booking.user_id || '') === String(user?.id || '')) ||
    (user?.isInternal && user?.role === 'client' && String(booking.client_account_id || '') === String(user?.id || ''))
  );
  const isAssignedBooking = (booking) => String(booking.employee_id) === String(employeeId);
  const canEmployeeCancelBooking = (booking) => {
    if (!isEmployeeView) return true;
    if (empleadosCancelanTurnos === 'todos') return true;
    if (empleadosCancelanTurnos === 'propios') return isAssignedBooking(booking);
    return false;
  };
  const canEmployeeViewBookingDetails = (booking) => {
    if (!isEmployeeView) return true;
    if (empleadosVenDetalleTurnos === 'todos') return true;
    if (empleadosVenDetalleTurnos === 'propios') return isAssignedBooking(booking);
    return false;
  };

  const canCancelBooking = (booking) =>
    !isClosedBooking(booking) &&
    (isAdminView || !isPastDay(parseBookingDate(booking.start_at))) &&
    (isAdminView || (!isEmployeeView && isOwnBooking(booking)) || (isEmployeeView && canEmployeeCancelBooking(booking)));

  const cancelBooking = async (booking) => {
    if (!isAdminView && isPastDay(parseBookingDate(booking.start_at))) {
      setBookingToCancel(null);
      alert('No se pueden cancelar turnos de días pasados.');
      return;
    }

    if (!isAdminView && !(!isEmployeeView && isOwnBooking(booking)) && !(isEmployeeView && canEmployeeCancelBooking(booking))) {
      setBookingToCancel(null);
      alert(isEmployeeView ? 'No tenés habilitada la cancelación de este turno.' : 'Solo podés cancelar turnos propios.');
      return;
    }

    const { error } = await supabase.rpc('cancel_booking', {
      booking_id_value: booking.id,
      account_id_value: user?.isInternal ? user.id : null,
      session_token_value: user?.isInternal ? user.sessionToken : null,
      company_slug_value: companySlug
    });

    if (error) {
      alert('No se pudo cancelar el turno. Intentá nuevamente.');
      return;
    }

    setBookingToCancel(null);
    await loadAll();
    onBookingsChanged?.();
  };

  const updateBookingCustomerDetails = async ({ firstName, lastName, email }) => {
    if (!bookingDetails?.booking?.id) return;

    if (isEmployeeView && !empleadosPuedenReservar) {
      throw new Error('Los empleados no tienen habilitada la modificación de turnos.');
    }

    if (user?.isLocalInternal) {
      const cleanCustomerName = [firstName, lastName].map((value) => String(value || '').trim()).filter(Boolean).join(' ');
      const updatedBooking = {
        ...bookingDetails.booking,
        customer_name: cleanCustomerName || null,
        user_email: String(email || '').trim()
      };

      setBookings((current) => current.map((booking) => booking.id === updatedBooking.id ? updatedBooking : booking));
      setBookingDetails((current) => current ? { ...current, booking: updatedBooking } : current);
      return;
    }

    const { data, error } = await supabase.rpc('update_booking_customer_details', {
      booking_id_value: bookingDetails.booking.id,
      customer_first_name_value: firstName,
      customer_last_name_value: lastName,
      customer_email_value: email,
      account_id_value: user?.isInternal ? user.id : null,
      session_token_value: user?.isInternal ? user.sessionToken : null,
      company_slug_value: companySlug
    });

    if (error) throw error;

    const updatedBooking = data || bookingDetails.booking;
    setBookingDetails((current) => current ? { ...current, booking: updatedBooking } : current);
    await loadAll();
    onBookingsChanged?.();
  };

  /* =========================
     RESERVE (UTC CORRECT)
  ========================= */

  const chooseEmployeeForReservation = (employee) => {
    if (isEmployeeView && !empleadosPuedenReservar) {
      alert('Los empleados no tienen habilitada la reserva de turnos.');
      return;
    }

    if (isClientView && clientCanChooseEmployee) {
      reserve(employee);
      return;
    }

    if (isClientView) {
      reserveClientRequest();
      return;
    }

    setPendingEmployee(employee);
  };

  const stampBookingBranch = async (bookingRow) => {
    if (!activeBranchId || !bookingRow?.id) return;
    await supabase.rpc('set_booking_branch', {
      booking_id_value: bookingRow.id,
      branch_id_value: activeBranchId,
      company_slug_value: companySlug
    });
  };

  const reserveClientRequest = async () => {
    const range = selectedRange;

    if (!range || (!selectedService?.id && !selectedService?.isPromotion)) return;

    const customerName = user?.displayName || user?.email || '';
    const customerEmail = user?.email || '';
    const clientIdentity = {
      userId: user?.isInternal ? null : user?.id,
      accountId: user?.isInternal && user?.role === 'client' ? user?.id : null,
      email: customerEmail
    };

    if (clientHasBookingConflict(bookings, clientIdentity, range)) {
      alert('Ya tenés un turno o solicitud en ese horario. Una persona no puede tener dos reservas superpuestas.');
      return;
    }

    if (!turnosSuperpuestosHabilitados && companyHasBookingConflict(bookings, range)) {
      alert('Ese horario ya está ocupado. La empresa no permite turnos superpuestos.');
      return;
    }

    if (!availabilityLoadFailed && !availableEmployees.length) {
      alert('No hay disponibilidad para ese servicio en ese horario. Probá con otro horario.');
      return;
    }

    const { data, error } = await supabase.rpc('request_client_booking', {
      service_id_value: selectedService.id || null,
      employee_id_value: null,
      booking_description_value: bookingDescription || null,
      start_at_value: range.start_at,
      end_at_value: range.end_at,
      customer_name_value: customerName || null,
      customer_email_value: customerEmail || null,
      company_slug_value: companySlug,
      account_id_value: user?.isInternal && user?.role === 'client' ? user.id : null,
      session_token_value: user?.isInternal && user?.role === 'client' ? user.sessionToken : null
    });

    if (error) {
      alert(`No se pudo solicitar el turno: ${error.message}`);
      return;
    }

    await stampBookingBranch(data);

    alert('Solicitud enviada. El administrador asignará un empleado y confirmará el turno.');
    close();
    await loadAll();
    onBookingsChanged?.();
  };

  const reserve = async (employee, customer = null) => {
    const range = selectedRange;

    if (!range) return;

    if (isEmployeeView && !empleadosPuedenReservar) {
      alert('Los empleados no tienen habilitada la reserva de turnos.');
      return;
    }

    const customerName = customer?.name?.trim() || user?.displayName || user?.email || '';
    const customerEmail = customer?.email?.trim() || user?.email || '';
    const clientIdentity = {
      userId: isClientView && !user?.isInternal ? user?.id : null,
      accountId: isClientView && user?.isInternal && user?.role === 'client' ? user?.id : null,
      email: customerEmail
    };

    if (clientHasBookingConflict(bookings, clientIdentity, range)) {
      alert('Ese cliente ya tiene un turno en ese horario. Una persona no puede tener dos reservas superpuestas.');
      return;
    }

    if (!turnosSuperpuestosHabilitados && companyHasBookingConflict(bookings, range)) {
      alert('Ese horario ya está ocupado. La empresa no permite turnos superpuestos.');
      return;
    }

    if (employeeHasBookingConflict(bookings, employee.id, range)) {
      alert(`${employee.name} ya tiene un turno en ese horario`);
      return;
    }

    if (!employeeHasAvailability(employeeAvailability, employee.id, range, availabilityLoadFailed, activeBranchId)) {
      alert(`${employee.name} no tiene disponibilidad configurada para ese horario`);
      return;
    }

    const shouldValidateWithRpc = isClientView || (user?.isInternal && (isAdminView || isEmployeeView));
    const { data: conflicts, error: conflictError } = shouldValidateWithRpc
      ? { data: [], error: null }
        : await applyCompanyFilter(supabase
          .from('bookings')
          .select('id, employee_id'))
          .in('status', ['confirmed', 'reserved'])
          .eq('employee_id', employee.id)
          .lt('start_at', range.end_at)
          .gt('end_at', range.start_at)
          .limit(1);

    if (conflictError) {
      alert('No se pudo validar la disponibilidad. Intentá nuevamente.');
      return;
    }

    if (conflicts?.length) {
      alert(`${employee.name} ya tiene un turno en ese horario`);
      await loadAll();
      return;
    }

    if (!availabilityLoadFailed && !shouldValidateWithRpc) {
      const availableDate = formatDateOnlyForDb(range.startLocal);
      const { data: availabilityRows, error: availabilityError } = await applyCompanyFilter(supabase
        .from('employee_availability')
        .select('*')
        .eq('employee_id', employee.id)
        .eq('available_date', availableDate)
        .eq('active', true));

      if (availabilityError) {
        alert('No se pudo validar la disponibilidad horaria del empleado. Intentá nuevamente.');
        return;
      }

      if (!employeeHasAvailability(availabilityRows || [], employee.id, range)) {
        alert(`${employee.name} no tiene disponibilidad configurada para ese horario`);
        await loadAll();
        return;
      }
    }

    const { data: clientConflicts, error: clientConflictError } = shouldValidateWithRpc
      ? { data: [], error: null }
        : await applyCompanyFilter(supabase
          .from('bookings')
          .select('id, user_id, user_email, status, start_at, end_at'))
          .in('status', ['confirmed', 'reserved'])
          .lt('start_at', range.end_at)
          .gt('end_at', range.start_at);

    if (clientConflictError) {
      alert('No se pudo validar la disponibilidad del cliente. Intentá nuevamente.');
      return;
    }

    if (clientHasBookingConflict(clientConflicts || [], clientIdentity, range)) {
      alert('Ese cliente ya tiene un turno en ese horario. Una persona no puede tener dos reservas superpuestas.');
      await loadAll();
      return;
    }

    const { data, error } = isClientView
      ? await supabase.rpc('request_client_booking', {
          service_id_value: selectedService.id || null,
          employee_id_value: employee.id,
          booking_description_value: bookingDescription || null,
          start_at_value: range.start_at,
          end_at_value: range.end_at,
          customer_name_value: customerName || null,
          customer_email_value: customerEmail || null,
          company_slug_value: companySlug,
          account_id_value: user?.isInternal && user?.role === 'client' ? user.id : null,
          session_token_value: user?.isInternal && user?.role === 'client' ? user.sessionToken : null
        })
      : isAdminView
      ? await supabase.rpc('create_admin_booking', {
          service_id_value: selectedService.id,
          employee_id_value: employee.id,
          start_at_value: range.start_at,
          end_at_value: range.end_at,
          customer_name_value: customerName || null,
          customer_email_value: customerEmail || null,
          account_id_value: user?.isInternal && user?.role === 'admin' ? user.id : null,
          session_token_value: user?.isInternal ? user.sessionToken : null,
          booking_description_value: selectedService.isPromotion ? bookingDescription || null : null,
          company_slug_value: companySlug
        })
      : user?.isInternal && isEmployeeView
        ? await supabase.rpc('create_internal_employee_booking', {
          service_id_value: selectedService.id,
          employee_id_value: employee.id,
          start_at_value: range.start_at,
          end_at_value: range.end_at,
          customer_name_value: customerName || null,
          customer_email_value: customerEmail || null,
          account_id_value: user.id,
          session_token_value: user.sessionToken,
          booking_description_value: selectedService.isPromotion ? bookingDescription || null : null,
          company_slug_value: companySlug
        })
        : await supabase.from('bookings').insert({
          company_id: companyContext?.id || null,
          branch_id: activeBranchId,
          user_id: isClientView ? user.id : null,
          user_email: customerEmail,
          customer_name: customerName || null,
          service: selectedService.id || null,
          employee_id: employee.id,
          booking_description: isClientView ? bookingDescription || null : null,
          start_at: range.start_at,
          end_at: range.end_at,
          status: 'confirmed'
        });

    if (error) {
      alert(isClientView ? `No se pudo solicitar el turno: ${error.message}` : `No se pudo reservar ese horario: ${error.message}`);
      return;
    }

    await stampBookingBranch(data);

    close();
    await loadAll();
    onBookingsChanged?.();
  };

  const formatBookingRangeLabel = (booking) => {
    const range = buildRangeFromBooking(booking);
    return `${formatDisplayDate(range.startLocal)} ${formatTime(range.startLocal)} - ${formatTime(range.endLocal)}`;
  };

  const openAssignmentRequest = async (booking) => {
    const isPromotionBooking = !booking.service && Boolean(booking.booking_description);
    const promotion = isPromotionBooking
      ? findPromotionByBookingDescription(configuredPromotions, booking.booking_description)
      : null;
    const service = isPromotionBooking
      ? {
          id: null,
          isPromotion: true,
          name: booking.booking_description,
          icon: '✨',
          color: '#67e8f9',
          active: true,
          promotion
        }
      : services.find((item) => Number(item.id) === Number(booking.service));
    const range = buildRangeFromBooking(booking);
    const hasClientConflict = clientHasBookingConflict(bookings, { userId: booking.user_id, email: booking.user_email }, range, booking.id);

    setAssignmentRequest({ booking, service, range, hasClientConflict });
    setAssignmentEmployees([]);
    setAssignmentEmptyReason('');
    setIsLoadingAssignmentEmployees(true);

    const relResult = isPromotionBooking
      ? { data: Array.isArray(promotion?.employeeIds) ? promotion.employeeIds.map((id) => ({ employee_id: id })) : [], error: null }
      : isAdminView
      ? { data: employeeServices.filter((relation) => Number(relation.service_id) === Number(booking.service)), error: null }
      : user?.isInternal && isEmployeeView
        ? { data: employeeServices.filter((relation) => Number(relation.service_id) === Number(booking.service)), error: null }
        : await applyCompanyFilter(supabase
          .from('employee_services')
          .select('employee_id'))
          .eq('service_id', booking.service);

    const { data: rel, error: relError } = relResult;

    if (relError) {
      alert('No se pudieron consultar empleados para ese servicio.');
      setIsLoadingAssignmentEmployees(false);
      return;
    }

    const ids = rel?.map((relation) => relation.employee_id) || [];

    if (!ids.length) {
      setAssignmentEmployees([]);
      setAssignmentEmptyReason(isPromotionBooking
        ? 'Esta promoción no tiene empleados vinculados para atenderla. Vinculá empleados a la promoción para poder asignarla.'
        : 'No hay empleados vinculados a este servicio. Vinculá empleados al servicio para poder asignarlos.');
      setIsLoadingAssignmentEmployees(false);
      return;
    }

    const empResult = isAdminView || (user?.isInternal && isEmployeeView)
      ? { data: employees.filter((employee) => ids.some((id) => String(id) === String(employee.id))), error: null }
        : await applyCompanyFilter(supabase
          .from('employees')
          .select('*')
          .is('deleted_at', null))
          .in('id', ids);

    const { data: emp, error: empError } = empResult;

    if (empError) {
      alert('No se pudieron consultar empleados disponibles.');
      setIsLoadingAssignmentEmployees(false);
      return;
    }

    const canOverrideAvailability = isAdminView || (user?.isInternal && isEmployeeView);

    const assignmentOptions = (emp || [])
      .filter((employee) => employee.active !== false)
      .map((employee) => {
        const hasAvailability = employeeHasAvailability(employeeAvailability, employee.id, range, availabilityLoadFailed);
        const hasConflict = employeeHasBookingConflict(bookings, employee.id, range);

        return {
          ...employee,
          assignmentHasAvailability: hasAvailability,
          assignmentHasConflict: hasConflict,
          assignmentCanAssign: !hasClientConflict && !hasConflict && (canOverrideAvailability || availabilityLoadFailed || hasAvailability)
        };
      })
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'es'));

    setAssignmentEmployees(assignmentOptions);
    setAssignmentEmptyReason(assignmentOptions.length ? '' : 'Los empleados vinculados a este servicio están inactivos.');
    setIsLoadingAssignmentEmployees(false);
  };

  const closeAssignmentRequest = () => {
    setAssignmentRequest(null);
    setAssignmentEmployees([]);
    setAssignmentEmptyReason('');
    setIsLoadingAssignmentEmployees(false);
  };

  const assignEmployeeToRequest = async (employee) => {
    if (!assignmentRequest?.booking?.id) return;

    if (assignmentRequest.hasClientConflict) {
      alert('El cliente ya tiene un turno asignado en ese horario.');
      return;
    }

    if (employee.assignmentHasConflict) {
      alert(`${employee.name} ya tiene un turno en ese horario.`);
      return;
    }

    if (!availabilityLoadFailed && employee.assignmentHasAvailability === false) {
      alert(`${employee.name} no tiene disponibilidad configurada para ese horario.`);
      return;
    }

    const { error } = isAdminView
      ? await supabase.rpc('assign_admin_booking_employee', {
          booking_id_value: assignmentRequest.booking.id,
          employee_id_value: employee.id,
          account_id_value: user?.isInternal && user?.role === 'admin' ? user.id : null,
          session_token_value: user?.isInternal ? user.sessionToken : null,
          company_slug_value: companySlug
        })
      : await applyCompanyFilter(supabase
          .from('bookings')
          .update({
            employee_id: employee.id,
            status: 'confirmed'
          }))
          .eq('id', assignmentRequest.booking.id)
          .is('employee_id', null);

    if (error) {
      alert(`No se pudo asignar el empleado: ${formatAssignmentError(error)}`);
      return;
    }

    closeAssignmentRequest();
    await loadAll();
    onBookingsChanged?.();
  };

  /* =========================
     MATCH SLOT (FIX TIMEZONE SAFE)
  ========================= */

  const isBooked = (b, slotTime) => {
    const start = parseBookingDate(b.start_at).getTime();
    const end = parseBookingDate(b.end_at).getTime();
    const slot = slotTime.getTime();

    return slot >= start && slot < end;
  };

  /* =========================
     RENDER
  ========================= */

  return (
    <div
      className={`agenda-grid${pendingView ? ' agenda-grid-pending' : ''}`}
      onPointerMove={movePointerSelection}
      onPointerUp={finishPointerSelection}
      onPointerCancel={cancelPointerSelection}
      style={{ userSelect: 'none' }}
    >

      {isAdminView && adminProfileSummary && (
        <section className="admin-page-heading agenda-page-heading">
          <div>
            <h1>{pendingView ? 'Pendientes de asignar' : 'Agenda'}</h1>
            <p>{pendingView ? 'Asigná un profesional a los turnos pendientes o en lista de espera.' : 'Gestioná turnos, solicitudes pendientes y cierres de atención.'}</p>
          </div>
          {adminProfileSummary}
        </section>
      )}

      {isAdminView && pendingView && (
        <section className="admin-pending-panel booking-assignment-panel admin-pending-page">
          <div className="agenda-modal-header">Solicitudes pendientes de asignación</div>
          {pendingAssignmentBookings.length === 0 ? (
            <div className="agenda-empty-state">No hay turnos pendientes de asignar.</div>
          ) : (
          <div className="admin-pending-list">
            {pendingAssignmentBookings.map((booking) => {
              const service = services.find((item) => Number(item.id) === Number(booking.service));
              const isWaitlist = isWaitlistBooking(booking);
              const assignmentLabel = `${getBookingActivityLabel(booking, service)} / ${isWaitlist ? 'En espera' : 'Pendiente'}`;
              const bundleType = String(booking.bundle_type || '').toLowerCase();
              const bundleLabel = bundleType === 'pack' ? 'Pack' : bundleType === 'promo' ? 'Promo' : '';

              return (
                <article className={`admin-record-card booking-assignment-card${isWaitlist ? ' booking-assignment-card-waitlist' : ''}`} key={booking.id} style={{ '--service-chip-color': service?.color || '#15b8c8' }}>
                  <div className="admin-record-main">
                    <span className="booking-assignment-service">
                      <ActivityIcon service={service} size="small" />
                      <strong>{assignmentLabel}</strong>
                      {bundleLabel && (
                        <span className={`booking-assignment-bundle-tag booking-assignment-bundle-tag-${bundleType}`}>{bundleLabel}</span>
                      )}
                    </span>
                    <span className="admin-record-meta booking-assignment-meta">{booking.customer_name || booking.user_email || 'Cliente'} · {formatBookingRangeLabel(booking)}</span>
                  </div>
                  <div className="admin-record-actions">
                    <button
                      className="agenda-option-button"
                      type="button"
                      onClick={() => setBookingDetails({ booking, service, employee: null })}
                    >
                      Ver detalle
                    </button>
                    <button className="agenda-close-button" type="button" onClick={() => openAssignmentRequest(booking)}>
                      Asignar empleado
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          )}
        </section>
      )}

      {!pendingView && (
      <>
      {/* SELECTOR DE SUCURSAL (cliente) */}
      {isClientView && showBranchSelector && (
        <div className="client-branch-bar">
          <span className="client-branch-bar-title">Elegí la sucursal</span>
          <p className="client-branch-bar-hint">Seleccioná dónde querés tu turno antes de elegir el horario.</p>
          <div className="client-branch-bar-pills" role="group" aria-label="Seleccionar sucursal">
            {branches.map((branch) => (
              <button
                key={branch.id}
                type="button"
                className={`client-branch-bar-pill ${String(activeBranchId) === String(branch.id) ? 'is-selected' : ''}`}
                onClick={() => setSelectedBranchId(branch.id)}
              >
                {branch.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* NAV */}
      <div className="agenda-week-nav">
        <button
          className="agenda-week-button"
          disabled={!canGoBack}
          onClick={() => setOffset(isClientView ? Math.max(0, offset - visibleDayCount) : offset - visibleDayCount)}
          aria-label="Semana anterior"
        >
          ←
        </button>
        <button className="agenda-week-button" onClick={() => setOffset(offset + visibleDayCount)} aria-label="Siguientes dias">→</button>
        <button
          className="agenda-refresh-button"
          type="button"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          title="Actualizar turnos"
        >
          {isRefreshing ? 'Actualizando…' : 'Actualizar'}
        </button>
        {!isClientView && preciosHabilitados && (
          <button className="agenda-close-attention-button" type="button" onClick={openCloseAttention}>
            Cerrar atención
          </button>
        )}
        {showAgendaBranchFilter && (
          <label className="agenda-branch-filter">
            <span>Sucursal</span>
            <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)}>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* HEADER */}
      <div
        className="agenda-days-header"
        style={{ gridTemplateColumns: `${timeColumnWidth}px repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <div className="agenda-time-header-spacer" />
        {days.map((d, i) => (
          <div className="agenda-day-heading" key={i}>
            <span className="agenda-day-name">{formatDisplayDate(d, { weekday: 'short' }).split(',')[0]}</span>
            <span className="agenda-day-date">{formatDisplayDate(d)}</span>
          </div>
        ))}
      </div>

      {mobileRangeStart && !selection && (
        <div className="agenda-mobile-range-hint">
          Elegí el horario final
        </div>
      )}

      {/* GRID */}
      {[...Array(totalSlots)].map((_, slotIndex) => {
        const label = buildSlotDate(days[0], slotIndex, slotMinutes);
        const rowSlotBookings = days.map((day) => {
          const slotTime = buildSlotDate(day, slotIndex, slotMinutes);

          return bookings.filter((booking) =>
            isVisibleGridBooking(booking) && isBooked(booking, slotTime) && matchesAgendaBranchFilter(booking)
          );
        });
        const rowMaxBookings = Math.max(0, ...rowSlotBookings.map((slotBookings) => slotBookings.length));
        const emptySlotHeight = isCompactAgenda ? 44 : EMPTY_SLOT_HEIGHT;
        const bookedSlotPaddingHeight = isCompactAgenda ? 8 : BOOKED_SLOT_PADDING_HEIGHT;
        const bookingStackHeight = isCompactAgenda ? 48 : BOOKING_STACK_HEIGHT;
        const rowHeight = rowMaxBookings
          ? Math.max(emptySlotHeight, bookedSlotPaddingHeight + (rowMaxBookings * bookingStackHeight))
          : emptySlotHeight;

        return (
          <div
            className="agenda-row"
            key={slotIndex}
            style={{
              display: 'grid',
              gridTemplateColumns: `${timeColumnWidth}px repeat(${days.length}, minmax(0, 1fr))`
            }}
          >
            <div className="agenda-time-cell" style={{ minHeight: rowHeight }}>
              {formatTime(label)}
            </div>

            {days.map((day, dayIndex) => {
              const isDisabled = isPastDay(day);
              const slotBookings = rowSlotBookings[dayIndex];
              const bloqueaSuperpuestos = slotBookings.length > 0 && !turnosSuperpuestosHabilitados;

              const isSelected = !isDisabled && activeSelection?.day === dayIndex &&
                slotIndex >= activeSelection.start &&
                slotIndex <= activeSelection.end;

              return (
                <div
                  className={`agenda-slot-cell${bloqueaSuperpuestos ? ' agenda-slot-cell-blocked' : ''}`}
                  key={dayIndex}
                  data-agenda-cell="true"
                  data-day-index={dayIndex}
                  data-slot-index={slotIndex}
                  onPointerDown={(event) => {
                    if (!canEmployeeInteractWithEmptySlots || bloqueaSuperpuestos) return;
                    startPointerSelection(event, dayIndex, slotIndex);
                  }}
                  onPointerUp={finishCellPointerSelection}
                  onLostPointerCapture={finishCellPointerSelection}
                  onPointerEnter={() => move(dayIndex, slotIndex)}
                  onClick={() => {
                    if (handledTouchTapRef.current) {
                      handledTouchTapRef.current = false;
                      return;
                    }

                    if (isCompactAgenda && canEmployeeInteractWithEmptySlots && !bloqueaSuperpuestos) selectMobileRangePoint(dayIndex, slotIndex);
                  }}
                  style={{
                    border: '1px solid #edf1f5',
                    minHeight: rowHeight,
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    background: isDisabled
                      ? '#f7f8fa'
                      : isSelected
                        ? 'rgba(15, 62, 168, 0.09)'
                        : 'transparent',
                    outline: isSelected ? '2px solid rgba(15, 62, 168, 0.38)' : 'none',
                    outlineOffset: -2,
                    cursor: isDisabled || !canEmployeeInteractWithEmptySlots || bloqueaSuperpuestos ? 'not-allowed' : 'pointer'
                  }}
                >
                  <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column' }}>
                    {slotBookings.map(b => {
                      const service = services.find(s => Number(s.id) === Number(b.service));
                      const emp = employees.find(e => e.id === b.employee_id);
                      const employeeLabel = formatPersonShortName(emp);
                      const isOwn = isOwnBooking(b);
                      const isAssigned = isAssignedBooking(b);
                      const isClosed = isClosedBooking(b);
                      const isWaitlist = isWaitlistBooking(b);
                      const isEmployeeForeignBooking = isEmployeeView && !isOwn && !isAssigned;
                      const hideEmployee = isEmployeeView && ['solo_ocupado', 'cliente_sin_empleado', 'cliente_servicio'].includes(visibilidadTurnosEmpleado);
                      const hideCustomer = isEmployeeView && visibilidadTurnosEmpleado === 'solo_ocupado' && isEmployeeForeignBooking;
                      const canOpenDetails = isAdminView || (!isEmployeeView && isOwn) || (isEmployeeView && canEmployeeViewBookingDetails(b));
                      const canViewCustomerDetails = isAdminView || (!isEmployeeView && isOwn) || (isEmployeeView && !hideCustomer && canEmployeeViewBookingDetails(b));
                      const visibleEmployeeLabel = hideEmployee ? '' : employeeLabel;
                      const activityLabel = getBookingActivityLabel(b, service);
                      const displayLabel = isEmployeeView && isEmployeeForeignBooking && visibilidadTurnosEmpleado === 'solo_ocupado'
                        ? 'Ocupado'
                        : isWaitlist
                          ? `${activityLabel} / En espera`
                          : isEmployeeView && visibilidadTurnosEmpleado === 'cliente_servicio'
                            ? `${getClientName(b)} / ${activityLabel}`
                            : visibleEmployeeLabel
                              ? `${activityLabel} / ${visibleEmployeeLabel}`
                              : activityLabel;
                      const priceDetails = preciosHabilitados ? bookingPriceDetailsById[b.id] : null;
                      // Nombre (solo el primero) del cliente de la reserva. Si se reservó
                      // con el check "a mi nombre", customer_name guarda el username.
                      const alreadyShowsClient = isEmployeeView && visibilidadTurnosEmpleado === 'cliente_servicio';
                      const clientFirstName = (canViewCustomerDetails && !alreadyShowsClient)
                        ? (String(b.customer_name || '').trim().split(/\s+/)[0] || '')
                        : '';

                      return (
                        <BookingItem
                          key={b.id}
                          booking={b}
                          service={service}
                          employee={hideEmployee ? null : emp}
                          canCancel={canCancelBooking(b)}
                          isClosed={isClosed}
                          canShowDetails={canOpenDetails}
                          canViewCustomer={canViewCustomerDetails}
                          customerLabel={isOwn ? 'Tu turno' : 'Turno reservado'}
                          displayLabel={displayLabel}
                          employeeLabel={visibleEmployeeLabel}
                          clientLabel={clientFirstName}
                          priceDetails={priceDetails}
                          compact={isCompactAgenda}
                          fillCell={bloqueaSuperpuestos}
                          onOpenDetails={() => {
                            if (canOpenDetails) {
                              setBookingDetails({ booking: { ...b, priceDetails }, service, employee: hideEmployee ? null : emp });
                            }
                          }}
                          onCancel={() => setBookingToCancel({
                            booking: b,
                            service,
                            employee: emp
                          })}
                        />
                      );
                    })}
                  </div>

                  {isCompactAgenda && slotBookings.length > 0 && !isDisabled && turnosSuperpuestosHabilitados && (
                    <div className="agenda-slot-add-actions">
                      {/* Espacio vacío - botón removido */}
                    </div>
                  )}

                  {(!slotBookings.length || turnosSuperpuestosHabilitados) && (
                    <div
                      aria-hidden="true"
                      style={{
                        flex: slotBookings.length ? '0 0 4px' : '1 1 auto',
                        borderTop: slotBookings.length ? '1px dashed rgba(15, 62, 168, 0.16)' : 'none'
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      </>
      )}

      {/* MODAL SERVICIOS */}
      {selection && !selectedService && !selectedPromotion && (
        <ServiceModal
          services={reservationOptions}
          rangeLabel={selectedRangeLabel}
          startLabel={selectedRange ? formatTime(selectedRange.startLocal) : ''}
          slotMinutes={slotMinutes}
          onClose={close}
          onSelectService={handleSelectService}
        />
      )}

      {/* MODAL EMPLEADOS */}
      {selection && selectedService && isClientView && !clientCanChooseEmployee && (
        <div className="modal">
          <div className="agenda-modal-card client-request-modal" style={{ '--service-chip-color': selectedService?.color || '#15b8c8' }}>
            <div className="agenda-modal-header">Solicitar turno</div>
            <div className="agenda-modal-body">
              <div className="agenda-modal-summary client-request-service-chip">
                <span className="agenda-summary-title"><ActivityIcon service={selectedService} size="small" /> {selectedService.name}</span>
                <span className="client-request-time">{selectedRangeLabel}</span>
                {bookingPromotionImageUrl && (
                  <span
                    className="client-request-promotion-image"
                    role="img"
                    aria-label={selectedService.name || 'Promoción'}
                    style={{ backgroundImage: `url(${bookingPromotionImageUrl})` }}
                  />
                )}
                {bookingPromotionText && <span className="client-request-promotion">{bookingPromotionText}</span>}
              </div>

              {isLoadingAvailableEmployees ? (
                <div className="agenda-empty-state">Validando disponibilidad...</div>
              ) : !selectedService?.isPromotion && availableEmployees.length === 0 && !availabilityLoadFailed ? (
                <div className="agenda-empty-state">No hay disponibilidad para ese horario.</div>
              ) : selectedService?.isPromotion && availableEmployees.length === 0 && !availabilityLoadFailed ? (
                <div className="agenda-empty-state">{availableEmployeesMessage}</div>
              ) : (
                <div className="agenda-empty-state">El administrador asignará un empleado disponible para tu turno.</div>
              )}

              <div className="agenda-modal-actions client-request-actions">
                <button className="client-welcome-action client-request-secondary" type="button" onClick={close}>Cerrar</button>
                <button className="client-welcome-action client-request-submit" type="button" onClick={reserveClientRequest} disabled={isLoadingAvailableEmployees || (availableEmployees.length === 0 && !availabilityLoadFailed)}>
                  Solicitar turno
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selection && selectedService && isClientView && clientCanChooseEmployee && (
        <EmployeeModal
          employees={availableEmployees}
          rangeLabel={selectedRangeLabel}
          selectedService={selectedService}
          emptyMessage={availableEmployeesMessage}
          isLoading={isLoadingAvailableEmployees}
          summaryExtra={bookingPromotionText}
          summaryImageUrl={bookingPromotionImageUrl}
          onClose={close}
          onReserve={chooseEmployeeForReservation}
          fallbackActionLabel="Solicitar sin elegir empleado"
          onFallbackReserve={reserveClientRequest}
          fallbackDisabled={isLoadingAvailableEmployees || (!selectedService?.isPromotion && availableEmployees.length === 0 && !availabilityLoadFailed)}
        />
      )}

      {selection && selectedService && !isClientView && !pendingEmployee && (
        <EmployeeModal
          employees={availableEmployees}
          rangeLabel={selectedRangeLabel}
          selectedService={selectedService}
          emptyMessage={availableEmployeesMessage}
          onClose={close}
          onReserve={chooseEmployeeForReservation}
          branchSelector={branchSelectorNode}
        />
      )}

      {assignmentRequest && (
        <div className="modal">
          <div className="agenda-modal-card assignment-employee-modal" style={{ '--service-chip-color': assignmentRequest.service?.color || '#15b8c8' }}>
            <div className="agenda-modal-header assignment-employee-header">
              <span>Asignar empleado</span>
            </div>
            <div className="agenda-modal-body">
              <div className="assignment-service-summary">
                <span className="assignment-service-chip">
                  <ActivityIcon service={assignmentRequest.service} size="small" />
                  <strong>{assignmentRequest.service?.name || 'Servicio'}</strong>
                </span>
                <span>{formatBookingRangeLabel(assignmentRequest.booking)}</span>
              </div>

              {isLoadingAssignmentEmployees ? (
                <div className="agenda-empty-state">Buscando empleados de este servicio...</div>
              ) : assignmentEmployees.length === 0 ? (
                <div className="agenda-empty-state">{assignmentEmptyReason || 'No hay empleados activos disponibles para esta solicitud.'}</div>
              ) : (
                <div className="assignment-employee-grid">
                  {assignmentEmployees.map((employee) => {
                    const statusLabel = assignmentRequest.hasClientConflict
                      ? 'Cliente con turno superpuesto'
                      : employee.assignmentHasConflict
                      ? 'Ocupado en este horario'
                      : employee.assignmentHasAvailability
                        ? 'Disponible'
                        : 'Sin disponibilidad configurada';

                    return (
                      <button
                        className={`assignment-employee-card ${employee.assignmentCanAssign ? '' : 'is-disabled'}`}
                        type="button"
                        key={employee.id}
                        onClick={() => assignEmployeeToRequest(employee)}
                        disabled={!employee.assignmentCanAssign || isLoadingAssignmentEmployees}
                      >
                        <span className="assignment-employee-avatar" aria-hidden="true">
                          {employee.photo_url ? <img src={employee.photo_url} alt="" /> : (employee.name || 'E').slice(0, 1).toUpperCase()}
                        </span>
                        <span className="assignment-employee-main">
                          <strong>{employee.name}</strong>
                          <small>{statusLabel}</small>
                        </span>
                        <span className="assignment-employee-action">Asignar</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="agenda-modal-actions assignment-employee-actions">
                <button className="agenda-option-button" type="button" onClick={closeAssignmentRequest}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selection && selectedService && pendingEmployee && (
        <CustomerModal
          employee={pendingEmployee}
          rangeLabel={selectedRangeLabel}
          selectedService={selectedService}
          onClose={close}
          onBack={() => setPendingEmployee(null)}
          onReserve={reserve}
        />
      )}

      {bookingToCancel && (
        <CancelBookingModal
          booking={bookingToCancel.booking}
          service={bookingToCancel.service}
          employee={bookingToCancel.employee}
          onClose={() => setBookingToCancel(null)}
          onConfirm={cancelBooking}
        />
      )}

      {bookingDetails && (
        <BookingDetailsModal
          booking={bookingDetails.booking}
          service={bookingDetails.service}
          employee={bookingDetails.employee}
          companyContext={companyContext}
          canEditCustomer={!isClientView && (!isEmployeeView || (empleadosPuedenReservar && isAssignedBooking(bookingDetails.booking))) && !isClosedBooking(bookingDetails.booking) && !isPastBookingStart(bookingDetails.booking)}
          canDownloadPdf={!isClientView && pdfDetalleTurnoHabilitado}
          onClose={() => setBookingDetails(null)}
          onSave={updateBookingCustomerDetails}
        />
      )}

      {closeAttentionOpen && (
        <CloseAttentionModal
          bookings={bookings}
          services={services}
          employees={employees}
          promotions={closurePromotions}
          discounts={closureDiscounts}
          surcharges={closureSurcharges}
          accessProfile={accessProfile}
          employeeId={employeeId}
          user={user}
          initialServiceDate={closeAttentionInitialDate}
          companyContext={companyContext}
          onClose={() => setCloseAttentionOpen(false)}
          onClosed={async () => {
            await loadAll();
            onBookingsChanged?.();
          }}
        />
      )}

    </div>
  );
}