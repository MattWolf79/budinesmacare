import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import BookingItem from './BookingItem';
import CancelBookingModal from './CancelBookingModal';
import CustomerModal from './CustomerModal';
import EmployeeModal from './EmployeeModal';
import ServiceModal from './ServiceModal';
import ActivityIcon from './ActivityIcon';

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

const isPendingAssignmentBooking = (booking) =>
  isActiveBooking(booking) && (!booking.employee_id || booking.status === 'pending_assignment');

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
  if (window.innerWidth <= 640) return 3;
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

export default function AgendaGrid({ user, refreshKey, accessProfile = 'admin', employeeId, onBookingsChanged }) {
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
  const [assignmentRequest, setAssignmentRequest] = useState(null);
  const [assignmentEmployees, setAssignmentEmployees] = useState([]);
  const [isLoadingAssignmentEmployees, setIsLoadingAssignmentEmployees] = useState(false);

  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [mobileRangeStart, setMobileRangeStart] = useState(null);
  const touchTapRef = useRef(null);
  const handledTouchTapRef = useRef(false);
  const isAdminView = accessProfile === 'admin';
  const isEmployeeView = accessProfile === 'employee';
  const isClientView = accessProfile === 'client';
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
    const adminDataRequest = isAdminView
      ? supabase.rpc('get_admin_panel_data', {
          account_id_value: user?.isInternal && user?.role === 'admin' ? user.id : null,
          session_token_value: user?.isInternal ? user.sessionToken : null,
          request_status_value: null
        })
      : Promise.resolve({ data: null, error: null });
    const internalEmployeeDataRequest = isEmployeeView && user?.isInternal
      ? supabase.rpc('get_internal_employee_workspace', {
          account_id_value: user.id,
          session_token_value: user.sessionToken
        })
      : Promise.resolve({ data: null, error: null });
    const usesInternalEmployeeData = isEmployeeView && user?.isInternal;

    return Promise.all([
      isAdminView || usesInternalEmployeeData ? Promise.resolve({ data: null, error: null }) : supabase.from('bookings').select('*'),
      isAdminView || usesInternalEmployeeData ? Promise.resolve({ data: null, error: null }) : supabase.from('services').select('*'),
      isAdminView || usesInternalEmployeeData ? Promise.resolve({ data: null, error: null }) : supabase.from('employees').select('*').is('deleted_at', null),
      usesInternalEmployeeData ? Promise.resolve({ data: null, error: null }) : supabase.from('employee_availability').select('*'),
      adminDataRequest,
      internalEmployeeDataRequest
    ]);
  };

  const applyAll = ([{ data: bk }, { data: srv }, { data: emp }, availabilityResult = {}, adminDataResult = {}, internalEmployeeDataResult = {}]) => {
    const adminData = adminDataResult.data || {};
    const internalEmployeeData = internalEmployeeDataResult.data || {};
    const usesInternalEmployeeData = isEmployeeView && user?.isInternal;

    setBookings(isAdminView ? adminData.bookings || [] : usesInternalEmployeeData ? internalEmployeeData.bookings || [] : bk || []);
    setServices(isAdminView ? adminData.services || [] : usesInternalEmployeeData ? internalEmployeeData.services || [] : srv || []);
    setEmployees(isAdminView ? adminData.employees || [] : usesInternalEmployeeData ? internalEmployeeData.employees || [] : emp || []);
    setEmployeeServices(isAdminView ? adminData.employeeServices || [] : usesInternalEmployeeData ? internalEmployeeData.employeeServices || [] : []);
    setEmployeeAvailability(usesInternalEmployeeData ? internalEmployeeData.agendaAvailability || internalEmployeeData.availability || [] : availabilityResult.data || []);
    setAvailabilityLoadFailed(Boolean(availabilityResult.error));
  };

  const loadAll = async () => {
    const results = await fetchAll();
    applyAll(results);
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

  const shouldLoadAvailableEmployees = Boolean(selectedService?.id && selection);

  useEffect(() => {
    if (!shouldLoadAvailableEmployees) return;

    let active = true;

    const load = async () => {
      setIsLoadingAvailableEmployees(true);
      const usesLoadedEmployeeData = isAdminView || (isEmployeeView && user?.isInternal);
      const rel = usesLoadedEmployeeData
        ? employeeServices.filter((relation) => Number(relation.service_id) === Number(selectedService.id))
        : (await supabase
            .from('employee_services')
            .select('employee_id')
            .eq('service_id', selectedService.id)).data;

      const ids = rel?.map(r => r.employee_id) || [];
      const filteredIds = ids;

      if (!filteredIds.length) {
        if (active) {
          setAvailableEmployees([]);
          setAvailableEmployeesMessage('No hay empleados vinculados a esta actividad.');
          setIsLoadingAvailableEmployees(false);
        }
        return;
      }

      const emp = usesLoadedEmployeeData
        ? employees.filter((employee) => filteredIds.some((id) => String(id) === String(employee.id)))
        : (await supabase
            .from('employees')
            .select('*')
            .is('deleted_at', null)
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
          setAvailableEmployeesMessage('No hay empleados vinculados a esta actividad.');
        } else if (!activeEmployees.length && inactiveCount > 0) {
          setAvailableEmployeesMessage('Los empleados vinculados a esta actividad estan inactivos. Activalos desde Empleados para asignar turnos.');
        } else if (!activeWithAvailability.length) {
          setAvailableEmployeesMessage('Los empleados activos de esta actividad no tienen disponibilidad para este horario.');
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
  }, [shouldLoadAvailableEmployees, selectedService, bookings, employeeAvailability, availabilityLoadFailed, offset, selectedRange, isEmployeeView, employeeId, isAdminView, user?.isInternal, employeeServices, employees]);

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
      session_token_value: user?.isInternal ? user.sessionToken : null
    });

    if (error) {
      alert('No se pudo cancelar el turno. Intentá nuevamente.');
      return;
    }

    setBookingToCancel(null);
    await loadAll();
    onBookingsChanged?.();
  };

  /* =========================
     RESERVE (UTC CORRECT)
  ========================= */

  const chooseEmployeeForReservation = (employee) => {
    if (isClientView) {
      reserveClientRequest();
      return;
    }

    setPendingEmployee(employee);
  };

  const reserveClientRequest = async () => {
    const range = selectedRange;

    if (!range || !selectedService?.id) return;

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
      alert('No hay disponibilidad para esa actividad en ese horario. Probá con otro horario.');
      return;
    }

    const { data: clientConflicts, error: clientConflictError } = await supabase
      .from('bookings')
      .select('id, user_id, user_email, status, start_at, end_at')
      .in('status', ['confirmed', 'reserved', 'pending_assignment'])
      .lt('start_at', range.end_at)
      .gt('end_at', range.start_at);

    if (clientConflictError) {
      alert('No se pudo validar tu disponibilidad. Intentá nuevamente.');
      return;
    }

    if (clientHasBookingConflict(clientConflicts || [], clientIdentity, range)) {
      alert('Ya tenés un turno o solicitud en ese horario. Una persona no puede tener dos reservas superpuestas.');
      await loadAll();
      return;
    }

    const { error } = await supabase.from('bookings').insert({
      user_id: user.id,
      user_email: customerEmail,
      customer_name: customerName || null,
      service: selectedService.id,
      employee_id: null,
      start_at: range.start_at,
      end_at: range.end_at,
      status: 'reserved'
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

    const shouldValidateWithRpc = user?.isInternal && (isAdminView || isEmployeeView);
    const { data: conflicts, error: conflictError } = shouldValidateWithRpc
      ? { data: [], error: null }
      : await supabase
          .from('bookings')
          .select('id, employee_id')
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
      const { data: availabilityRows, error: availabilityError } = await supabase
        .from('employee_availability')
        .select('*')
        .eq('employee_id', employee.id)
        .eq('available_date', availableDate)
        .eq('active', true);

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
      : await supabase
          .from('bookings')
          .select('id, user_id, user_email, status, start_at, end_at')
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

    const { error } = isAdminView
      ? await supabase.rpc('create_admin_booking', {
          service_id_value: selectedService.id,
          employee_id_value: employee.id,
          start_at_value: range.start_at,
          end_at_value: range.end_at,
          customer_name_value: customerName || null,
          customer_email_value: customerEmail || null,
          account_id_value: user?.isInternal && user?.role === 'admin' ? user.id : null,
          session_token_value: user?.isInternal ? user.sessionToken : null
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
          session_token_value: user.sessionToken
        })
      : await supabase.from('bookings').insert({
          user_id: isClientView ? user.id : null,
          user_email: customerEmail,
          customer_name: customerName || null,
          service: selectedService.id,
          employee_id: employee.id,
          start_at: range.start_at,
          end_at: range.end_at,
          status: 'confirmed'
        });

    if (error) {
      alert('No se pudo reservar ese horario. Es posible que ya exista una reserva superpuesta.');
      return;
    }

    close();
    await loadAll();
    onBookingsChanged?.();
  };

  const formatBookingRangeLabel = (booking) => {
    const range = buildRangeFromBooking(booking);
    return `${range.startLocal.toLocaleDateString('es-AR')} ${formatTime(range.startLocal)} - ${formatTime(range.endLocal)}`;
  };

  const openAssignmentRequest = async (booking) => {
    const service = services.find((item) => Number(item.id) === Number(booking.service));
    const range = buildRangeFromBooking(booking);

    setAssignmentRequest({ booking, service, range });
    setAssignmentEmployees([]);
    setIsLoadingAssignmentEmployees(true);

    const relResult = isAdminView
      ? { data: employeeServices.filter((relation) => Number(relation.service_id) === Number(booking.service)), error: null }
      : user?.isInternal && isEmployeeView
        ? { data: employeeServices.filter((relation) => Number(relation.service_id) === Number(booking.service)), error: null }
      : await supabase
          .from('employee_services')
          .select('employee_id')
          .eq('service_id', booking.service);

    const { data: rel, error: relError } = relResult;

    if (relError) {
      alert('No se pudieron consultar empleados para esa actividad.');
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
      : await supabase
          .from('employees')
          .select('*')
          .is('deleted_at', null)
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
          session_token_value: user?.isInternal ? user.sessionToken : null
        })
      : await supabase
          .from('bookings')
          .update({
            employee_id: employee.id,
            status: 'confirmed'
          })
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

      {isAdminView && pendingAssignmentBookings.length > 0 && (
        <section className="admin-pending-panel booking-assignment-panel">
          <div className="agenda-modal-header">Solicitudes pendientes de asignación</div>
          <div className="admin-pending-list">
            {pendingAssignmentBookings.map((booking) => {
              const service = services.find((item) => Number(item.id) === Number(booking.service));

              return (
                <article className="admin-record-card booking-assignment-card" key={booking.id} style={{ '--service-chip-color': service?.color || '#15b8c8' }}>
                  <div className="admin-record-main">
                    <span className="booking-assignment-service">
                      <ActivityIcon service={service} size="small" />
                      <strong>{service?.name || 'Actividad'}</strong>
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
      </div>

      {/* HEADER */}
      <div
        className="agenda-days-header"
        style={{ gridTemplateColumns: `${timeColumnWidth}px repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <div className="agenda-time-header-spacer" />
        {days.map((d, i) => (
          <div className="agenda-day-heading" key={i}>
            <span className="agenda-day-name">{d.toLocaleDateString('es-AR', { weekday: 'short' })}</span>
            <span className="agenda-day-date">{d.toLocaleDateString('es-AR')}</span>
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
            isActiveBooking(booking) && isBooked(booking, slotTime)
          );
        });
        const rowMaxBookings = Math.max(0, ...rowSlotBookings.map((slotBookings) => slotBookings.length));
        const emptySlotHeight = isCompactAgenda ? 36 : EMPTY_SLOT_HEIGHT;
        const bookedSlotPaddingHeight = isCompactAgenda ? 6 : BOOKED_SLOT_PADDING_HEIGHT;
        const bookingStackHeight = isCompactAgenda ? 28 : BOOKING_STACK_HEIGHT;
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
                      const emp = isClientView ? null : employees.find(e => e.id === b.employee_id);
                      const isOwn = isOwnBooking(b);
                      const isAssigned = isAssignedBooking(b);

                      return (
                        <BookingItem
                          key={b.id}
                          booking={b}
                          service={service}
                          employee={emp}
                          canCancel={canCancelBooking(b)}
                          canShowDetails={isAdminView || isOwn || (isEmployeeView && isAssigned)}
                          canViewCustomer={isAdminView || isOwn || (isEmployeeView && isAssigned)}
                          customerLabel={isOwn ? 'Tu turno' : 'Turno reservado'}
                          onCancel={() => setBookingToCancel({
                            booking: b,
                            service,
                            employee: emp
                          })}
                        />
                      );
                    })}
                  </div>

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
          services={services}
          rangeLabel={selectedRangeLabel}
          onClose={close}
          onSelectService={setSelectedService}
        />
      )}

      {/* MODAL EMPLEADOS */}
      {selection && selectedService && isClientView && (
        <div className="modal">
          <div className="agenda-modal-card client-request-modal" style={{ '--service-chip-color': selectedService?.color || '#15b8c8' }}>
            <div className="agenda-modal-header">Solicitar turno</div>
            <div className="agenda-modal-body">
              <div className="agenda-modal-summary client-request-service-chip">
                <span className="agenda-summary-title"><ActivityIcon service={selectedService} size="small" /> {selectedService.name}</span>
                <span className="client-request-time">{selectedRangeLabel}</span>
              </div>

              {isLoadingAvailableEmployees ? (
                <div className="agenda-empty-state">Validando disponibilidad...</div>
              ) : availableEmployees.length === 0 && !availabilityLoadFailed ? (
                <div className="agenda-empty-state">No hay disponibilidad para ese horario.</div>
              ) : (
                <div className="agenda-empty-state">El administrador asignará un empleado disponible para tu turno.</div>
              )}

              <div className="agenda-modal-actions client-request-actions">
                <button className="agenda-option-button" type="button" onClick={close}>Cerrar</button>
                <button className="agenda-close-button client-request-submit" type="button" onClick={reserveClientRequest} disabled={isLoadingAvailableEmployees || (availableEmployees.length === 0 && !availabilityLoadFailed)}>
                  Solicitar turno
                </button>
              </div>
            </div>
          </div>
        </div>
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
                  <strong>{assignmentRequest.service?.name || 'Actividad'}</strong>
                </span>
                <span>{formatBookingRangeLabel(assignmentRequest.booking)}</span>
              </div>

              {isLoadingAssignmentEmployees ? (
                <div className="agenda-empty-state">Buscando empleados de esta actividad...</div>
              ) : assignmentEmployees.length === 0 ? (
                <div className="agenda-empty-state">No hay empleados activos vinculados a esta actividad.</div>
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

    </div>
  );
}