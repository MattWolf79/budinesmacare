import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';

const weekdayOptions = [
  { value: 1, short: 'Lun', label: 'Lunes' },
  { value: 2, short: 'Mar', label: 'Martes' },
  { value: 3, short: 'Mié', label: 'Miércoles' },
  { value: 4, short: 'Jue', label: 'Jueves' },
  { value: 5, short: 'Vie', label: 'Viernes' },
  { value: 6, short: 'Sáb', label: 'Sábado' },
  { value: 0, short: 'Dom', label: 'Domingo' }
];

const emptyAvailabilityForm = {
  employeeId: '',
  startDate: '',
  endDate: '',
  startTime: '09:00',
  endTime: '18:00',
  splitSchedule: false,
  secondStartTime: '14:00',
  secondEndTime: '18:00'
};

const normalizeTimeInput = (value) => String(value || '').slice(0, 5);

const formatDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getTodayInput = () => formatDateInput(new Date());

const parseDateInput = (value) => {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

const getWeekdayFromDateInput = (value) => parseDateInput(value)?.getDay() ?? 0;

const addDays = (date, amount) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
};

const getWeekStart = (date = new Date()) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);
  return start;
};

const getWeekDates = (weekStart) =>
  Array.from({ length: 7 }, (_, index) => formatDateInput(addDays(weekStart, index)));

const getDatesBetween = (startValue, endValue) => {
  const startDate = parseDateInput(startValue);
  const endDate = parseDateInput(endValue || startValue);

  if (!startDate || !endDate || endDate < startDate) return [];

  const dates = [];
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    dates.push(formatDateInput(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
};

const timeToMinutes = (value) => {
  const [hours = 0, minutes = 0] = normalizeTimeInput(value).split(':').map(Number);
  return (hours * 60) + minutes;
};

const formatTime = (value) => normalizeTimeInput(value || '00:00');

const getWeekdayLabel = (weekday) =>
  weekdayOptions.find((option) => Number(option.value) === Number(weekday))?.label || 'Día';

const getWeekdayShort = (weekday) =>
  weekdayOptions.find((option) => Number(option.value) === Number(weekday))?.short || 'Día';

const formatDateLabel = (value, weekday) => {
  const date = parseDateInput(value);
  if (!date) return getWeekdayLabel(weekday);

  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit'
  }).format(date);
};

const formatShortDateLabel = (value) => {
  const date = parseDateInput(value);
  if (!date) return 'Fecha';

  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  }).format(date);
};

const getEmployeeName = (employees, employeeId, fallback = 'Empleado') =>
  employees.find((employee) => String(employee.id) === String(employeeId))?.name || fallback;

const groupAvailabilityByDay = (items) => {
  const order = new Map(weekdayOptions.map((option, index) => [option.value, index]));

  return [...items].sort((left, right) => {
    const dateDiff = String(left.available_date || '').localeCompare(String(right.available_date || ''));
    if (dateDiff !== 0) return dateDiff;

    const weekdayDiff = order.get(Number(left.weekday)) - order.get(Number(right.weekday));
    if (weekdayDiff !== 0) return weekdayDiff;
    return timeToMinutes(left.start_time) - timeToMinutes(right.start_time);
  });
};

