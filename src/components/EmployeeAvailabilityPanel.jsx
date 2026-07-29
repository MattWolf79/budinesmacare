import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import FormCard from './FormCard';
import { formatDisplayDate } from '../utils/dateFormat';

const weekdayOptions = [
  { value: 1, short: 'Lun', initial: 'L', label: 'Lunes' },
  { value: 2, short: 'Mar', initial: 'M', label: 'Martes' },
  { value: 3, short: 'Mié', initial: 'M', label: 'Miércoles' },
  { value: 4, short: 'Jue', initial: 'J', label: 'Jueves' },
  { value: 5, short: 'Vie', initial: 'V', label: 'Viernes' },
  { value: 6, short: 'Sáb', initial: 'S', label: 'Sábado' },
  { value: 0, short: 'Dom', initial: 'D', label: 'Domingo' }
];

const emptyAvailabilityForm = {
  employeeId: '',
  branchId: '',
  startDate: '',
  endDate: '',
  ranges: [{ startTime: '09:00', endTime: '18:00' }]
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

const toBookingTimestamp = (dateValue, timeValue) => `${dateValue} ${formatTime(timeValue)}:00`;

const getWeekdayLabel = (weekday) =>
  weekdayOptions.find((option) => Number(option.value) === Number(weekday))?.label || 'Día';

const getWeekdayShort = (weekday) =>
  weekdayOptions.find((option) => Number(option.value) === Number(weekday))?.short || 'Día';

const formatDateLabel = (value, weekday) => {
  const date = parseDateInput(value);
  if (!date) return getWeekdayLabel(weekday);

  return formatDisplayDate(date, {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const getEmployeeName = (employees, employeeId, fallback = 'Empleado') =>
  employees.find((employee) => String(employee.id) === String(employeeId))?.name || fallback;

const isValidWeekdayFilter = (value) =>
  value === 'all' || weekdayOptions.some((option) => String(option.value) === String(value));

const isCurrentOrFutureAvailability = (item) => {
  if (!item.available_date) return true;

  const availabilityDate = parseDateInput(item.available_date);
  const today = parseDateInput(getTodayInput());

  return availabilityDate && today && availabilityDate >= today;
};

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
  onAvailabilityChanged,
  adminProfileSummary = null,
  hideHeading = false,
  companySlug,
  companyContext = null
}) {
  const isAdminMode = mode === 'admin';
  const sucursalesHabilitadas = companyContext?.configuracion_operativa?.sucursales_habilitadas === true;
  const branches = useMemo(
    () => (Array.isArray(companyContext?.branches) ? companyContext.branches : []),
    [companyContext]
  );
  const showBranchSelector = sucursalesHabilitadas && branches.length > 0;
  const getBranchName = (branchIdValue) =>
    branches.find((branch) => String(branch.id) === String(branchIdValue))?.name || 'Sucursal';
  const availabilityFilterStorageKey = `turnos.availability.weekday.${isAdminMode ? 'admin' : employeeId || user?.id || 'employee'}`;
  const employeeFilterStorageKey = `turnos.availability.employee.${companySlug || user?.id || 'admin'}`;
  const [employees, setEmployees] = useState(adminEmployees);
  const [availability, setAvailability] = useState([]);
  const [form, setForm] = useState(() => ({
    ...emptyAvailabilityForm,
    employeeId: employeeId || adminEmployees[0]?.id || '',
    branchId: '',
    startDate: getTodayInput(),
    endDate: getTodayInput(),
    ranges: [{ startTime: '09:00', endTime: '18:00' }]
  }));
  const [editingAvailabilityId, setEditingAvailabilityId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedWeekdayFilter, setSelectedWeekdayFilter] = useState(() => {
    if (typeof window === 'undefined') return 'all';
    const savedFilter = window.sessionStorage.getItem(availabilityFilterStorageKey);
    return isValidWeekdayFilter(savedFilter) ? savedFilter : 'all';
  });
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState(() => {
    if (!isAdminMode || typeof window === 'undefined') return 'all';
    return window.sessionStorage.getItem(employeeFilterStorageKey) || 'all';
  });
  const [isAvailabilityFormOpen, setIsAvailabilityFormOpen] = useState(false);
  const [isEmployeeFilterOpen, setIsEmployeeFilterOpen] = useState(false);

  const selectedEmployeeId = isAdminMode
    ? (selectedEmployeeFilter === 'all' ? '' : selectedEmployeeFilter)
    : employeeId;
  const selectedEmployeeLabel = isAdminMode
    ? (selectedEmployeeId ? getEmployeeName(employees, selectedEmployeeId, 'Empleado') : 'Todos los empleados')
    : getEmployeeName(employees, selectedEmployeeId, employeeName || 'Empleado');
  const visibleAvailability = useMemo(
    () => availability.filter((item) =>
      isCurrentOrFutureAvailability(item) &&
      (!selectedEmployeeId || String(item.employee_id) === String(selectedEmployeeId))
    ),
    [availability, selectedEmployeeId]
  );

  const activeDayCount = useMemo(() => {
    const days = new Set(
      visibleAvailability
        .filter((item) => item.active !== false)
        .map((item) => item.available_date || Number(item.weekday))
    );

    return days.size;
  }, [visibleAvailability]);

  const availabilityDayCounts = useMemo(() => {
    const counts = new Map(weekdayOptions.map((option) => [option.value, 0]));

    visibleAvailability.forEach((item) => {
      if (item.active === false) return;
      const weekday = Number(item.weekday);
      counts.set(weekday, (counts.get(weekday) || 0) + 1);
    });

    return counts;
  }, [visibleAvailability]);

  const filteredAvailability = useMemo(() => {
    if (selectedWeekdayFilter === 'all') return visibleAvailability;
    return visibleAvailability.filter((item) => Number(item.weekday) === Number(selectedWeekdayFilter));
  }, [selectedWeekdayFilter, visibleAvailability]);

  const loadAvailability = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');

    const employeesRequest = isAdminMode
      ? supabase.rpc('get_admin_panel_data', {
          account_id_value: user?.isInternal && user?.role === 'admin' ? user.id : null,
          session_token_value: user?.isInternal ? user.sessionToken : null,
          request_status_value: null,
          company_slug_value: companySlug
        })
      : Promise.resolve({ data: employeeId ? [{ id: employeeId, name: employeeName || 'Mi agenda', active: true }] : [], error: null });

    const availabilityRequest = !isAdminMode && user?.isInternal
      ? supabase.rpc('list_internal_employee_availability', {
          account_id_value: user.id,
          session_token_value: user.sessionToken,
          company_slug_value: companySlug
        })
      : isAdminMode
        ? Promise.resolve({ data: null, error: null })
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

    const nextEmployees = isAdminMode
      ? employeesResult.data?.employees || []
      : employeesResult.data || [];
    setEmployees(nextEmployees);
    setAvailability(isAdminMode ? employeesResult.data?.availability || [] : availabilityResult.data || []);
    setForm((current) => ({
      ...current,
      employeeId: nextEmployees.some((employee) => String(employee.id) === String(current.employeeId))
        ? current.employeeId
        : employeeId || nextEmployees[0]?.id || ''
    }));
    setIsLoading(false);
  }, [companySlug, employeeId, employeeName, isAdminMode, user]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadAvailability();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadAvailability]);

  useEffect(() => {
    if (!showBranchSelector) return;
    setForm((current) => {
      if (current.branchId && branches.some((branch) => String(branch.id) === String(current.branchId))) {
        return current;
      }
      return { ...current, branchId: branches[0]?.id || '' };
    });
  }, [showBranchSelector, branches]);

  useEffect(() => {
    if (!isAdminMode || selectedEmployeeFilter === 'all') return;
    if (employees.some((employee) => String(employee.id) === String(selectedEmployeeFilter))) return;

    setSelectedEmployeeFilter('all');
    window.sessionStorage.setItem(employeeFilterStorageKey, 'all');
  }, [employeeFilterStorageKey, employees, isAdminMode, selectedEmployeeFilter]);

  useEffect(() => {
    if (!isAdminMode || selectedEmployeeFilter === 'all' || editingAvailabilityId) return;
    setForm((current) => (
      String(current.employeeId) === String(selectedEmployeeFilter)
        ? current
        : { ...current, employeeId: selectedEmployeeFilter }
    ));
  }, [editingAvailabilityId, isAdminMode, selectedEmployeeFilter]);

  useEffect(() => {
    if (!isEmployeeFilterOpen) return undefined;

    const closeCombo = (event) => {
      if (event.key === 'Escape') setIsEmployeeFilterOpen(false);
    };

    const closeOnOutsideClick = (event) => {
      if (!event.target.closest?.('.availability-employee-combo')) {
        setIsEmployeeFilterOpen(false);
      }
    };

    window.addEventListener('keydown', closeCombo);
    window.addEventListener('pointerdown', closeOnOutsideClick);
    return () => {
      window.removeEventListener('keydown', closeCombo);
      window.removeEventListener('pointerdown', closeOnOutsideClick);
    };
  }, [isEmployeeFilterOpen]);

  const updateWeekdayFilter = (value) => {
    const nextValue = String(value);
    setSelectedWeekdayFilter(nextValue);
    window.sessionStorage.setItem(availabilityFilterStorageKey, nextValue);
  };

  const updateEmployeeFilter = (value) => {
    const nextValue = String(value || 'all');
    setSelectedEmployeeFilter(nextValue);
    setIsEmployeeFilterOpen(false);
    window.sessionStorage.setItem(employeeFilterStorageKey, nextValue);
    if (nextValue !== 'all' && !editingAvailabilityId) {
      setForm((current) => ({ ...current, employeeId: nextValue }));
    }
  };

  const resetForm = () => {
    setEditingAvailabilityId(null);
    setForm({
      ...emptyAvailabilityForm,
      employeeId: selectedEmployeeId || employees[0]?.id || '',
      branchId: showBranchSelector ? (branches[0]?.id || '') : '',
      startDate: getTodayInput(),
      endDate: getTodayInput(),
      ranges: [{ startTime: '09:00', endTime: '18:00' }]
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

  const updateRange = (index, field, value) => {
    setForm((current) => ({
      ...current,
      ranges: current.ranges.map((range, rangeIndex) =>
        rangeIndex === index ? { ...range, [field]: value } : range
      )
    }));
  };

  const addRange = () => {
    setForm((current) => {
      const last = current.ranges[current.ranges.length - 1];
      return {
        ...current,
        ranges: [...current.ranges, { startTime: last?.endTime || '09:00', endTime: last?.endTime || '18:00' }]
      };
    });
  };

  const removeRange = (index) => {
    setForm((current) => ({
      ...current,
      ranges: current.ranges.length > 1
        ? current.ranges.filter((_, rangeIndex) => rangeIndex !== index)
        : current.ranges
    }));
  };

  const editAvailability = (item) => {
    setEditingAvailabilityId(item.id);
    setIsAvailabilityFormOpen(true);
    setForm({
      employeeId: item.employee_id,
      branchId: item.branch_id || (showBranchSelector ? (branches[0]?.id || '') : ''),
      startDate: item.available_date || getTodayInput(),
      endDate: item.available_date || getTodayInput(),
      ranges: [{ startTime: formatTime(item.start_time), endTime: formatTime(item.end_time) }]
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
    const branchIdValue = showBranchSelector ? (form.branchId || null) : null;
    const availabilityDates = editingAvailabilityId
      ? [form.startDate || getTodayInput()]
      : getDatesBetween(form.startDate || getTodayInput(), form.endDate || form.startDate || getTodayInput());

    if (!employeeIdValue) {
      alert('Seleccioná un empleado.');
      return;
    }

    if (showBranchSelector && !branchIdValue) {
      alert('Seleccioná una sucursal.');
      return;
    }

    if (!availabilityDates.length) {
      alert('Seleccioná un rango de fechas válido.');
      return;
    }

    const ranges = form.ranges.map((range) => ({
      startTime: normalizeTimeInput(range.startTime),
      endTime: normalizeTimeInput(range.endTime)
    }));

    if (!ranges.length) {
      alert('Agregá al menos un horario.');
      return;
    }

    for (const range of ranges) {
      if (timeToMinutes(range.endTime) <= timeToMinutes(range.startTime)) {
        alert('En cada horario, la hora fin debe ser posterior a la hora inicio.');
        return;
      }
    }

    for (let i = 0; i < ranges.length; i += 1) {
      for (let j = i + 1; j < ranges.length; j += 1) {
        if (timeToMinutes(ranges[i].startTime) < timeToMinutes(ranges[j].endTime)
          && timeToMinutes(ranges[i].endTime) > timeToMinutes(ranges[j].startTime)) {
          alert('Los horarios que agregaste se superponen entre sí.');
          return;
        }
      }
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

    const runResult = async () => {
      if (isAdminMode) {
        if (editingAvailabilityId) {
          const availabilityDate = availabilityDates[0];
          const updateResult = await supabase.rpc('save_admin_employee_availability', {
            availability_id_value: String(editingAvailabilityId),
            employee_id_value: employeeIdValue,
            available_date_value: availabilityDate,
            start_time_value: ranges[0].startTime,
            end_time_value: ranges[0].endTime,
            active_value: true,
            account_id_value: user?.isInternal && user?.role === 'admin' ? user.id : null,
            session_token_value: user?.isInternal ? user.sessionToken : null,
            company_slug_value: companySlug,
            branch_id_value: branchIdValue
          });

          if (updateResult.error) return updateResult;

          for (const range of ranges.slice(1)) {
            const extraResult = await supabase.rpc('save_admin_employee_availability', {
              availability_id_value: null,
              employee_id_value: employeeIdValue,
              available_date_value: availabilityDate,
              start_time_value: range.startTime,
              end_time_value: range.endTime,
              active_value: true,
              account_id_value: user?.isInternal && user?.role === 'admin' ? user.id : null,
              session_token_value: user?.isInternal ? user.sessionToken : null,
              company_slug_value: companySlug,
              branch_id_value: branchIdValue
            });

            if (extraResult.error) return extraResult;
          }

          return updateResult;
        }

        for (const availabilityDate of availabilityDates) {
          for (const range of ranges) {
            const result = await supabase.rpc('save_admin_employee_availability', {
              availability_id_value: null,
              employee_id_value: employeeIdValue,
              available_date_value: availabilityDate,
              start_time_value: range.startTime,
              end_time_value: range.endTime,
              active_value: true,
              account_id_value: user?.isInternal && user?.role === 'admin' ? user.id : null,
              session_token_value: user?.isInternal ? user.sessionToken : null,
              company_slug_value: companySlug,
              branch_id_value: branchIdValue
            });

            if (result.error) return result;
          }
        }

        return { error: null };
      }

      if (!isAdminMode && user?.isInternal) {
        if (editingAvailabilityId) {
          const availabilityDate = availabilityDates[0];
          const updateResult = await supabase.rpc('update_internal_employee_availability', {
            account_id_value: user.id,
            session_token_value: user.sessionToken,
            availability_id_value: String(editingAvailabilityId),
            available_date_value: availabilityDate,
            start_time_value: ranges[0].startTime,
            end_time_value: ranges[0].endTime,
            active_value: true,
            company_slug_value: companySlug,
            branch_id_value: branchIdValue
          });

          if (updateResult.error) return updateResult;

          for (const range of ranges.slice(1)) {
            const extraResult = await supabase.rpc('create_internal_employee_availability', {
              account_id_value: user.id,
              session_token_value: user.sessionToken,
              available_date_value: availabilityDate,
              start_time_value: range.startTime,
              end_time_value: range.endTime,
              active_value: true,
              company_slug_value: companySlug,
              branch_id_value: branchIdValue
            });

            if (extraResult.error) return extraResult;
          }

          return updateResult;
        }

        for (const availabilityDate of availabilityDates) {
          for (const range of ranges) {
            const result = await supabase.rpc('create_internal_employee_availability', {
              account_id_value: user.id,
              session_token_value: user.sessionToken,
              available_date_value: availabilityDate,
              start_time_value: range.startTime,
              end_time_value: range.endTime,
              active_value: true,
              company_slug_value: companySlug,
              branch_id_value: branchIdValue
            });

            if (result.error) return result;
          }
        }

        return { error: null };
      }

      const basePayload = {
        employee_id: employeeIdValue,
        active: true,
        ...(branchIdValue ? { branch_id: branchIdValue } : {})
      };

      if (editingAvailabilityId) {
        const availabilityDate = availabilityDates[0];
        let query = supabase
          .from('employee_availability')
          .update({
            ...basePayload,
            available_date: availabilityDate,
            weekday: getWeekdayFromDateInput(availabilityDate),
            start_time: ranges[0].startTime,
            end_time: ranges[0].endTime
          })
          .eq('id', editingAvailabilityId);

        if (!isAdminMode) {
          query = query.eq('employee_id', employeeId);
        }

        const updateResult = await query;
        if (updateResult.error || ranges.length === 1) return updateResult;

        return supabase.from('employee_availability').insert(
          ranges.slice(1).map((range) => ({
            ...basePayload,
            available_date: availabilityDate,
            weekday: getWeekdayFromDateInput(availabilityDate),
            start_time: range.startTime,
            end_time: range.endTime
          }))
        );
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

    resetForm();
    setIsAvailabilityFormOpen(false);
    await loadAvailability();
    onAvailabilityChanged?.();
    setIsSaving(false);
  };

  const deleteAvailability = async (item) => {
    if (!isAdminMode) {
      const availabilityStart = toBookingTimestamp(item.available_date, item.start_time);
      const availabilityEnd = toBookingTimestamp(item.available_date, item.end_time);

      const { data: existingBookings, error: bookingError } = await supabase
        .from('bookings')
        .select('id')
        .eq('employee_id', item.employee_id)
        .in('status', ['reserved', 'confirmed'])
        .lt('start_at', availabilityEnd)
        .gt('end_at', availabilityStart)
        .limit(1);

      if (bookingError) {
        alert('No se pudo validar si la disponibilidad tiene turnos asignados. Intentá nuevamente.');
        return;
      }

      if (existingBookings?.length) {
        alert('No se puede eliminar una disponibilidad con turnos asignados. Cancelá o reasigná esos turnos primero.');
        return;
      }
    }

    const shouldDelete = window.confirm(`¿Eliminar la disponibilidad de ${formatDateLabel(item.available_date, item.weekday)} ${formatTime(item.start_time)}-${formatTime(item.end_time)}?`);
    if (!shouldDelete) return;

    setIsSaving(true);

    const result = isAdminMode
      ? await supabase.rpc('delete_admin_employee_availability', {
          availability_id_value: String(item.id),
          account_id_value: user?.isInternal && user?.role === 'admin' ? user.id : null,
          session_token_value: user?.isInternal ? user.sessionToken : null,
          company_slug_value: companySlug
        })
      : !user?.isInternal
        ? await supabase
            .from('employee_availability')
            .delete()
            .eq('id', item.id)
            .eq('employee_id', employeeId)
        : await supabase.rpc('delete_internal_employee_availability', {
          account_id_value: user.id,
          session_token_value: user.sessionToken,
          availability_id_value: String(item.id),
          company_slug_value: companySlug
        });

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

  const sortedAvailability = groupAvailabilityByDay(filteredAvailability);
  const selectedDayLabel = selectedWeekdayFilter === 'all'
    ? 'todos los días'
    : getWeekdayLabel(selectedWeekdayFilter);

  return (
    <section className="admin-shell employee-availability-manager">
      {!hideHeading && (
        <div className="admin-page-heading availability-page-heading">
          <div>
            <p>Agenda disponible</p>
            <h1>Disponibilidad</h1>
          </div>
          {adminProfileSummary}
        </div>
      )}

      <div className="admin-external-actions">
        <button className="agenda-refresh-button" type="button" onClick={loadAvailability} disabled={isLoading}>
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
        <span>{selectedEmployeeLabel}</span>
      </div>

      {isAdminMode && (
        <div className="availability-employee-filter">
          <span>Empleado</span>
          <div className="availability-employee-combo">
            <button
              className="availability-employee-combo-button"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={isEmployeeFilterOpen}
              onClick={() => setIsEmployeeFilterOpen((current) => !current)}
            >
              <span>{selectedEmployeeLabel}</span>
              <small aria-hidden="true">⌄</small>
            </button>
            {isEmployeeFilterOpen && (
              <div className="availability-employee-combo-list" role="listbox" aria-label="Filtrar disponibilidad por empleado">
                <button
                  className={`availability-employee-combo-option ${selectedEmployeeFilter === 'all' ? 'is-selected' : ''}`}
                  type="button"
                  role="option"
                  aria-selected={selectedEmployeeFilter === 'all'}
                  onClick={() => updateEmployeeFilter('all')}
                >
                  Todos los empleados
                </button>
                {employees.map((employee) => (
                  <button
                    className={`availability-employee-combo-option ${String(selectedEmployeeFilter) === String(employee.id) ? 'is-selected' : ''}`}
                    type="button"
                    role="option"
                    aria-selected={String(selectedEmployeeFilter) === String(employee.id)}
                    key={employee.id}
                    onClick={() => updateEmployeeFilter(employee.id)}
                    title={employee.name}
                  >
                    {employee.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="availability-day-filter" aria-label="Filtrar disponibilidad por día">
        <button
          className={`availability-day-filter-all ${selectedWeekdayFilter === 'all' ? 'is-selected' : ''}`}
          type="button"
          onClick={() => updateWeekdayFilter('all')}
        >
          Todos
        </button>
        <div className="availability-day-filter-circles">
          {weekdayOptions.map((day) => {
            const count = availabilityDayCounts.get(day.value) || 0;

            return (
              <button
                className={`availability-day-circle ${Number(selectedWeekdayFilter) === Number(day.value) ? 'is-selected' : ''}`}
                type="button"
                key={day.value}
                onClick={() => updateWeekdayFilter(day.value)}
                title={`${day.label}: ${count} disponibilidad(es)`}
                aria-label={`Ver disponibilidad de ${day.label}`}
              >
                <span>{day.initial}</span>
                <small>{count}</small>
              </button>
            );
          })}
        </div>
        <span className="availability-day-filter-caption">
          Mostrando {selectedDayLabel}
        </span>
      </div>

      <div className="admin-layout">
        <FormCard
          title={editingAvailabilityId ? 'Editar disponibilidad' : 'Nueva disponibilidad'}
          className="availability-form-card"
          headerClassName="availability-form-header"
          bodyClassName="availability-form-body"
          isOpen={isAvailabilityFormOpen}
          onToggle={() => setIsAvailabilityFormOpen((current) => !current)}
          toggleLabel={isAvailabilityFormOpen ? 'Ocultar formulario de disponibilidad' : 'Mostrar formulario de disponibilidad'}
          onSubmit={saveAvailability}
        >
            {showBranchSelector && (
              <div className="admin-fieldset availability-branch-fieldset">
                <div className="admin-fieldset-title">Sucursal</div>
                <div className="availability-branch-pills" role="group" aria-label="Seleccionar sucursal">
                  {branches.map((branch) => (
                    <button
                      key={branch.id}
                      type="button"
                      className={`availability-branch-pill ${String(form.branchId) === String(branch.id) ? 'is-selected' : ''}`}
                      onClick={() => updateField('branchId', branch.id)}
                    >
                      {branch.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

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

            <div className="admin-fieldset availability-ranges-fieldset">
              <div className="admin-fieldset-title">Horarios disponibles</div>
              {form.ranges.map((range, index) => (
                <div className="availability-range-card" key={index}>
                  <div className="admin-two-columns">
                    <label>
                      Hora inicio
                      <input
                        type="time"
                        step="1800"
                        value={range.startTime}
                        onChange={(event) => updateRange(index, 'startTime', event.target.value)}
                      />
                    </label>
                    <label>
                      Hora fin
                      <input
                        type="time"
                        step="1800"
                        min={range.startTime}
                        value={range.endTime}
                        onChange={(event) => updateRange(index, 'endTime', event.target.value)}
                      />
                    </label>
                  </div>
                  {form.ranges.length > 1 && (
                    <button
                      type="button"
                      className="availability-range-remove"
                      onClick={() => removeRange(index)}
                      aria-label={`Quitar horario ${index + 1}`}
                    >
                      Quitar horario
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="availability-range-add" onClick={addRange}>
                + Agregar horario
              </button>
            </div>

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
        </FormCard>

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
          ) : (
            <div className="availability-card-grid" aria-label="Horarios disponibles">
              {sortedAvailability.map((item) => (
                <article className={`admin-record-card availability-card ${item.active === false ? 'is-muted' : ''}`} key={item.id}>
                  <div className="availability-card-header">
                    <span className="availability-date-badge" aria-hidden="true">{getWeekdayShort(item.weekday)}</span>
                    <strong>Disponibilidad</strong>
                  </div>
                  <div className="admin-record-main availability-card-main">
                    <div className="availability-card-fields">
                      <div className="availability-card-field availability-card-field-wide">
                        <span>Fecha</span>
                        <strong>{formatDateLabel(item.available_date, item.weekday)}</strong>
                      </div>
                      {isAdminMode && (
                        <div className="availability-card-field availability-card-field-wide">
                          <span>Empleado</span>
                          <strong>{getEmployeeName(employees, item.employee_id, employeeName || 'Empleado')}</strong>
                        </div>
                      )}
                      <div className="availability-card-field availability-card-field-wide">
                        <span>Horario</span>
                        <strong>{formatTime(item.start_time)} hs-{formatTime(item.end_time)} hs</strong>
                      </div>
                      {showBranchSelector && (
                        <div className="availability-card-field availability-card-field-wide">
                          <span>Sucursal</span>
                          <strong>{getBranchName(item.branch_id)}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="admin-record-actions availability-card-actions">
                    <button className="agenda-close-button availability-card-action" type="button" onClick={() => editAvailability(item)} disabled={isSaving}>
                      <span className="admin-action-label-full">Editar</span>
                      <span className="admin-action-label-compact" aria-hidden="true">✏️</span>
                    </button>
                    <button className="agenda-danger-button availability-card-action" type="button" onClick={() => deleteAvailability(item)} disabled={isSaving}>
                      <span className="admin-action-label-full">Eliminar</span>
                      <span className="admin-action-label-compact" aria-hidden="true">🗑️</span>
                    </button>
                  </div>
                  <button
                    className="availability-card-edit-arrow"
                    type="button"
                    onClick={() => editAvailability(item)}
                    disabled={isSaving}
                    aria-label="Editar esta disponibilidad"
                    title="Editar"
                  >
                    ›
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
