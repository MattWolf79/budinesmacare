import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import BookingItem from './BookingItem';
import CancelBookingModal from './CancelBookingModal';
import CustomerModal from './CustomerModal';
import EmployeeModal from './EmployeeModal';
import ServiceModal from './ServiceModal';
import ActivityIcon from './ActivityIcon';
import { formatDisplayDate } from '../utils/dateFormat';

const SLOT_MINUTES = 30;
const START_HOUR = 8;
const SLOTS = 30;
const EMPTY_SLOT_HEIGHT = 30;
const BOOKED_SLOT_PADDING_HEIGHT = 5;
const BOOKING_STACK_HEIGHT = 24;
const ACTIVE_BOOKING_STATUSES = new Set(['confirmed', 'reserved', 'pending_assignment']);
const TOUCH_TAP_MOVE_TOLERANCE = 8;

/* =========================
   TIME (FIX DEFINITIVO)
========================= */

// 👉 genera hora LOCAL real (sin drift)
const buildSlotDate = (day, slotIndex) => {
  const d = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    START_HOUR,
    0,
    0,
    0
  );

  d.setMinutes(d.getMinutes() + slotIndex * SLOT_MINUTES);
  return d;
};

const formatTime = (date) =>
  `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

const formatDuration = (startSlot, endSlot) => {
  const totalMinutes = (endSlot - startSlot + 1) * SLOT_MINUTES;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) return `${minutes} min`;
  if (!minutes) return `${hours} h`;
  return `${hours} h ${minutes} min`;
};

const rangesOverlap = (startA, endA, startB, endB) =>
  startA < endB && endA > startB;

const isActiveBooking = (booking) =>
  ACTIVE_BOOKING_STATUSES.has(String(booking.status || '').trim().toLowerCase());

const isClosedBooking = (booking) =>
  ['completed', 'closed'].includes(String(booking?.status || '').trim().toLowerCase());

const isVisibleGridBooking = (booking) =>
  isActiveBooking(booking) || isClosedBooking(booking);

const isPendingAssignmentBooking = (booking) =>
  isActiveBooking(booking) && (!booking.employee_id || booking.status === 'pending_assignment');

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

const getClientKey = (booking) => {
  const email = String(booking.user_email || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  return `name:${String(booking.customer_name || 'Cliente sin datos').trim().toLowerCase()}`;
};

const getClientName = (booking) => booking.customer_name || booking.user_email || 'Cliente sin datos';

const getClientEmail = (booking) => booking.user_email || '';

const buildReservationRange = (day, startSlot, endSlot) => {
  const startLocal = buildSlotDate(day, startSlot);
  const endLocal = buildSlotDate(day, endSlot + 1);

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

const clientHasBookingConflict = (bookings, client, range) => {
  if (!range) return false;

  const clientUserId = client?.userId ? String(client.userId) : '';
  const clientEmail = normalizeBookingEmail(client?.email);
  const newStart = range.startLocal.getTime();
  const newEnd = range.endLocal.getTime();

  if (!clientUserId && !clientEmail) return false;

  return bookings.some((booking) => {
    if (!isActiveBooking(booking)) return false;

    const matchesUser = clientUserId && String(booking.user_id || '') === clientUserId;
    const matchesEmail = clientEmail && normalizeBookingEmail(booking.user_email) === clientEmail;

    if (!matchesUser && !matchesEmail) return false;

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

const employeeHasAvailability = (availability, employeeId, range, skipAvailabilityCheck = false) => {
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

/* =========================
   COMPONENT
========================= */

function CloseAttentionModal({ bookings, services, employees, promotions, discounts, accessProfile, employeeId, user, onClose, onClosed }) {
  const todayInput = formatDateOnlyForDb(new Date());
  const [serviceDate, setServiceDate] = useState(todayInput);
  const [serviceDateInput, setServiceDateInput] = useState(formatDateInputForDisplay(todayInput));
  const [selectedClientKey, setSelectedClientKey] = useState('');
  const [selectedBookingIds, setSelectedBookingIds] = useState(null);
  const [lineDiscounts, setLineDiscounts] = useState({});
  const [totalDiscountIds, setTotalDiscountIds] = useState([]);
  const [payments, setPayments] = useState({ cash: '', transfer: '', card: '' });
  const [isClosing, setIsClosing] = useState(false);
  const isEmployeeView = accessProfile === 'employee';
  const activeDiscounts = useMemo(() => (discounts || []).filter((discount) => discount?.enabled !== false && discount?.name && getDiscountValue(discount) > 0), [discounts]);
  const lineDiscountOptions = activeDiscounts.filter((discount) => discount.discountType !== 'activity' && (discount.scope === 'line' || discount.scope === 'both'));
  const activityDiscountOptions = activeDiscounts.filter((discount) => discount.discountType === 'activity');
  const totalDiscountOptions = activeDiscounts.filter((discount) => discount.discountType !== 'activity' && (discount.scope === 'total' || discount.scope === 'both'));
  const dayBookings = useMemo(() => bookings
    .filter((booking) => isActiveBooking(booking))
    .filter((booking) => formatDateOnlyForDb(parseBookingDate(booking.start_at)) === serviceDate)
    .sort((left, right) => parseBookingDate(left.start_at) - parseBookingDate(right.start_at)), [bookings, serviceDate]);
  const clients = useMemo(() => {
    const map = new Map();
    dayBookings.forEach((booking) => {
      const key = getClientKey(booking);
      const current = map.get(key) || { key, name: getClientName(booking), email: getClientEmail(booking), canEmployeeClose: false };
      if (String(booking.employee_id) === String(employeeId)) current.canEmployeeClose = true;
      map.set(key, current);
    });
    return [...map.values()].filter((client) => !isEmployeeView || client.canEmployeeClose);
  }, [dayBookings, employeeId, isEmployeeView]);

  const effectiveSelectedClientKey = clients.some((client) => client.key === selectedClientKey) ? selectedClientKey : clients[0]?.key || '';
  const clientBookings = useMemo(() => dayBookings.filter((booking) => getClientKey(booking) === effectiveSelectedClientKey), [dayBookings, effectiveSelectedClientKey]);
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
  const cashPaymentAmount = parseMoney(payments.cash);
  const totalDiscountTotal = Math.min(subtotal, selectedTotalDiscounts.reduce((total, discount) => {
    const discountBaseAmount = isCashPaymentDiscount(discount) ? cashPaymentAmount : subtotal;
    return total + getDiscountAmount(discount, discountBaseAmount);
  }, 0));
  const finalTotal = Math.max(0, subtotal - totalDiscountTotal);
  const totalSavings = Math.max(0, grossTotal - finalTotal);
  const paidTotal = cashPaymentAmount + parseMoney(payments.transfer) + parseMoney(payments.card);
  const paymentDifference = Math.round((paidTotal - finalTotal) * 100) / 100;

  const toggleLineDiscount = (bookingId, discountKey) => {
    setLineDiscounts((current) => {
      const currentDiscounts = current[bookingId] || [];
      return { ...current, [bookingId]: currentDiscounts.includes(discountKey) ? currentDiscounts.filter((key) => key !== discountKey) : [...currentDiscounts, discountKey] };
    });
  };

  const updateServiceDateInput = (value) => {
    setServiceDateInput(value);
    const parsedDate = parseDisplayDateInput(value);

    if (!parsedDate || parsedDate > todayInput) return;

    setServiceDate(parsedDate);
    setSelectedClientKey('');
    setSelectedBookingIds(null);
    setLineDiscounts({});
    setTotalDiscountIds([]);
    setPayments({ cash: '', transfer: '', card: '' });
  };

  const confirmClosure = async () => {
    if (!selectedItems.length) return alert('Seleccioná al menos un turno para cerrar.');
    if (Math.abs(paymentDifference) > 0.01) return alert('La suma de pagos debe coincidir con el total final.');
    setIsClosing(true);
    const selectedClient = clients.find((client) => client.key === effectiveSelectedClientKey);
    const { error } = await supabase.rpc('close_booking_attention', {
      service_date_value: serviceDate,
      client_name_value: selectedClient?.name || null,
      client_email_value: selectedClient?.email || null,
      booking_ids_value: selectedItems.map((item) => item.booking.id),
      closure_items_value: selectedItems.map((item) => ({ bookingId: item.booking.id, serviceName: item.serviceName, employeeId: item.employee?.id || item.booking.employee_id || null, employeeName: item.employeeName, basePrice: item.basePrice, lineDiscountTotal: item.lineDiscountTotal, subtotal: item.subtotal, appliedDiscounts: item.appliedDiscounts })),
      total_discounts_value: selectedTotalDiscounts,
      gross_total_value: grossTotal,
      line_discount_total_value: lineDiscountTotal,
      total_discount_total_value: totalDiscountTotal,
      final_total_value: finalTotal,
      cash_amount_value: parseMoney(payments.cash),
      transfer_amount_value: parseMoney(payments.transfer),
      card_amount_value: parseMoney(payments.card),
      account_id_value: user?.isInternal ? user.id : null,
      session_token_value: user?.isInternal ? user.sessionToken : null
    });
    setIsClosing(false);
    if (error) return alert(`No se pudo cerrar la atención: ${error.message}`);
    alert('Atención cerrada.');
    onClosed?.();
  };

  return (
    <div className="modal">
      <div className="agenda-modal-card close-attention-modal">
        <div className="agenda-modal-header">Cerrar atención</div>
        <div className="agenda-modal-body close-attention-body">
          <div className="close-attention-controls">
            <label>Fecha<input type="text" inputMode="numeric" value={serviceDateInput} onChange={(event) => updateServiceDateInput(event.target.value)} placeholder="DD/MM/AAAA" /></label>
            <label>Cliente<select value={effectiveSelectedClientKey} onChange={(event) => { setSelectedClientKey(event.target.value); setSelectedBookingIds(null); setLineDiscounts({}); setTotalDiscountIds([]); setPayments({ cash: '', transfer: '', card: '' }); }}>{clients.length ? clients.map((client) => <option key={client.key} value={client.key}>{client.name}{client.email ? ` · ${client.email}` : ''}</option>) : <option value="">Sin clientes para cerrar</option>}</select></label>
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
                <label className="settings-check-row close-attention-item-check"><input type="checkbox" checked={isSelected} onChange={() => setSelectedBookingIds((current) => { const currentIds = Array.isArray(current) ? current : clientBookings.map((itemBooking) => itemBooking.id); return currentIds.includes(booking.id) ? currentIds.filter((id) => id !== booking.id) : [...currentIds, booking.id]; })} /><span>{getBookingActivityLabel(booking, service)}</span></label>
                <div className="close-attention-item-meta">{formatTime(parseBookingDate(booking.start_at))} - {formatTime(parseBookingDate(booking.end_at))} · {formatPersonShortName(employee)}</div>
                <div className="close-attention-price-row"><span>Base: {formatMoney(item?.basePrice ?? bookingPriceById.get(booking.id) ?? 0)}</span><strong>Subtotal: {formatMoney(item?.subtotal || 0)}</strong></div>
                {isSelected && availableLineDiscounts.length > 0 && <div className="close-attention-discounts">{availableLineDiscounts.map((discount) => {
                  const discountKey = getDiscountKey(discount);
                  return <label className="settings-check-row" key={`${booking.id}-${discountKey}`}><input type="checkbox" checked={(lineDiscounts[booking.id] || []).includes(discountKey)} onChange={() => toggleLineDiscount(booking.id, discountKey)} /><span>{formatDiscountOption(discount)}</span></label>;
                })}</div>}
              </article>;
            }) : <div className="agenda-empty-state">No hay turnos pendientes de cierre.</div>}
          </div>
          {totalDiscountOptions.length > 0 && <div className="close-attention-section"><strong>Descuentos sobre total</strong><div className="close-attention-discounts">{totalDiscountOptions.map((discount) => {
            const discountKey = getDiscountKey(discount);
            return <label className="settings-check-row" key={discountKey}><input type="checkbox" checked={totalDiscountIds.includes(discountKey)} onChange={() => setTotalDiscountIds((current) => current.includes(discountKey) ? current.filter((key) => key !== discountKey) : [...current, discountKey])} /><span>{formatDiscountOption(discount)}</span></label>;
          })}</div></div>}
          <div className="close-attention-section close-attention-payments"><label>Efectivo<input type="text" inputMode="decimal" value={payments.cash} onChange={(event) => setPayments((current) => ({ ...current, cash: event.target.value }))} placeholder="0" /></label><label>Transferencia<input type="text" inputMode="decimal" value={payments.transfer} onChange={(event) => setPayments((current) => ({ ...current, transfer: event.target.value }))} placeholder="0" /></label><label>Tarjeta<input type="text" inputMode="decimal" value={payments.card} onChange={(event) => setPayments((current) => ({ ...current, card: event.target.value }))} placeholder="0" /></label></div>
          <div className="close-attention-total">
            <span>Bruto: {formatMoney(grossTotal)}</span>
            <span>Desc. servicios: -{formatMoney(lineDiscountTotal)}</span>
            <span>Desc. total: -{formatMoney(totalDiscountTotal)}</span>
            <span>Ahorro: {formatMoney(totalSavings)}</span>
            <strong>Total final: {formatMoney(finalTotal)}</strong>
            <span>Pagado: {formatMoney(paidTotal)}</span>
            {Math.abs(paymentDifference) > 0.01 && <span className="close-attention-difference">Diferencia: {formatMoney(Math.abs(paymentDifference))} {paymentDifference > 0 ? 'de más' : 'pendiente'}</span>}
          </div>
          <div className="agenda-modal-actions"><button className="agenda-close-button" type="button" onClick={onClose}>Cerrar</button><button className="agenda-danger-button" type="button" onClick={confirmClosure} disabled={isClosing || !selectedItems.length}>{isClosing ? 'Cerrando...' : 'Confirmar cierre'}</button></div>
        </div>
      </div>
    </div>
  );
}

function BookingDetailsModal({ booking, service, employee, canEditCustomer, onClose, onSave }) {
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
  const customerName = booking.customer_name || 'Cliente sin datos';
  const customerEmail = booking.user_email || 'Sin mail cargado';

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
                {canEditCustomer && <button className="agenda-close-button" type="button" onClick={() => setIsEditing(true)}>Editar datos</button>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AgendaGrid({ user, refreshKey, accessProfile = 'admin', employeeId, onBookingsChanged, clientCanChooseEmployee = false, selectedPromotion = null, promotions = [], adminProfileSummary = null, companySlug, companyContext }) {
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeServices, setEmployeeServices] = useState([]);
  const [employeeAvailability, setEmployeeAvailability] = useState([]);
  const [availabilityLoadFailed, setAvailabilityLoadFailed] = useState(false);

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
  const [isLoadingAssignmentEmployees, setIsLoadingAssignmentEmployees] = useState(false);
  const [closeAttentionOpen, setCloseAttentionOpen] = useState(false);
  const [closureDiscounts, setClosureDiscounts] = useState([]);
  const [closurePromotions, setClosurePromotions] = useState(promotions);

  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [mobileRangeStart, setMobileRangeStart] = useState(null);
  const touchTapRef = useRef(null);
  const handledTouchTapRef = useRef(false);
  const isAdminView = accessProfile === 'admin';
  const isEmployeeView = accessProfile === 'employee';
  const isClientView = accessProfile === 'client';
  const applyCompanyFilter = (query) => companyContext?.id ? query.eq('company_id', companyContext.id) : query;
  const canGoBack = !isClientView || offset > 0;
  const isCompactAgenda = visibleDayCount <= 3;
  const timeColumnWidth = isCompactAgenda ? 46 : 64;

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
    return buildReservationRange(days[selection.day], selection.start, selection.end);
  }, [selection, days]);

  const selectedRangeLabel = selection && selectedRange
    ? `${formatTime(selectedRange.startLocal)} - ${formatTime(selectedRange.endLocal)} (${formatDuration(selection.start, selection.end)})`
    : '';
  const promotionServices = useMemo(() => {
    const source = selectedPromotion ? [selectedPromotion] : promotions;

    return source
      .filter((promotion) => promotion?.enabled !== false)
      .map((promotion, index) => ({
        id: null,
        promotionKey: `promotion-${index}-${promotion.title || 'promo'}`,
        isPromotion: true,
        promotion,
        name: promotion.title || 'Promoción',
        icon: '✨',
        color: '#3fc9d5',
        active: true
      }));
  }, [promotions, selectedPromotion]);
  const bookingPromotion = selectedService?.promotion || selectedPromotion;
  const bookingDescription = bookingPromotion
    ? [bookingPromotion.title, bookingPromotion.description, bookingPromotion.value].filter(Boolean).join(' · ')
    : '';
  const reservationOptions = selectedPromotion ? promotionServices : [...services, ...promotionServices];
  const pendingAssignmentBookings = useMemo(() => bookings
    .filter(isPendingAssignmentBooking)
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
        }, error: null }
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
    const usesInternalEmployeeData = isEmployeeView && user?.isInternal;

    return Promise.all([
      isAdminView || usesInternalEmployeeData ? Promise.resolve({ data: null, error: null }) : applyCompanyFilter(supabase.from('bookings').select('*')),
      isAdminView || usesInternalEmployeeData || isClientView ? Promise.resolve({ data: null, error: null }) : applyCompanyFilter(supabase.from('services').select('*')),
      isAdminView || usesInternalEmployeeData || isClientView ? Promise.resolve({ data: null, error: null }) : applyCompanyFilter(supabase.from('employees').select('*').is('deleted_at', null)),
      usesInternalEmployeeData || isClientView ? Promise.resolve({ data: null, error: null }) : applyCompanyFilter(supabase.from('employee_availability').select('*')),
      adminDataRequest,
      internalEmployeeDataRequest,
      bookingOptionsRequest
    ]);
  };

  const applyAll = ([{ data: bk }, { data: srv }, { data: emp }, availabilityResult = {}, adminDataResult = {}, internalEmployeeDataResult = {}, bookingOptionsResult = {}]) => {
    const adminData = adminDataResult.data || {};
    const internalEmployeeData = internalEmployeeDataResult.data || {};
    const bookingOptions = bookingOptionsResult.data || {};
    const usesInternalEmployeeData = isEmployeeView && user?.isInternal;
    const fallbackServices = bookingOptions.services || [];
    const fallbackEmployees = bookingOptions.employees || [];
    const fallbackEmployeeServices = bookingOptions.employeeServices || [];
    const fallbackAvailability = bookingOptions.employeeAvailability || [];

    setBookings(isAdminView ? adminData.bookings || [] : usesInternalEmployeeData ? internalEmployeeData.bookings || [] : bk || []);
    setServices(isAdminView ? adminData.services || fallbackServices : usesInternalEmployeeData ? fallbackServices.length ? fallbackServices : internalEmployeeData.services || [] : isClientView ? fallbackServices : srv || []);
    setEmployees(isAdminView ? adminData.employees || fallbackEmployees : usesInternalEmployeeData ? fallbackEmployees.length ? fallbackEmployees : internalEmployeeData.employees || [] : isClientView ? fallbackEmployees : emp || []);
    setEmployeeServices(isAdminView ? adminData.employeeServices || fallbackEmployeeServices : usesInternalEmployeeData ? fallbackEmployeeServices.length ? fallbackEmployeeServices : internalEmployeeData.employeeServices || [] : isClientView ? fallbackEmployeeServices : []);
    setEmployeeAvailability(usesInternalEmployeeData ? internalEmployeeData.agendaAvailability || internalEmployeeData.availability || fallbackAvailability : isClientView || isAdminView ? fallbackAvailability : availabilityResult.data || []);
    setAvailabilityLoadFailed(isClientView || isAdminView || usesInternalEmployeeData ? Boolean(bookingOptionsResult.error) : Boolean(availabilityResult.error));
  };

  const loadAll = async () => {
    const results = await fetchAll();
    applyAll(results);
  };

  const openCloseAttention = async () => {
    const { data } = await supabase.rpc('get_app_configuration', {
      company_slug_value: companySlug
    });
    setClosureDiscounts(Array.isArray(data?.discounts) ? data.discounts : []);
    setClosurePromotions(Array.isArray(data?.promotions) ? data.promotions : promotions);
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
          setAvailableEmployeesMessage('No hay empleados vinculados a este servicio.');
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
        employeeHasAvailability(employeeAvailability, employee.id, selectedRange, availabilityLoadFailed) &&
        !employeeHasBookingConflict(bookings, employee.id, selectedRange)
      );

      const inactiveCount = serviceEmployees.length - activeEmployees.length;
      const activeWithAvailability = activeEmployees.filter((employee) =>
        employeeHasAvailability(employeeAvailability, employee.id, selectedRange, availabilityLoadFailed)
      );
      const conflictCount = activeWithAvailability.filter((employee) =>
        employeeHasBookingConflict(bookings, employee.id, selectedRange)
      ).length;

      if (!available.length) {
        if (!serviceEmployees.length) {
          setAvailableEmployeesMessage('No hay empleados vinculados a este servicio.');
        } else if (!activeEmployees.length && inactiveCount > 0) {
          setAvailableEmployeesMessage('Los empleados vinculados a este servicio estan inactivos. Activalos desde Empleados para asignar turnos.');
        } else if (!activeWithAvailability.length) {
          setAvailableEmployeesMessage('Los empleados activos de este servicio no tienen disponibilidad para este horario.');
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
  }, [shouldLoadAvailableEmployees, selectedService, bookings, employeeAvailability, availabilityLoadFailed, offset, selectedRange, isEmployeeView, isClientView, employeeId, isAdminView, user?.isInternal, employeeServices, employees]);

  /* =========================
     SELECTION
  ========================= */

  const start = (d, s) => {
    if (isPastDay(days[d])) return;

    setDragStart({ d, s });
    setDragEnd({ d, s });
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

  const isOwnBooking = (booking) => String(booking.user_id) === String(user?.id);
  const isAssignedBooking = (booking) => String(booking.employee_id) === String(employeeId);

  const canCancelBooking = (booking) =>
    !isClosedBooking(booking) &&
    !isPastDay(parseBookingDate(booking.start_at)) &&
    (isAdminView || isOwnBooking(booking) || (isEmployeeView && isAssignedBooking(booking)));

  const cancelBooking = async (booking) => {
    if (isPastDay(parseBookingDate(booking.start_at))) {
      setBookingToCancel(null);
      alert('No se pueden cancelar turnos de días pasados.');
      return;
    }

    if (!isAdminView && !isOwnBooking(booking) && !(isEmployeeView && isAssignedBooking(booking))) {
      setBookingToCancel(null);
      alert(isEmployeeView ? 'Solo podés cancelar turnos asignados a tu empleado.' : 'Solo podés cancelar turnos propios.');
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

  const reserveClientRequest = async () => {
    const range = selectedRange;

    if (!range || (!selectedService?.id && !selectedService?.isPromotion)) return;

    const customerName = user?.displayName || user?.email || '';
    const customerEmail = user?.email || '';
    const clientIdentity = {
      userId: user?.id,
      email: customerEmail
    };

    if (clientHasBookingConflict(bookings, clientIdentity, range)) {
      alert('Ya tenés un turno o solicitud en ese horario. Una persona no puede tener dos reservas superpuestas.');
      return;
    }

    if (!availabilityLoadFailed && !availableEmployees.length) {
      alert('No hay disponibilidad para ese servicio en ese horario. Probá con otro horario.');
      return;
    }

    const { error } = await supabase.rpc('request_client_booking', {
      service_id_value: selectedService.id || null,
      employee_id_value: null,
      booking_description_value: bookingDescription || null,
      start_at_value: range.start_at,
      end_at_value: range.end_at,
      customer_name_value: customerName || null,
      customer_email_value: customerEmail || null,
      company_slug_value: companySlug
    });

    if (error) {
      alert(`No se pudo solicitar el turno: ${error.message}`);
      return;
    }

    alert('Solicitud enviada. El administrador asignará un empleado y confirmará el turno.');
    close();
    await loadAll();
    onBookingsChanged?.();
  };

  const reserve = async (employee, customer = null) => {
    const range = selectedRange;

    if (!range) return;

    const customerName = customer?.name?.trim() || user?.displayName || user?.email || '';
    const customerEmail = customer?.email?.trim() || user?.email || '';
    const clientIdentity = {
      userId: isClientView ? user?.id : null,
      email: customerEmail
    };

    if (clientHasBookingConflict(bookings, clientIdentity, range)) {
      alert('Ese cliente ya tiene un turno en ese horario. Una persona no puede tener dos reservas superpuestas.');
      return;
    }

    if (employeeHasBookingConflict(bookings, employee.id, range)) {
      alert(`${employee.name} ya tiene un turno en ese horario`);
      return;
    }

    if (!employeeHasAvailability(employeeAvailability, employee.id, range, availabilityLoadFailed)) {
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

    const { error } = isClientView
      ? await supabase.rpc('request_client_booking', {
          service_id_value: selectedService.id || null,
          employee_id_value: employee.id,
          booking_description_value: bookingDescription || null,
          start_at_value: range.start_at,
          end_at_value: range.end_at,
          customer_name_value: customerName || null,
          customer_email_value: customerEmail || null,
          company_slug_value: companySlug
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
    const service = isPromotionBooking
      ? {
          id: null,
          isPromotion: true,
          name: booking.booking_description,
          icon: '✨',
          color: '#67e8f9',
          active: true
        }
      : services.find((item) => Number(item.id) === Number(booking.service));
    const range = buildRangeFromBooking(booking);

    setAssignmentRequest({ booking, service, range });
    setAssignmentEmployees([]);
    setIsLoadingAssignmentEmployees(true);

    const relResult = isPromotionBooking
      ? { data: employees.map((employee) => ({ employee_id: employee.id })), error: null }
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

    const assignmentOptions = (emp || [])
      .filter((employee) => employee.active !== false)
      .map((employee) => {
        const hasAvailability = employeeHasAvailability(employeeAvailability, employee.id, range, availabilityLoadFailed);
        const hasConflict = employeeHasBookingConflict(bookings, employee.id, range);

        return {
          ...employee,
          assignmentHasAvailability: hasAvailability,
          assignmentHasConflict: hasConflict,
          assignmentCanAssign: !hasConflict && (availabilityLoadFailed || hasAvailability)
        };
      })
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'es'));

    setAssignmentEmployees(assignmentOptions);
    setIsLoadingAssignmentEmployees(false);
  };

  const closeAssignmentRequest = () => {
    setAssignmentRequest(null);
    setAssignmentEmployees([]);
    setIsLoadingAssignmentEmployees(false);
  };

  const assignEmployeeToRequest = async (employee) => {
    if (!assignmentRequest?.booking?.id) return;

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
      alert(`No se pudo asignar el empleado: ${error.message}`);
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
      className="agenda-grid"
      onPointerMove={movePointerSelection}
      onPointerUp={finishPointerSelection}
      onPointerCancel={cancelPointerSelection}
      style={{ userSelect: 'none' }}
    >

      {isAdminView && adminProfileSummary && (
        <section className="admin-page-heading agenda-page-heading">
          <div>
            <h1>Agenda</h1>
            <p>Gestioná turnos, solicitudes pendientes y cierres de atención.</p>
          </div>
          {adminProfileSummary}
        </section>
      )}

      {isAdminView && pendingAssignmentBookings.length > 0 && (
        <section className="admin-pending-panel booking-assignment-panel">
          <div className="agenda-modal-header">Solicitudes pendientes de asignación</div>
          <div className="admin-pending-list">
            {pendingAssignmentBookings.map((booking) => {
              const service = services.find((item) => Number(item.id) === Number(booking.service));
              const assignmentLabel = `${getBookingActivityLabel(booking, service)} / Pendiente`;

              return (
                <article className="admin-record-card booking-assignment-card" key={booking.id} style={{ '--service-chip-color': service?.color || '#15b8c8' }}>
                  <div className="admin-record-main">
                    <span className="booking-assignment-service">
                      <ActivityIcon service={service} size="small" />
                      <strong>{assignmentLabel}</strong>
                    </span>
                    <span className="admin-record-meta booking-assignment-meta">{booking.customer_name || booking.user_email || 'Cliente'} · {formatBookingRangeLabel(booking)}</span>
                  </div>
                  <div className="admin-record-actions">
                    <button className="agenda-close-button" type="button" onClick={() => openAssignmentRequest(booking)}>
                      Asignar empleado
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
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
        {!isClientView && (
          <button className="agenda-close-attention-button" type="button" onClick={openCloseAttention}>
            Cerrar atención
          </button>
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
      {[...Array(SLOTS)].map((_, slotIndex) => {
        const label = buildSlotDate(days[0], slotIndex);
        const rowSlotBookings = days.map((day) => {
          const slotTime = buildSlotDate(day, slotIndex);

          return bookings.filter((booking) =>
            isVisibleGridBooking(booking) && isBooked(booking, slotTime)
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

              const isSelected = !isDisabled && activeSelection?.day === dayIndex &&
                slotIndex >= activeSelection.start &&
                slotIndex <= activeSelection.end;

              return (
                <div
                  className="agenda-slot-cell"
                  key={dayIndex}
                  data-agenda-cell="true"
                  data-day-index={dayIndex}
                  data-slot-index={slotIndex}
                  onPointerDown={(event) => startPointerSelection(event, dayIndex, slotIndex)}
                  onPointerUp={finishCellPointerSelection}
                  onLostPointerCapture={finishCellPointerSelection}
                  onPointerEnter={() => move(dayIndex, slotIndex)}
                  onClick={() => {
                    if (handledTouchTapRef.current) {
                      handledTouchTapRef.current = false;
                      return;
                    }

                    if (isCompactAgenda) selectMobileRangePoint(dayIndex, slotIndex);
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
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    opacity: isDisabled ? 0.55 : 1
                  }}
                >
                  <div style={{ flex: '1 1 auto' }}>
                    {slotBookings.map(b => {
                      const service = services.find(s => Number(s.id) === Number(b.service));
                      const emp = employees.find(e => e.id === b.employee_id);
                      const employeeLabel = formatPersonShortName(emp);
                      const isOwn = isOwnBooking(b);
                      const isAssigned = isAssignedBooking(b);
                      const isClosed = isClosedBooking(b);
                      const displayLabel = `${getBookingActivityLabel(b, service)} / ${employeeLabel}`;

                      return (
                        <BookingItem
                          key={b.id}
                          booking={b}
                          service={service}
                          employee={emp}
                          canCancel={canCancelBooking(b)}
                          isClosed={isClosed}
                          canShowDetails={isAdminView || isOwn || isEmployeeView}
                          canViewCustomer={isAdminView || isOwn || isEmployeeView}
                          customerLabel={isOwn ? 'Tu turno' : 'Turno reservado'}
                          displayLabel={displayLabel}
                          employeeLabel={employeeLabel}
                          compact={isCompactAgenda}
                          onOpenDetails={() => {
                            if (isAdminView || isOwn || isEmployeeView) {
                              setBookingDetails({ booking: b, service, employee: emp });
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

                  {isCompactAgenda && slotBookings.length > 0 && !isDisabled && (
                    <div className="agenda-slot-add-actions">
                      <button
                        className="agenda-slot-add-overlap"
                        type="button"
                        aria-label="Agregar turno en este horario"
                        title="Agregar turno en este horario"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectMobileRangePoint(dayIndex, slotIndex);
                        }}
                      >
                        + turno
                      </button>
                    </div>
                  )}

                  <div
                    aria-hidden="true"
                    style={{
                      flex: slotBookings.length ? '0 0 4px' : '1 1 auto',
                      borderTop: slotBookings.length ? '1px dashed rgba(15, 62, 168, 0.16)' : 'none'
                    }}
                  />
                </div>
              );
            })}
          </div>
        );
      })}

      {/* MODAL SERVICIOS */}
      {selection && !selectedService && (
        <ServiceModal
          services={reservationOptions}
          rangeLabel={selectedRangeLabel}
          onClose={close}
          onSelectService={setSelectedService}
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
                {bookingDescription && <span className="client-request-promotion">{bookingDescription}</span>}
              </div>

              {isLoadingAvailableEmployees ? (
                <div className="agenda-empty-state">Validando disponibilidad...</div>
              ) : !selectedService?.isPromotion && availableEmployees.length === 0 && !availabilityLoadFailed ? (
                <div className="agenda-empty-state">No hay disponibilidad para ese horario.</div>
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
          summaryExtra={bookingDescription}
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
                <div className="agenda-empty-state">No hay empleados activos disponibles para esta solicitud.</div>
              ) : (
                <div className="assignment-employee-grid">
                  {assignmentEmployees.map((employee) => {
                    const statusLabel = employee.assignmentHasConflict
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
          canEditCustomer={!isClientView && !isClosedBooking(bookingDetails.booking)}
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
          accessProfile={accessProfile}
          employeeId={employeeId}
          user={user}
          onClose={() => setCloseAttentionOpen(false)}
          onClosed={async () => {
            setCloseAttentionOpen(false);
            await loadAll();
            onBookingsChanged?.();
          }}
        />
      )}

    </div>
  );
}