export default function EmployeeAvailabilityPanel({
  user,
  mode = 'employee',
  employeeId,
  employeeName,
  employees: adminEmployees = [],
  onAvailabilityChanged
}) {
  const isAdminMode = mode === 'admin';
  const [employees, setEmployees] = useState(adminEmployees);
  const [availability, setAvailability] = useState([]);
  const [form, setForm] = useState(() => ({
    ...emptyAvailabilityForm,
    employeeId: employeeId || adminEmployees[0]?.id || '',
    startDate: getTodayInput(),
    endDate: getTodayInput()
  }));
  const [editingAvailabilityId, setEditingAvailabilityId] = useState(null);
  const [calendarWeekStart, setCalendarWeekStart] = useState(() => getWeekStart(new Date()));
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  const selectedEmployeeId = isAdminMode ? '' : employeeId;
  const visibleAvailability = useMemo(
    () => availability.filter((item) => !selectedEmployeeId || String(item.employee_id) === String(selectedEmployeeId)),
    [availability, selectedEmployeeId]
  );

  const calendarDates = useMemo(() => getWeekDates(calendarWeekStart), [calendarWeekStart]);
  const calendarAvailabilityByDate = useMemo(() => {
    const grouped = new Map(calendarDates.map((date) => [date, []]));

    groupAvailabilityByDay(visibleAvailability).forEach((item) => {
      const itemDate = item.available_date || '';
      if (!grouped.has(itemDate)) return;
      grouped.get(itemDate).push(item);
    });

    return grouped;
  }, [calendarDates, visibleAvailability]);

  const activeDayCount = useMemo(() => {
    const days = new Set(
      visibleAvailability
        .filter((item) => item.active !== false)
        .map((item) => item.available_date || Number(item.weekday))
    );

    return days.size;
  }, [visibleAvailability]);

  const loadAvailability = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');

    const employeesRequest = isAdminMode
      ? supabase.from('employees').select('*').order('name', { ascending: true })
      : Promise.resolve({ data: employeeId ? [{ id: employeeId, name: employeeName || 'Mi agenda', active: true }] : [], error: null });

    const availabilityRequest = !isAdminMode && user?.isInternal
      ? supabase.rpc('list_internal_employee_availability', { account_id_value: user.id })
      : isAdminMode
        ? supabase.from('employee_availability').select('*').order('available_date', { ascending: true }).order('start_time', { ascending: true })
        : supabase
            .from('employee_availability')
            .select('*')
            .eq('employee_id', employeeId)
            .order('weekday', { ascending: true })
            .order('start_time', { ascending: true });

    const [employeesResult, availabilityResult] = await Promise.all([employeesRequest, availabilityRequest]);

    if (employeesResult.error || availabilityResult.error) {
      const message = employeesResult.error?.message || availabilityResult.error?.message || 'No se pudo cargar la disponibilidad.';
      setLoadError(message);
      setIsLoading(false);
      return;
    }

    const nextEmployees = employeesResult.data || [];
    setEmployees(nextEmployees);
    setAvailability(availabilityResult.data || []);
    setForm((current) => ({
      ...current,
      employeeId: current.employeeId || employeeId || nextEmployees[0]?.id || ''
    }));
    setIsLoading(false);
  }, [employeeId, employeeName, isAdminMode, user]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadAvailability();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadAvailability]);

  const resetForm = () => {
    setEditingAvailabilityId(null);
    setForm({
      ...emptyAvailabilityForm,
      employeeId: selectedEmployeeId || employees[0]?.id || '',
      startDate: getTodayInput(),
      endDate: getTodayInput()
    });
  };

  const updateField = (field, value) => {
    setForm((current) => {
      if (field === 'startDate') {
        return {
          ...current,
          startDate: value,
          endDate: current.endDate && current.endDate >= value ? current.endDate : value
        };
      }

      return { ...current, [field]: value };
    });
  };

  const editAvailability = (item) => {
    setEditingAvailabilityId(item.id);
    setForm({
      employeeId: item.employee_id,
      startDate: item.available_date || getTodayInput(),
      endDate: item.available_date || getTodayInput(),
      startTime: formatTime(item.start_time),
      endTime: formatTime(item.end_time),
      splitSchedule: false,
      secondStartTime: '14:00',
      secondEndTime: '18:00'
    });
  };

  const hasOverlap = (employeeIdValue, date, weekday, startTime, endTime) => {
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    return availability.some((item) => {
      if (String(item.id) === String(editingAvailabilityId)) return false;
      if (item.active === false) return false;
      if (String(item.employee_id) !== String(employeeIdValue)) return false;
      if (item.available_date || date) {
        if (String(item.available_date || '') !== String(date || '')) return false;
      } else if (Number(item.weekday) !== Number(weekday)) {
        return false;
      }

      return startMinutes < timeToMinutes(item.end_time) && endMinutes > timeToMinutes(item.start_time);
    });
  };

  const saveAvailability = async (event) => {
    event.preventDefault();

    const employeeIdValue = isAdminMode ? form.employeeId : employeeId;
    const availabilityDates = editingAvailabilityId
      ? [form.startDate || getTodayInput()]
      : getDatesBetween(form.startDate || getTodayInput(), form.endDate || form.startDate || getTodayInput());
    const startTime = normalizeTimeInput(form.startTime);
    const endTime = normalizeTimeInput(form.endTime);
    const secondStartTime = normalizeTimeInput(form.secondStartTime);
    const secondEndTime = normalizeTimeInput(form.secondEndTime);

    if (!employeeIdValue) {
      alert('Seleccioná un empleado.');
      return;
    }

    if (!availabilityDates.length) {
      alert('Seleccioná un rango de fechas válido.');
      return;
    }

    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      alert('La hora fin debe ser posterior a la hora inicio.');
      return;
    }

    const ranges = [{ startTime, endTime }];

    if (form.splitSchedule) {
      if (timeToMinutes(secondEndTime) <= timeToMinutes(secondStartTime)) {
        alert('La segunda hora fin debe ser posterior a la segunda hora inicio.');
        return;
      }

      if (timeToMinutes(startTime) < timeToMinutes(secondEndTime) && timeToMinutes(endTime) > timeToMinutes(secondStartTime)) {
        alert('Los horarios fraccionados no pueden superponerse.');
        return;
      }

      ranges.push({ startTime: secondStartTime, endTime: secondEndTime });
    }

    const duplicatedDate = availabilityDates.find((availabilityDate) => {
      const weekday = getWeekdayFromDateInput(availabilityDate);
      return ranges.some((range) => hasOverlap(employeeIdValue, availabilityDate, weekday, range.startTime, range.endTime));
    });

    if (duplicatedDate) {
      alert(`Ya existe una disponibilidad superpuesta para ${formatDateLabel(duplicatedDate, getWeekdayFromDateInput(duplicatedDate))}.`);
      return;
    }

    setIsSaving(true);

    const basePayload = {
      employee_id: employeeIdValue,
      active: true
    };

    const runResult = async () => {
      if (!isAdminMode && user?.isInternal) {
        if (editingAvailabilityId) {
          const availabilityDate = availabilityDates[0];
          return supabase.rpc('update_internal_employee_availability', {
            account_id_value: user.id,
            availability_id_value: String(editingAvailabilityId),
            available_date_value: availabilityDate,
            start_time_value: startTime,
            end_time_value: endTime,
            active_value: true
          });
        }

        for (const availabilityDate of availabilityDates) {
          for (const range of ranges) {
            const result = await supabase.rpc('create_internal_employee_availability', {
              account_id_value: user.id,
              available_date_value: availabilityDate,
              start_time_value: range.startTime,
              end_time_value: range.endTime,
              active_value: true
            });

            if (result.error) return result;
          }
        }

        return { error: null };
      }

      if (editingAvailabilityId) {
        const availabilityDate = availabilityDates[0];
        let query = supabase
          .from('employee_availability')
          .update({
            ...basePayload,
            available_date: availabilityDate,
            weekday: getWeekdayFromDateInput(availabilityDate),
            start_time: startTime,
            end_time: endTime
          })
          .eq('id', editingAvailabilityId);

        if (!isAdminMode) {
          query = query.eq('employee_id', employeeId);
        }

        return query;
      }

      return supabase.from('employee_availability').insert(
        availabilityDates.flatMap((availabilityDate) =>
          ranges.map((range) => ({
            ...basePayload,
            available_date: availabilityDate,
            weekday: getWeekdayFromDateInput(availabilityDate),
            start_time: range.startTime,
            end_time: range.endTime
          }))
        )
      );
    };

    const result = await runResult();

    if (result.error) {
      alert(`No se pudo guardar la disponibilidad: ${result.error.message}`);
      setIsSaving(false);
      return;
    }

    if (isAdminMode) {
      setCalendarWeekStart(getWeekStart(parseDateInput(availabilityDates[0]) || new Date()));
    }

    resetForm();
    await loadAvailability();
    onAvailabilityChanged?.();
    setIsSaving(false);
  };

  const deleteAvailability = async (item) => {
    const shouldDelete = window.confirm(`¿Eliminar la disponibilidad de ${formatDateLabel(item.available_date, item.weekday)} ${formatTime(item.start_time)}-${formatTime(item.end_time)}?`);
    if (!shouldDelete) return;

    setIsSaving(true);

    const result = !isAdminMode && user?.isInternal
      ? await supabase.rpc('delete_internal_employee_availability', {
          account_id_value: user.id,
          availability_id_value: String(item.id)
        })
      : await supabase
          .from('employee_availability')
          .delete()
          .eq('id', item.id)
          .eq('employee_id', isAdminMode ? item.employee_id : employeeId);

    if (result.error) {
      alert(`No se pudo eliminar la disponibilidad: ${result.error.message}`);
      setIsSaving(false);
      return;
    }

    if (editingAvailabilityId === item.id) resetForm();
    await loadAvailability();
    onAvailabilityChanged?.();
    setIsSaving(false);
  };

  const sortedAvailability = groupAvailabilityByDay(visibleAvailability);

  return (
    <section className="admin-shell employee-availability-manager">
      <div className="admin-hero">
        <div>
          <span className="admin-kicker">Agenda disponible</span>
          <h1>Disponibilidad</h1>
        </div>
        <button className="agenda-close-button admin-refresh-button" type="button" onClick={loadAvailability} disabled={isLoading}>
          Actualizar
        </button>
      </div>

      {loadError && (
        <div className="agenda-modal-card admin-form-card availability-warning-card">
          <div className="agenda-modal-header">Configuración pendiente</div>
          <div className="agenda-modal-body agenda-empty-state">{loadError}</div>
        </div>
      )}

      <div className="availability-summary-strip" aria-label="Resumen de disponibilidad">
        <span>{activeDayCount} día(s) activo(s)</span>
        <span>{sortedAvailability.filter((item) => item.active !== false).length} rango(s) horario(s)</span>
        <span>{isAdminMode ? 'Todos los empleados' : getEmployeeName(employees, selectedEmployeeId, employeeName || 'Empleado')}</span>
      </div>

      <div className="admin-layout">
        <form className="agenda-modal-card admin-form-card availability-form-card" onSubmit={saveAvailability}>
          <div className="agenda-modal-header">{editingAvailabilityId ? 'Editar disponibilidad' : 'Nueva disponibilidad'}</div>
          <div className="agenda-modal-body admin-form-grid">
            <label>
              Empleado
              {isAdminMode ? (
                <select value={form.employeeId} onChange={(event) => updateField('employeeId', event.target.value)} disabled={Boolean(editingAvailabilityId)}>
                  <option value="">Seleccionar empleado</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.name}</option>
                  ))}
                </select>
              ) : (
                <input value={employeeName || getEmployeeName(employees, employeeId, 'Mi agenda')} disabled />
              )}
            </label>

            <div className="admin-fieldset">
              <div className="admin-fieldset-title">Fechas disponibles</div>
              <div className="admin-two-columns availability-date-columns">
                <label>
                  Desde
                  <input
                    type="date"
                    min={getTodayInput()}
                    value={form.startDate}
                    onChange={(event) => updateField('startDate', event.target.value)}
                  />
                </label>
                <label>
                  Hasta
                  <input
                    type="date"
                    min={form.startDate || getTodayInput()}
                    value={form.endDate}
                    onChange={(event) => updateField('endDate', event.target.value)}
                    disabled={Boolean(editingAvailabilityId)}
                  />
                </label>
              </div>
              <div className="availability-date-field">
                <span>
                  {editingAvailabilityId || form.startDate === form.endDate
                    ? formatDateLabel(form.startDate, getWeekdayFromDateInput(form.startDate))
                    : `${formatDateLabel(form.startDate, getWeekdayFromDateInput(form.startDate))} a ${formatDateLabel(form.endDate, getWeekdayFromDateInput(form.endDate))}`}
                </span>
              </div>
            </div>

            <div className="availability-range-card">
              <div className="admin-two-columns">
                <label>
                  Hora inicio
                  <input type="time" step="1800" value={form.startTime} onChange={(event) => updateField('startTime', event.target.value)} />
                </label>
                <label>
                  Hora fin
                  <input type="time" step="1800" min={form.startTime} value={form.endTime} onChange={(event) => updateField('endTime', event.target.value)} />
                </label>
              </div>
            </div>

            <label className="admin-switch-row">
              <input type="checkbox" checked={form.splitSchedule} onChange={(event) => updateField('splitSchedule', event.target.checked)} disabled={Boolean(editingAvailabilityId)} />
              Fraccionar horario
            </label>

            {form.splitSchedule && !editingAvailabilityId && (
              <div className="availability-range-card">
                <div className="admin-two-columns">
                  <label>
                    Segundo inicio
                    <input type="time" step="1800" value={form.secondStartTime} onChange={(event) => updateField('secondStartTime', event.target.value)} />
                  </label>
                  <label>
                    Segundo fin
                    <input type="time" step="1800" min={form.secondStartTime} value={form.secondEndTime} onChange={(event) => updateField('secondEndTime', event.target.value)} />
                  </label>
                </div>
              </div>
            )}

            <div className="admin-actions">
              <button className="agenda-close-button" type="submit" disabled={isSaving || isLoading}>
                {editingAvailabilityId ? 'Guardar' : 'Crear'}
              </button>
              {editingAvailabilityId && (
                <button className="agenda-option-button" type="button" onClick={resetForm} disabled={isSaving}>
                  Limpiar
                </button>
              )}
            </div>
          </div>
        </form>

        <div className="admin-list availability-list">
          {isLoading ? (
            <div className="agenda-modal-card admin-form-card">
              <div className="agenda-modal-header">Cargando</div>
              <div className="agenda-modal-body agenda-empty-state">Buscando horarios disponibles...</div>
            </div>
          ) : sortedAvailability.length === 0 ? (
            <div className="agenda-modal-card admin-form-card">
              <div className="agenda-modal-header">Sin disponibilidad</div>
              <div className="agenda-modal-body agenda-empty-state">Todavía no hay horarios disponibles configurados.</div>
            </div>
          ) : isAdminMode ? (
            <div className="agenda-modal-card admin-form-card availability-calendar-card">
              <div className="agenda-modal-header availability-calendar-header">
                <button className="agenda-option-button" type="button" onClick={() => setCalendarWeekStart((current) => addDays(current, -7))}>
                  Ant.
                </button>
                <span>
                  {formatShortDateLabel(calendarDates[0])} - {formatShortDateLabel(calendarDates[6])}
                </span>
                <button className="agenda-option-button" type="button" onClick={() => setCalendarWeekStart((current) => addDays(current, 7))}>
                  Sig.
                </button>
              </div>

              <div className="availability-calendar-grid">
                {calendarDates.map((date) => {
                  const dayItems = calendarAvailabilityByDate.get(date) || [];

                  return (
                    <section className="availability-calendar-day" key={date}>
                      <div className="availability-calendar-day-header">
                        <strong>{formatShortDateLabel(date)}</strong>
                        <span>{dayItems.length || 'Sin horarios'}</span>
                      </div>

                      <div className="availability-calendar-day-body">
                        {dayItems.length === 0 ? (
                          <div className="availability-calendar-empty">Libre</div>
                        ) : dayItems.map((item) => (
                          <article className="availability-calendar-item" key={item.id}>
                            <strong>{getEmployeeName(employees, item.employee_id, employeeName || 'Empleado')}</strong>
                            <time>{formatTime(item.start_time)} - {formatTime(item.end_time)}</time>
                            <div className="availability-calendar-actions">
                              <button className="agenda-close-button" type="button" onClick={() => editAvailability(item)} disabled={isSaving}>Editar</button>
                              <button className="agenda-danger-button" type="button" onClick={() => deleteAvailability(item)} disabled={isSaving}>Eliminar</button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="agenda-modal-card admin-form-card availability-table-card">
              <div className="agenda-modal-header">Horarios disponibles</div>
              <div className="availability-table" role="table" aria-label="Horarios disponibles">
                {sortedAvailability.map((item) => (
                  <div className={`availability-row ${item.active === false ? 'is-muted' : ''}`} role="row" key={item.id}>
                    <div className="availability-date-badge" aria-hidden="true">{getWeekdayShort(item.weekday)}</div>
                    <div className="availability-row-main">
                      <strong>{formatDateLabel(item.available_date, item.weekday)}</strong>
                      <span>{getEmployeeName(employees, item.employee_id, employeeName || 'Empleado')}</span>
                    </div>
                    <time>{formatTime(item.start_time)} - {formatTime(item.end_time)}</time>
                    <div className="availability-row-actions">
                      <button className="agenda-close-button" type="button" onClick={() => editAvailability(item)} disabled={isSaving}>Editar</button>
                      <button className="agenda-danger-button" type="button" onClick={() => deleteAvailability(item)} disabled={isSaving}>Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
