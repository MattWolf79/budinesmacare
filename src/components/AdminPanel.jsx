import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import ActivityIcon from './ActivityIcon';

const emptyEmployee = {
  name: '',
  code: '',
  active: true,
  serviceIds: []
};

const emptyService = {
  name: '',
  icon: '✨',
  color: '#42A5F5',
  default_duration: 30,
  active: true
};

const emptyBlock = {
  employeeId: '',
  startDate: '',
  endDate: '',
  startTime: '08:00',
  endTime: '18:00',
  fullDay: true,
  reason: ''
};

const serviceIconOptions = ['💆', '🔥', '💅', '💇', '✂️', '🧴', '🧖', '🪒', '✨', '⭐', '🩺', '🧘'];

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

const getEmployeeServiceIds = (employeeId, links) =>
  links
    .filter((relation) => relation.employee_id === employeeId)
    .map((relation) => String(relation.service_id));

const getServiceNames = (employeeId, links, services) => {
  const serviceIds = new Set(getEmployeeServiceIds(employeeId, links));

  return services
    .filter((service) => serviceIds.has(String(service.id)))
    .map((service) => service.name)
    .join(' · ');
};

const serviceMatchesPayload = (service, payload) =>
  service &&
  service.name === payload.name &&
  (service.icon || null) === payload.icon &&
  service.color === payload.color &&
  Number(service.default_duration) === Number(payload.default_duration) &&
  service.active === payload.active;

const employeeMatchesPayload = (employee, payload) =>
  employee &&
  employee.name === payload.name &&
  (employee.code || null) === payload.code &&
  employee.active === payload.active;

const sameServiceIds = (leftIds, rightIds) => {
  const left = [...leftIds].map(String).sort();
  const right = [...rightIds].map(String).sort();

  return left.length === right.length && left.every((id, index) => id === right[index]);
};

const pad = (value) => String(value).padStart(2, '0');

