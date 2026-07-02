import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import ActivityIcon from './ActivityIcon';

const emptyEmployee = {
  name: '',
  first_name: '',
  last_name: '',
  birth_date: '',
  phone: '',
  address_street: '',
  address_number: '',
  address_locality: '',
  photo_url: '',
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
  (employee.first_name || null) === payload.first_name &&
  (employee.last_name || null) === payload.last_name &&
  (employee.birth_date || null) === payload.birth_date &&
  (employee.phone || null) === payload.phone &&
  (employee.address_street || null) === payload.address_street &&
  (employee.address_number || null) === payload.address_number &&
  (employee.address_locality || null) === payload.address_locality &&
  (employee.photo_url || null) === payload.photo_url &&
  (employee.code || null) === payload.code &&
  employee.active === payload.active;

const sameServiceIds = (leftIds, rightIds) => {
  const left = [...leftIds].map(String).sort();
  const right = [...rightIds].map(String).sort();

  return left.length === right.length && left.every((id, index) => id === right[index]);
};

const pad = (value) => String(value).padStart(2, '0');

const formatRequestDate = (value) => {
  if (!value) return 'Sin fecha';

  const date = new Date(value);
  return `${date.toLocaleDateString()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

const getAdminLoadError = (results) => {
  const failedResult = results.find((result) => result.error);
  return failedResult ? `${failedResult.label}: ${failedResult.error.message}` : null;
};

export default function AdminPanel({ view, onDataChanged }) {
  const [employees, setEmployees] = useState([]);
  const [services, setServices] = useState([]);
  const [employeeServices, setEmployeeServices] = useState([]);
  const [accessRequests, setAccessRequests] = useState([]);
  const [employeeForm, setEmployeeForm] = useState(emptyEmployee);
  const [serviceForm, setServiceForm] = useState(emptyService);
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');
  const emojiPickerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const activeServices = useMemo(
    () => services.filter((service) => service.active !== false),
    [services]
  );

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

    const [employeeResult, serviceResult, relationResult, accessResult] = await Promise.all([
      supabase.from('employees').select('*').is('deleted_at', null).order('name', { ascending: true }),
      supabase.from('services').select('*').order('id', { ascending: true }),
      supabase.from('employee_services').select('*'),
      view === 'employees'
        ? supabase.rpc('list_internal_registration_requests', { status_value: 'pending' })
        : Promise.resolve({ data: [], error: null })
    ]);

    const loadError = getAdminLoadError([
      { label: 'Empleados', error: employeeResult.error },
      { label: 'Actividades', error: serviceResult.error },
      { label: 'Relaciones empleado-actividad', error: relationResult.error },
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
    setAccessRequests(accessResult.data || []);
    setIsLoading(false);
  }, [view]);

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

  const editEmployee = (employee) => {
    setEditingEmployeeId(employee.id);
    setEmployeeForm({
      name: employee.name || '',
      first_name: employee.first_name || '',
      last_name: employee.last_name || '',
      birth_date: employee.birth_date || '',
      phone: employee.phone || '',
      address_street: employee.address_street || '',
      address_number: employee.address_number || '',
      address_locality: employee.address_locality || '',
      photo_url: employee.photo_url || '',
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

    const fullName = [employeeForm.first_name.trim(), employeeForm.last_name.trim()].filter(Boolean).join(' ');

    const payload = {
      name: employeeForm.name.trim() || fullName,
      first_name: employeeForm.first_name.trim() || null,
      last_name: employeeForm.last_name.trim() || null,
      birth_date: employeeForm.birth_date || null,
      phone: employeeForm.phone.trim() || null,
      address_street: employeeForm.address_street.trim() || null,
      address_number: employeeForm.address_number.trim() || null,
      address_locality: employeeForm.address_locality.trim() || null,
      photo_url: employeeForm.photo_url || null,
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
          .select('*')
          .single();

    if (employeeResult.error) {
      alert(`No se pudo guardar el empleado: ${employeeResult.error.message}`);
      setIsSaving(false);
      return;
    }

    const savedEmployee = editingEmployeeId
      ? await supabase
          .from('employees')
          .select('*')
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
      employee_id_value: employee.id
    });

    if (employeeResult.error) {
      alert(`No se pudo eliminar el empleado. ${employeeResult.error.message}`);
      return;
    }

    if (editingEmployeeId === employee.id) resetEmployeeForm();
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
          <form className="agenda-modal-card admin-form-card employee-form-card" onSubmit={saveEmployee}>
            <div className="agenda-modal-header">{editingEmployeeId ? 'Editar empleado' : 'Nuevo empleado'}</div>
            <div className="agenda-modal-body admin-form-grid">
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
                Usuario visible
                <input value={employeeForm.name} onChange={(event) => updateEmployeeField('name', event.target.value)} placeholder="Catatita" />
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
                <button className="agenda-close-button" type="submit" disabled={isSaving} aria-label={editingEmployeeId ? 'Guardar empleado' : 'Crear empleado'} title={editingEmployeeId ? 'Guardar empleado' : 'Crear empleado'}>
                  ✓
                </button>
                {editingEmployeeId && (
                  <button className="agenda-option-button" type="button" onClick={resetEmployeeForm} aria-label="Cancelar edición" title="Cancelar edición">
                    X
                  </button>
                )}
              </div>
            </div>
          </form>

          <div className="admin-list employee-record-list">
            {employees.map((employee) => (
              <article className={`admin-record-card admin-record-card-plain employee-record-card ${employee.active === false ? 'is-muted' : ''}`} key={employee.id}>
                <div className="admin-record-avatar" aria-hidden="true">
                  {employee.photo_url ? <img src={employee.photo_url} alt="" /> : (employee.name || 'E').slice(0, 1).toUpperCase()}
                </div>
                <div className="admin-record-main">
                  <div className="admin-record-title">{employee.name}</div>
                  <div className="admin-record-meta">{employee.code || 'Sin código'} · {employee.active === false ? 'Inactivo' : 'Activo'}</div>
                  <div className="admin-record-profile-line">
                    {employee.phone || 'Sin celular'}
                  </div>
                  <div className="admin-record-services">{getServiceNames(employee.id, employeeServices, services) || 'Sin actividades asignadas'}</div>
                </div>
                <div className="admin-record-actions">
                  <button className="agenda-close-button employee-list-action" type="button" onClick={() => editEmployee(employee)} aria-label="Editar empleado" title="Editar empleado">
                    <span className="employee-list-action-full">Editar</span>
                    <span className="employee-list-action-icon" aria-hidden="true">✏️</span>
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
      </section>
    );
  }

  return (
    <section className="admin-shell service-admin-manager">
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
        <form className="agenda-modal-card admin-form-card service-form-card" onSubmit={saveService}>
          <div className="agenda-modal-header">{editingServiceId ? 'Editar actividad' : 'Nueva actividad'}</div>
          <div className="agenda-modal-body admin-form-grid">
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
                                {icon}
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

            <label className="admin-switch-row">
              <input type="checkbox" checked={serviceForm.active} onChange={(event) => updateServiceField('active', event.target.checked)} />
              Actividad activa
            </label>

            <div className="admin-actions">
              <button className="agenda-close-button" type="submit" disabled={isSaving} aria-label={editingServiceId ? 'Guardar actividad' : 'Crear actividad'} title={editingServiceId ? 'Guardar actividad' : 'Crear actividad'}>
                ✓
              </button>
              {editingServiceId && (
                <button className="agenda-option-button" type="button" onClick={resetServiceForm} aria-label="Cancelar edición" title="Cancelar edición">
                  X
                </button>
              )}
            </div>
          </div>
        </form>

        <div className="admin-list service-record-list">
          {services.map((service) => (
            <article className={`admin-record-card service-record-card ${service.active === false ? 'is-muted' : ''}`} key={service.id}>
              <div className="admin-record-color" style={{ background: service.color || '#94a3b8' }} />
              <div className="admin-record-main">
                <div className="admin-record-title admin-record-title-icon"><ActivityIcon service={service} size="small" /> {service.name}</div>
                <div className="admin-record-meta">{service.default_duration || 30} min · {service.active === false ? 'Inactiva' : 'Activa'}</div>
                <div className="admin-record-services">{employeeServices.filter((relation) => Number(relation.service_id) === Number(service.id)).length} empleado(s) asignado(s)</div>
              </div>
              <div className="admin-record-actions">
                <button className="agenda-close-button" type="button" onClick={() => editService(service)} aria-label="Editar actividad" title="Editar actividad">
                  ✏️
                </button>
                <button className="agenda-option-button" type="button" onClick={() => toggleServiceStatus(service)} aria-label={service.active === false ? 'Activar actividad' : 'Desactivar actividad'} title={service.active === false ? 'Activar actividad' : 'Desactivar actividad'}>
                  {service.active === false ? '+' : '-'}
                </button>
                <button className="agenda-danger-button" type="button" onClick={() => deleteService(service)} aria-label="Eliminar actividad" title="Eliminar actividad">
                  X
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
