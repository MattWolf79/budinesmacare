import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import BookingItem from './BookingItem';
import CancelBookingModal from './CancelBookingModal';
import CustomerModal from './CustomerModal';
import EmployeeModal from './EmployeeModal';
import ServiceModal from './ServiceModal';

const SLOT_MINUTES = 30;
const START_HOUR = 8;
const SLOTS = 30;
const EMPTY_SLOT_HEIGHT = 42;
const BOOKED_SLOT_PADDING_HEIGHT = 8;
const BOOKING_STACK_HEIGHT = 32;
const ACTIVE_BOOKING_STATUSES = new Set(['confirmed', 'reserved']);

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

const employeeHasBlockConflict = (blocks, employeeId, range) => {
  if (!range) return false;

  const newStart = range.startLocal.getTime();
  const newEnd = range.endLocal.getTime();

  return blocks.some((block) => {
    if (String(block.employee_id) !== String(employeeId)) return false;

    return rangesOverlap(
      parseBookingDate(block.start_at).getTime(),
      parseBookingDate(block.end_at).getTime(),
      newStart,
      newEnd
    );
  });
};

/* =========================
   WEEK
========================= */

const getVisibleDayCount = () => {
  if (typeof window === 'undefined') return 7;
  if (window.innerWidth <= 640) return 3;
  if (window.innerWidth <= 900) return 5;
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
  const [employeeBlocks, setEmployeeBlocks] = useState([]);

  const [offset, setOffset] = useState(0);
  const [visibleDayCount, setVisibleDayCount] = useState(getVisibleDayCount);
  const days = useMemo(() => getWeekDays(offset, visibleDayCount), [offset, visibleDayCount]);
  const canGoBack = offset > 0;

  const [selection, setSelection] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [availableEmployees, setAvailableEmployees] = useState([]);
  const [pendingEmployee, setPendingEmployee] = useState(null);
  const [bookingToCancel, setBookingToCancel] = useState(null);

  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const isAdminView = accessProfile === 'admin';
  const isEmployeeView = accessProfile === 'employee';
  const isClientView = accessProfile === 'client';
  const isCompactAgenda = visibleDayCount <= 3;
  const timeColumnWidth = isCompactAgenda ? 56 : 80;

  const activeSelection = dragStart && dragEnd
    ? {
        day: dragStart.d,
        start: Math.min(dragStart.s, dragEnd.s),
        end: Math.max(dragStart.s, dragEnd.s)
      }
    : selection;

  const selectedRange = useMemo(() => {
    if (!selection) return null;
    return buildReservationRange(days[selection.day], selection.start, selection.end);
  }, [selection, days]);

  const selectedRangeLabel = selection && selectedRange
    ? `${formatTime(selectedRange.startLocal)} - ${formatTime(selectedRange.endLocal)} (${formatDuration(selection.start, selection.end)})`
    : '';

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
    return Promise.all([
      supabase.from('bookings').select('*'),
      supabase.from('services').select('*'),
      supabase.from('employees').select('*'),
      supabase.from('employee_blocks').select('*')
    ]);
  };

  const applyAll = ([{ data: bk }, { data: srv }, { data: emp }, { data: blocks } = {}]) => {
    setBookings(bk || []);
    setServices(srv || []);
    setEmployees(emp || []);
    setEmployeeBlocks(blocks || []);
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

  useEffect(() => {
    if (!selectedService?.id || !selection) {
      return;
    }

    let active = true;

    const load = async () => {
      const { data: rel } = await supabase
        .from('employee_services')
        .select('employee_id')
        .eq('service_id', selectedService.id);

      const ids = rel?.map(r => r.employee_id) || [];
      const filteredIds = isEmployeeView && employeeId
        ? ids.filter((id) => String(id) === String(employeeId))
        : ids;

      if (!filteredIds.length) {
        if (active) setAvailableEmployees([]);
        return;
      }

      const { data: emp } = await supabase
        .from('employees')
        .select('*')
        .in('id', filteredIds);

      if (!active) return;

      const available = (emp || []).filter((employee) =>
        employee.active !== false &&
        !employeeHasBookingConflict(bookings, employee.id, selectedRange) &&
        !employeeHasBlockConflict(employeeBlocks, employee.id, selectedRange)
      );

      setAvailableEmployees(available);
    };

    load();

    return () => {
      active = false;
    };
  }, [selectedService, selection, bookings, employeeBlocks, offset, selectedRange, isEmployeeView, employeeId]);

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

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    start(dayIndex, slotIndex);
  };

  const movePointerSelection = (event) => {
    if (!dragStart) return;

    const pointerCell = getPointerCell(event);

    if (!pointerCell || pointerCell.day !== dragStart.d) return;

    event.preventDefault();
    setDragEnd({ d: pointerCell.day, s: pointerCell.slot });
  };

  const close = () => {
    setSelection(null);
    setSelectedService(null);
    setAvailableEmployees([]);
    setPendingEmployee(null);
    setDragStart(null);
    setDragEnd(null);
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

    let deleteQuery = supabase
      .from('bookings')
      .delete()
      .eq('id', booking.id);

    if (isEmployeeView) {
      deleteQuery = deleteQuery.eq('employee_id', employeeId);
    } else if (!isAdminView) {
      deleteQuery = deleteQuery.eq('user_id', user.id);
    }

    const { error } = await deleteQuery;

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
      reserve(employee);
      return;
    }

    setPendingEmployee(employee);
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

    if (employeeHasBlockConflict(employeeBlocks, employee.id, range)) {
      alert(`${employee.name} no está disponible en ese horario`);
      return;
    }

    const { data: conflicts, error: conflictError } = await supabase
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

    const { data: blockConflicts, error: blockConflictError } = await supabase
      .from('employee_blocks')
      .select('id')
      .eq('employee_id', employee.id)
      .lt('start_at', range.end_at)
      .gt('end_at', range.start_at)
      .limit(1);

    if (blockConflictError) {
      alert('No se pudo validar la disponibilidad del empleado. Intentá nuevamente.');
      return;
    }

    if (blockConflicts?.length) {
      alert(`${employee.name} no está disponible en ese horario`);
      await loadAll();
      return;
    }

    const { data: clientConflicts, error: clientConflictError } = await supabase
      .from('bookings')
      .select('id, user_id, user_email')
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

    const bookingPayload = {
      user_id: isClientView ? user.id : null,
      user_email: customerEmail,
      customer_name: customerName || null,
      service: selectedService.id,
      employee_id: employee.id,
      start_at: range.start_at,
      end_at: range.end_at,
      status: 'confirmed'
    };

    const { error } = await supabase.from('bookings').insert(bookingPayload);

    if (error) {
      alert('No se pudo reservar ese horario. Es posible que ya exista una reserva superpuesta.');
      return;
    }

    close();
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
      onPointerUp={end}
      onPointerCancel={end}
      style={{ userSelect: 'none' }}
    >

      {/* NAV */}
      <div className="agenda-week-nav">
        <button
          className="agenda-week-button"
          disabled={!canGoBack}
          onClick={() => setOffset(Math.max(0, offset - visibleDayCount))}
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
        const emptySlotHeight = isCompactAgenda ? 34 : EMPTY_SLOT_HEIGHT;
        const bookedSlotPaddingHeight = isCompactAgenda ? 5 : BOOKED_SLOT_PADDING_HEIGHT;
        const bookingStackHeight = isCompactAgenda ? 21 : BOOKING_STACK_HEIGHT;
        const rowHeight = rowMaxBookings
          ? Math.max(emptySlotHeight, bookedSlotPaddingHeight + (rowMaxBookings * bookingStackHeight))
          : emptySlotHeight;

        return (
          <div
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
                  key={dayIndex}
                  data-agenda-cell="true"
                  data-day-index={dayIndex}
                  data-slot-index={slotIndex}
                  onPointerDown={(event) => startPointerSelection(event, dayIndex, slotIndex)}
                  onPointerEnter={() => move(dayIndex, slotIndex)}
                  style={{
                    border: '1px solid #eee',
                    minHeight: rowHeight,
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    background: isDisabled
                      ? '#f1f1f1'
                      : isSelected
                        ? 'rgba(33, 150, 243, 0.18)'
                        : 'transparent',
                    outline: isSelected ? '2px solid rgba(33, 150, 243, 0.65)' : 'none',
                    outlineOffset: -2,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    opacity: isDisabled ? 0.55 : 1
                  }}
                >
                  <div style={{ flex: '1 1 auto' }}>
                    {slotBookings.map(b => {
                      const service = services.find(s => Number(s.id) === Number(b.service));
                      const emp = employees.find(e => e.id === b.employee_id);
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
                      borderTop: slotBookings.length ? '1px dashed rgba(33, 150, 243, 0.25)' : 'none'
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
      {selection && selectedService && !pendingEmployee && (
        <EmployeeModal
          employees={availableEmployees}
          rangeLabel={selectedRangeLabel}
          selectedService={selectedService}
          onClose={close}
          onReserve={chooseEmployeeForReservation}
        />
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