const formatDateForDb = (date) => (
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`
);

const formatDateInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const formatTimeInput = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const getTodayInput = () => formatDateInput(new Date());

const getNowTimeInput = () => formatTimeInput(new Date());

const isSameDateValue = (dateValue, date) => dateValue === formatDateInput(date);

const parseLocalDateTime = (dateValue, timeValue) => {
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hours, minutes] = timeValue.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

const buildBlockRange = (blockForm) => {
  const startDate = blockForm.startDate;
  const endDate = blockForm.endDate || blockForm.startDate;

  if (!startDate) return null;

  if (blockForm.fullDay) {
    const start = parseLocalDateTime(startDate, '00:00');
    const end = parseLocalDateTime(endDate, '00:00');
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  return {
    start: parseLocalDateTime(startDate, blockForm.startTime),
    end: parseLocalDateTime(endDate, blockForm.endTime)
  };
};

const formatBlockLabel = (block) => {
  const start = new Date(block.start_at);
  const end = new Date(block.end_at);
  return `${start.toLocaleDateString()} ${pad(start.getHours())}:${pad(start.getMinutes())} - ${end.toLocaleDateString()} ${pad(end.getHours())}:${pad(end.getMinutes())}`;
};

const formatRequestDate = (value) => {
  if (!value) return 'Sin fecha';

  const date = new Date(value);
  return `${date.toLocaleDateString()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const getAdminLoadError = (results) => {
  const failedResult = results.find((result) => result.error);
  return failedResult ? `${failedResult.label}: ${failedResult.error.message}` : null;
};

export default function AdminPanel({ view, onDataChanged }) {
  const [employees, setEmployees] = useState([]);
  const [services, setServices] = useState([]);
  const [employeeServices, setEmployeeServices] = useState([]);
  const [employeeBlocks, setEmployeeBlocks] = useState([]);
  const [accessRequests, setAccessRequests] = useState([]);
  const [employeeForm, setEmployeeForm] = useState(emptyEmployee);
  const [serviceForm, setServiceForm] = useState(emptyService);
  const [blockForm, setBlockForm] = useState(emptyBlock);
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const activeServices = useMemo(
    () => services.filter((service) => service.active !== false),
    [services]
  );

  const loadAdminData = useCallback(async () => {
    setIsLoading(true);

    const [employeeResult, serviceResult, relationResult, blockResult, accessResult] = await Promise.all([
      supabase.from('employees').select('*').order('name', { ascending: true }),
      supabase.from('services').select('*').order('id', { ascending: true }),
      supabase.from('employee_services').select('*'),
      view === 'blocks'
        ? supabase.from('employee_blocks').select('*').order('start_at', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      view === 'employees'
        ? supabase.rpc('list_internal_registration_requests', { status_value: 'pending' })
        : Promise.resolve({ data: [], error: null })
    ]);

    const loadError = getAdminLoadError([
      { label: 'Empleados', error: employeeResult.error },
      { label: 'Actividades', error: serviceResult.error },
      { label: 'Relaciones empleado-actividad', error: relationResult.error },
      { label: 'Bloqueos', error: blockResult.error },
      { label: 'Solicitudes de acceso', error: accessResult.error }
    ]);

    if (loadError) {
      alert(`No se pudo cargar la administración. ${loadError}`);
      setIsLoading(false);
      return;
    }

    setEmployees(employeeResult.data || []);
    setServices(serviceResult.data || []);
    setEmployeeServices(relationResult.data || []);
    setEmployeeBlocks(blockResult.data || []);
    setAccessRequests(accessResult.data || []);
    setIsLoading(false);
  }, [view]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadAdminData();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadAdminData]);

  const resetEmployeeForm = () => {
    setEmployeeForm(emptyEmployee);
    setEditingEmployeeId(null);
  };

  const resetServiceForm = () => {
    setServiceForm(emptyService);
    setEditingServiceId(null);
  };

  const resetBlockForm = () => {
    setBlockForm(emptyBlock);
    setEditingBlockId(null);
  };

  const updateEmployeeField = (field, value) => {
    setEmployeeForm((current) => ({ ...current, [field]: value }));
  };

  const updateServiceField = (field, value) => {
    setServiceForm((current) => ({ ...current, [field]: value }));
  };

  const updateBlockField = (field, value) => {
    setBlockForm((current) => {
      if (field === 'startDate') {
        const shouldMoveEndDate = !current.endDate || current.endDate < value;

        return {
          ...current,
          startDate: value,
          endDate: shouldMoveEndDate ? value : current.endDate
        };
      }

      return { ...current, [field]: value };
    });
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

  const editEmployee = (employee) => {
    setEditingEmployeeId(employee.id);
    setEmployeeForm({
      name: employee.name || '',
      code: employee.code || '',
      active: employee.active !== false,
      serviceIds: getEmployeeServiceIds(employee.id, employeeServices)
    });
  };

  const editService = (service) => {
    setEditingServiceId(service.id);
    setServiceForm({
      name: service.name || '',
      icon: service.icon || '✨',
      color: service.color || '#42A5F5',
      default_duration: service.default_duration || 30,
      active: service.active !== false
    });
  };

  const editBlock = (block) => {
    const start = new Date(block.start_at);
    const end = new Date(block.end_at);
    const fullDay = start.getHours() === 0 && start.getMinutes() === 0 && end.getHours() === 0 && end.getMinutes() === 0;
    const endDate = new Date(end);

    if (fullDay) {
      endDate.setDate(endDate.getDate() - 1);
    }

    setEditingBlockId(block.id);
    setBlockForm({
      employeeId: block.employee_id || '',
      startDate: formatDateInput(start),
      endDate: formatDateInput(endDate),
      startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
      endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
      fullDay,
      reason: block.reason || ''
    });
  };

  const saveEmployeeRelations = async (employeeId, serviceIds) => {
    const deleteResult = await supabase
      .from('employee_services')
      .delete()
      .eq('employee_id', employeeId);

    if (deleteResult.error) return deleteResult;

    if (!serviceIds.length) return { error: null };

    return supabase.from('employee_services').insert(
      serviceIds.map((serviceId) => ({
        employee_id: employeeId,
        service_id: Number(serviceId)
      }))
    );
  };

  const saveEmployee = async (event) => {
    event.preventDefault();

    const payload = {
      name: employeeForm.name.trim(),
      code: employeeForm.code.trim() || null,
      active: employeeForm.active
    };

    if (!payload.name) {
      alert('Ingresá el nombre del empleado.');
      return;
    }

    setIsSaving(true);

    const employeeResult = editingEmployeeId
      ? await supabase
          .from('employees')
          .update(payload)
          .eq('id', editingEmployeeId)
      : await supabase
          .from('employees')
          .insert(payload)
          .select('id, name, code, active')
          .single();

    if (employeeResult.error) {
      alert(`No se pudo guardar el empleado: ${employeeResult.error.message}`);
      setIsSaving(false);
      return;
    }

    const savedEmployee = editingEmployeeId
      ? await supabase
          .from('employees')
          .select('id, name, code, active')
          .eq('id', editingEmployeeId)
          .single()
      : employeeResult;

    if (savedEmployee.error || !savedEmployee.data) {
      alert(`No se pudo verificar el guardado del empleado: ${savedEmployee.error?.message || 'Supabase no devolvió el empleado.'}`);
      setIsSaving(false);
      return;
    }

    if (!employeeMatchesPayload(savedEmployee.data, payload)) {
      alert('Supabase recibió el pedido, pero no aplicó los cambios del empleado. Revisá las policies de UPDATE sobre la tabla employees.');
      setIsSaving(false);
      return;
    }

    const relationResult = await saveEmployeeRelations(savedEmployee.data.id, employeeForm.serviceIds);

    if (relationResult.error) {
      alert(`El empleado se guardó, pero no se pudieron actualizar sus actividades: ${relationResult.error.message}`);
      setIsSaving(false);
      return;
    }

    const relationCheck = await supabase
      .from('employee_services')
      .select('service_id')
      .eq('employee_id', savedEmployee.data.id);

    if (relationCheck.error) {
      alert(`No se pudo verificar las actividades del empleado: ${relationCheck.error.message}`);
      setIsSaving(false);
      return;
    }

    const savedServiceIds = (relationCheck.data || []).map((relation) => relation.service_id);

    if (!sameServiceIds(savedServiceIds, employeeForm.serviceIds)) {
      alert('Supabase guardó el empleado, pero no aplicó todas sus actividades. Revisá las policies de DELETE/INSERT sobre employee_services.');
      setIsSaving(false);
      return;
    }

    setEmployees((currentEmployees) => {
      if (editingEmployeeId) {
        return currentEmployees.map((employee) =>
          String(employee.id) === String(savedEmployee.data.id) ? savedEmployee.data : employee
        );
      }

      return [...currentEmployees, savedEmployee.data];
    });

    setEmployeeServices((currentRelations) => [
      ...currentRelations.filter((relation) => relation.employee_id !== savedEmployee.data.id),
      ...(relationCheck.data || []).map((relation) => ({
        ...relation,
        employee_id: savedEmployee.data.id
      }))
    ]);

    resetEmployeeForm();
    await loadAdminData();
    onDataChanged?.();
    setIsSaving(false);
  };

  const deleteEmployee = async (employee) => {
    const shouldDelete = window.confirm(`¿Eliminar a ${employee.name}?`);
    if (!shouldDelete) return;

    const { data: existingBookings, error: bookingError } = await supabase
      .from('bookings')
      .select('id')
      .eq('employee_id', employee.id)
      .limit(1);

    if (bookingError) {
      alert('No se pudo validar si el empleado tiene turnos.');
      return;
    }

    if (existingBookings?.length) {
      alert('No se puede eliminar un empleado con turnos cargados. Podés dejarlo inactivo para conservar el historial.');
      return;
    }

    const relationResult = await supabase
      .from('employee_services')
      .delete()
      .eq('employee_id', employee.id);

    if (relationResult.error) {
      alert('No se pudieron quitar las actividades del empleado.');
      return;
    }

    const employeeResult = await supabase
      .from('employees')
      .delete()
      .eq('id', employee.id);

    if (employeeResult.error) {
      alert('No se pudo eliminar el empleado.');
      return;
    }

    if (editingEmployeeId === employee.id) resetEmployeeForm();
    await loadAdminData();
    onDataChanged?.();
  };

  const saveBlock = async (event) => {
    event.preventDefault();

    const range = buildBlockRange(blockForm);

    if (!blockForm.employeeId) {
      alert('Seleccioná un empleado.');
      return;
    }

    if (!range) {
      alert('Ingresá la fecha del bloqueo.');
      return;
    }

    if (range.end <= range.start) {
      alert('El fin del bloqueo debe ser posterior al inicio.');
      return;
    }

    const now = new Date();

    if (range.start < now) {
      alert('No se pueden crear bloqueos en fechas u horarios que ya pasaron.');
      return;
    }

    setIsSaving(true);

    const payload = {
      employee_id: blockForm.employeeId,
      start_at: formatDateForDb(range.start),
      end_at: formatDateForDb(range.end),
      reason: blockForm.reason.trim() || null
    };

    const overlapResult = await supabase
      .from('employee_blocks')
      .select('id')
      .eq('employee_id', payload.employee_id)
      .lt('start_at', payload.end_at)
      .gt('end_at', payload.start_at);

    if (overlapResult.error) {
      alert(`No se pudo validar bloqueos existentes: ${overlapResult.error.message}`);
      setIsSaving(false);
      return;
    }

    const hasOverlap = (overlapResult.data || []).some((block) => String(block.id) !== String(editingBlockId));

    if (hasOverlap) {
      alert('Ese empleado ya tiene un bloqueo superpuesto en ese rango.');
      setIsSaving(false);
      return;
    }

    const blockResult = editingBlockId
      ? await supabase
          .from('employee_blocks')
          .update(payload)
          .eq('id', editingBlockId)
      : await supabase
          .from('employee_blocks')
          .insert(payload)
          .select('*')
          .single();

    if (blockResult.error) {
      alert(`No se pudo guardar el bloqueo: ${blockResult.error.message}`);
      setIsSaving(false);
      return;
    }

    const savedBlock = editingBlockId
      ? await supabase
          .from('employee_blocks')
          .select('*')
          .eq('id', editingBlockId)
          .single()
      : blockResult;

    if (savedBlock.error || !savedBlock.data) {
      alert(`No se pudo verificar el bloqueo: ${savedBlock.error?.message || 'Supabase no devolvió el bloqueo.'}`);
      setIsSaving(false);
      return;
    }

    resetBlockForm();
    await loadAdminData();
    onDataChanged?.();
    setIsSaving(false);
  };

  const deleteBlock = async (block) => {
    const employee = employees.find((item) => item.id === block.employee_id);
    const shouldDelete = window.confirm(`¿Eliminar el bloqueo de ${employee?.name || 'este empleado'}?`);
    if (!shouldDelete) return;

    const { error } = await supabase
      .from('employee_blocks')
      .delete()
      .eq('id', block.id);

    if (error) {
      alert(`No se pudo eliminar el bloqueo: ${error.message}`);
      return;
    }

    if (editingBlockId === block.id) resetBlockForm();
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
      active: serviceForm.active
    };

    if (!payload.name) {
      alert('Ingresá el nombre de la actividad.');
      return;
    }

    const normalizedName = normalizeComparableText(payload.name);
    const duplicatedService = services.find((service) =>
      String(service.id) !== String(editingServiceId) &&
      normalizeComparableText(service.name) === normalizedName
    );

    if (duplicatedService) {
      alert(`Ya existe una actividad llamada ${duplicatedService.name}. Revisá mayúsculas, acentos o tildes antes de crear otra.`);
      return;
    }

    setIsSaving(true);

    const serviceResult = editingServiceId
      ? await supabase
          .from('services')
          .update(payload)
          .eq('id', editingServiceId)
      : await supabase
          .from('services')
          .insert(payload)
          .select('id, name, icon, color, default_duration, active')
          .single();

    if (serviceResult.error) {
      alert(`No se pudo guardar la actividad: ${serviceResult.error.message}`);
      setIsSaving(false);
      return;
    }

    const savedService = editingServiceId
      ? await supabase
          .from('services')
          .select('id, name, icon, color, default_duration, active')
          .eq('id', editingServiceId)
          .single()
      : serviceResult;

    if (savedService.error || !savedService.data) {
      alert(`No se pudo verificar el guardado: ${savedService.error?.message || 'Supabase no devolvió la actividad.'}`);
      setIsSaving(false);
      return;
    }

    if (!serviceMatchesPayload(savedService.data, payload)) {
      alert('Supabase recibió el pedido, pero no aplicó los cambios. Revisá las policies de UPDATE sobre la tabla services.');
      setIsSaving(false);
      return;
    }

    setServices((currentServices) => {
      if (editingServiceId) {
        return currentServices.map((service) =>
          String(service.id) === String(savedService.data.id) ? savedService.data : service
        );
      }

      return [...currentServices, savedService.data];
    });

    resetServiceForm();
    await loadAdminData();
    onDataChanged?.();
    setIsSaving(false);
  };

  const toggleServiceStatus = async (service) => {
    const nextActive = service.active === false;
    const { error } = await supabase
      .from('services')
      .update({ active: nextActive })
      .eq('id', service.id);

    if (error) {
      alert(`No se pudo cambiar el estado de la actividad: ${error.message}`);
      return;
    }

    const { data: updatedService, error: verifyError } = await supabase
      .from('services')
      .select('id, active')
      .eq('id', service.id)
      .single();

    if (verifyError || updatedService?.active !== nextActive) {
      alert('Supabase recibió el pedido, pero no cambió el estado. Revisá las policies de UPDATE sobre la tabla services.');
      return;
    }

    await loadAdminData();
    onDataChanged?.();
  };

  const deleteService = async (service) => {
    const shouldDelete = window.confirm(`¿Eliminar la actividad ${service.name}?`);
    if (!shouldDelete) return;

    const { data: existingBookings, error: bookingError } = await supabase
      .from('bookings')
      .select('id')
      .eq('service', service.id)
      .limit(1);

    if (bookingError) {
      alert('No se pudo validar si la actividad tiene turnos.');
      return;
    }

    if (existingBookings?.length) {
      alert('No se puede eliminar una actividad con turnos cargados. Podés desactivarla para que no se ofrezca más.');
      return;
    }

    const relationResult = await supabase
      .from('employee_services')
      .delete()
      .eq('service_id', service.id);

    if (relationResult.error) {
      alert('No se pudieron quitar las asignaciones de la actividad.');
      return;
    }

    const serviceResult = await supabase
      .from('services')
      .delete()
      .eq('id', service.id);

    if (serviceResult.error) {
      alert('No se pudo eliminar la actividad.');
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
      employee_id_value: null
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
      request_id_value: request.id
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
      <section className="admin-shell">
        <div className="agenda-modal-card admin-loading-card">
          <div className="agenda-modal-header">Administración</div>
          <div className="agenda-modal-body agenda-empty-state">Cargando datos...</div>
        </div>
      </section>
    );
  }

  if (view === 'employees') {
    return (
      <section className="admin-shell">
        <div className="admin-hero">
          <div>
            <span className="admin-kicker">ABM</span>
            <h1>Empleados</h1>
          </div>
          <button className="agenda-close-button admin-refresh-button" type="button" onClick={loadAdminData}>
            Actualizar
          </button>
        </div>

        {accessRequests.length > 0 && (
          <div className="admin-pending-panel">
            <div className="agenda-modal-header">Pendiente de acción</div>
            <div className="admin-pending-list">
              {accessRequests.map((request) => (
                <article className="admin-record-card admin-record-card-plain access-request-card" key={request.id}>
                  <div className="admin-record-main">
                    <div className="admin-record-title">{request.display_name}</div>
                    <div className="admin-record-meta">
                      {internalRoleLabels[request.role] || request.role} · {requestStatusLabels[request.status] || request.status} · {formatRequestDate(request.created_at)}
                    </div>
                    <div className="admin-record-services">
                      {request.role === 'employee'
                        ? 'Se creará como empleado al aprobar.'
                        : 'Acceso administrativo interno'}
                    </div>
                  </div>

                  <div className="admin-record-actions">
                    <button className="agenda-close-button" type="button" disabled={isSaving} onClick={() => approveAccessRequest(request)}>Aprobar</button>
                    <button className="agenda-danger-button" type="button" disabled={isSaving} onClick={() => rejectAccessRequest(request)}>Rechazar</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        <div className="admin-layout">
          <form className="agenda-modal-card admin-form-card" onSubmit={saveEmployee}>
            <div className="agenda-modal-header">{editingEmployeeId ? 'Editar empleado' : 'Nuevo empleado'}</div>
            <div className="agenda-modal-body admin-form-grid">
              <label>
                Nombre
                <input value={employeeForm.name} onChange={(event) => updateEmployeeField('name', event.target.value)} placeholder="Julio" />
              </label>
              <label>
                Código
                <input value={employeeForm.code} onChange={(event) => updateEmployeeField('code', event.target.value)} placeholder="M3" />
              </label>
              <label className="admin-switch-row">
                <input type="checkbox" checked={employeeForm.active} onChange={(event) => updateEmployeeField('active', event.target.checked)} />
                Empleado activo
              </label>

              <div className="admin-fieldset">
                <div className="admin-fieldset-title">Actividades que atiende</div>
                <div className="admin-chip-grid">
                  {activeServices.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      className={`admin-service-chip ${employeeForm.serviceIds.includes(String(service.id)) ? 'is-selected' : ''}`}
                      onClick={() => toggleEmployeeService(service.id)}
                    >
                      <ActivityIcon service={service} size="small" />
                      {service.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="admin-actions">
                <button className="agenda-close-button" type="submit" disabled={isSaving}>
                  {editingEmployeeId ? 'Guardar' : 'Crear'}
                </button>
                {editingEmployeeId && (
                  <button className="agenda-option-button" type="button" onClick={resetEmployeeForm}>
                    Limpiar
                  </button>
                )}
              </div>
            </div>
          </form>

          <div className="admin-list">
            {employees.map((employee) => (
              <article className={`admin-record-card admin-record-card-plain ${employee.active === false ? 'is-muted' : ''}`} key={employee.id}>
                <div className="admin-record-main">
                  <div className="admin-record-title">{employee.name}</div>
                  <div className="admin-record-meta">{employee.code || 'Sin código'} · {employee.active === false ? 'Inactivo' : 'Activo'}</div>
                  <div className="admin-record-services">{getServiceNames(employee.id, employeeServices, services) || 'Sin actividades asignadas'}</div>
                </div>
                <div className="admin-record-actions">
                  <button className="agenda-close-button" type="button" onClick={() => editEmployee(employee)}>Editar</button>
                  <button className="agenda-danger-button" type="button" onClick={() => deleteEmployee(employee)}>Eliminar</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (view === 'blocks') {
    const todayInput = getTodayInput();
    const currentTimeInput = getNowTimeInput();
    const startDateMin = todayInput;
    const endDateMin = blockForm.startDate || todayInput;
    const startTimeMin = !blockForm.fullDay && isSameDateValue(blockForm.startDate, new Date())
      ? currentTimeInput
      : undefined;
    const endTimeMin = !blockForm.fullDay && blockForm.endDate === blockForm.startDate
      ? blockForm.startTime
      : undefined;

    return (
      <section className="admin-shell">
        <div className="admin-hero">
          <div>
            <span className="admin-kicker">Disponibilidad</span>
            <h1>Bloqueos</h1>
          </div>
          <button className="agenda-close-button admin-refresh-button" type="button" onClick={loadAdminData}>
            Actualizar
          </button>
        </div>

        <div className="admin-layout">
          <form className="agenda-modal-card admin-form-card" onSubmit={saveBlock}>
            <div className="agenda-modal-header">{editingBlockId ? 'Editar bloqueo' : 'Nuevo bloqueo'}</div>
            <div className="agenda-modal-body admin-form-grid">
              <label>
                Empleado
                <select value={blockForm.employeeId} onChange={(event) => updateBlockField('employeeId', event.target.value)}>
                  <option value="">Seleccionar empleado</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.name}</option>
                  ))}
                </select>
              </label>

              <label className="admin-switch-row">
                <input type="checkbox" checked={blockForm.fullDay} onChange={(event) => updateBlockField('fullDay', event.target.checked)} />
                Día completo
              </label>

              <div className="admin-two-columns">
                <label>
                  Desde
                  <input type="date" min={startDateMin} value={blockForm.startDate} onChange={(event) => updateBlockField('startDate', event.target.value)} />
                </label>
                <label>
                  Hasta
                  <input type="date" min={endDateMin} value={blockForm.endDate} onChange={(event) => updateBlockField('endDate', event.target.value)} />
                </label>
              </div>

              {!blockForm.fullDay && (
                <div className="admin-two-columns">
                  <label>
                    Hora inicio
                    <input type="time" min={startTimeMin} value={blockForm.startTime} onChange={(event) => updateBlockField('startTime', event.target.value)} />
                  </label>
                  <label>
                    Hora fin
                    <input type="time" min={endTimeMin} value={blockForm.endTime} onChange={(event) => updateBlockField('endTime', event.target.value)} />
                  </label>
                </div>
              )}

              <label>
                Motivo
                <input value={blockForm.reason} onChange={(event) => updateBlockField('reason', event.target.value)} placeholder="Trámite personal, vacaciones..." />
              </label>

              <div className="admin-actions">
                <button className="agenda-close-button" type="submit" disabled={isSaving}>
                  {editingBlockId ? 'Guardar' : 'Crear'}
                </button>
                {editingBlockId && (
                  <button className="agenda-option-button" type="button" onClick={resetBlockForm}>
                    Limpiar
                  </button>
                )}
              </div>
            </div>
          </form>

          <div className="admin-list">
            {employeeBlocks.length === 0 ? (
              <div className="agenda-modal-card admin-form-card">
                <div className="agenda-modal-header">Sin bloqueos</div>
                <div className="agenda-modal-body agenda-empty-state">No hay bloqueos programados.</div>
              </div>
            ) : employeeBlocks.map((block) => {
              const employee = employees.find((item) => item.id === block.employee_id);

              return (
                <article className="admin-record-card admin-record-card-plain" key={block.id}>
                  <div className="admin-record-main">
                    <div className="admin-record-title">{employee?.name || 'Empleado'}</div>
                    <div className="admin-record-meta">{formatBlockLabel(block)}</div>
                    <div className="admin-record-services">{block.reason || 'Sin motivo'}</div>
                  </div>
                  <div className="admin-record-actions">
                    <button className="agenda-close-button" type="button" onClick={() => editBlock(block)}>Editar</button>
                    <button className="agenda-danger-button" type="button" onClick={() => deleteBlock(block)}>Eliminar</button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-shell">
      <div className="admin-hero">
        <div>
          <span className="admin-kicker">ABM</span>
          <h1>Actividades</h1>
        </div>
        <button className="agenda-close-button admin-refresh-button" type="button" onClick={loadAdminData}>
          Actualizar
        </button>
      </div>

      <div className="admin-layout">
        <form className="agenda-modal-card admin-form-card" onSubmit={saveService}>
          <div className="agenda-modal-header">{editingServiceId ? 'Editar actividad' : 'Nueva actividad'}</div>
          <div className="agenda-modal-body admin-form-grid">
            <label>
              Nombre
              <input value={serviceForm.name} onChange={(event) => updateServiceField('name', event.target.value)} placeholder="Peluquería" />
            </label>
            <div className="admin-fieldset">
              <div className="admin-fieldset-title">Icono</div>
              <div className="admin-emoji-grid">
                {serviceIconOptions.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    className={`admin-emoji-button ${serviceForm.icon === icon ? 'is-selected' : ''}`}
                    onClick={() => updateServiceField('icon', icon)}
                  >
                    {icon}
                  </button>
                ))}
              </div>
              <input className="admin-emoji-input" value={serviceForm.icon} onChange={(event) => updateServiceField('icon', event.target.value)} placeholder="Pegá otro emoji" />
            </div>
            <label>
              Duración por defecto
              <input type="number" min="15" step="15" value={serviceForm.default_duration} onChange={(event) => updateServiceField('default_duration', event.target.value)} />
            </label>
            <label>
              Color
              <input type="color" value={serviceForm.color} onChange={(event) => updateServiceField('color', event.target.value)} />
            </label>

            <label className="admin-switch-row">
              <input type="checkbox" checked={serviceForm.active} onChange={(event) => updateServiceField('active', event.target.checked)} />
              Actividad activa
            </label>

            <div className="admin-actions">
              <button className="agenda-close-button" type="submit" disabled={isSaving}>
                {editingServiceId ? 'Guardar' : 'Crear'}
              </button>
              {editingServiceId && (
                <button className="agenda-option-button" type="button" onClick={resetServiceForm}>
                  Limpiar
                </button>
              )}
            </div>
          </div>
        </form>

        <div className="admin-list">
          {services.map((service) => (
            <article className={`admin-record-card ${service.active === false ? 'is-muted' : ''}`} key={service.id}>
              <div className="admin-record-color" style={{ background: service.color || '#94a3b8' }} />
              <div className="admin-record-main">
                <div className="admin-record-title admin-record-title-icon"><ActivityIcon service={service} size="small" /> {service.name}</div>
                <div className="admin-record-meta">{service.default_duration || 30} min · {service.active === false ? 'Inactiva' : 'Activa'}</div>
                <div className="admin-record-services">{employeeServices.filter((relation) => Number(relation.service_id) === Number(service.id)).length} empleado(s) asignado(s)</div>
              </div>
              <div className="admin-record-actions">
                <button className="agenda-close-button" type="button" onClick={() => editService(service)}>Editar</button>
                <button className="agenda-option-button" type="button" onClick={() => toggleServiceStatus(service)}>
                  {service.active === false ? 'Activar' : 'Desactivar'}
                </button>
                <button className="agenda-danger-button" type="button" onClick={() => deleteService(service)}>Eliminar</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
