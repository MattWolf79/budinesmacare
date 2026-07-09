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
  is_admin: false,
  serviceIds: [],
  promotionIds: []
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

const normalizeUsernamePart = (value) =>
  normalizeComparableText(value).replace(/[^a-z0-9]/g, '');

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

const formatSupabaseError = (error) => [
  error.message,
  error.code ? `Código: ${error.code}` : '',
  error.details ? `Detalle: ${error.details}` : '',
  error.hint ? `Ayuda: ${error.hint}` : ''
].filter(Boolean).join('\n');

export default function AdminPanel({ view, user, onDataChanged }) {
  const [employees, setEmployees] = useState([]);
  const [services, setServices] = useState([]);
  const [employeeServices, setEmployeeServices] = useState([]);
  const [appConfig, setAppConfig] = useState(null);
  const [promotions, setPromotions] = useState([]);
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

  const activeServices = useMemo(
    () => services.filter((service) => service.active !== false),
    [services]
  );
  const enabledPromotions = useMemo(
    () => promotions.filter((promotion) => promotion?.enabled !== false && (promotion?.title || promotion?.description || promotion?.value)),
    [promotions]
  );
  const promotionServices = useMemo(
    () => enabledPromotions.map((promotion, index) => ({
      id: `promotion-${index}`,
      name: promotion.title || 'Promoción',
      icon: '✨',
      color: '#67e8f9',
      default_duration: 30,
      active: true,
      promotion
    })),
    [enabledPromotions]
  );

  const employeeUsernamePreview = useMemo(
    () => editingEmployeeId
      ? employeeForm.name
      : generateEmployeeUsername(employeeForm.first_name, employeeForm.last_name),
    [editingEmployeeId, employeeForm.first_name, employeeForm.last_name, employeeForm.name]
  );

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

    const [adminResult, configResult] = await Promise.all([
      supabase.rpc('get_admin_panel_data', {
        account_id_value: internalAdminAccountId,
        session_token_value: internalSessionToken,
        request_status_value: view === 'employees' ? 'pending' : null
      }),
      supabase.rpc('get_app_configuration')
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
    setAccessRequests(view === 'employees' ? data?.accessRequests || [] : []);
    setIsLoading(false);
  }, [internalAdminAccountId, internalSessionToken, view]);

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

  const editEmployee = (employee) => {
    setEditingEmployeeId(employee.id);
    setIsEmployeeFormOpen(true);
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
      banner_data_url_value: sourceConfig.banner_data_url || null,
      banner_file_name_value: sourceConfig.banner_file_name || null,
      banner_mime_type_value: sourceConfig.banner_mime_type || null,
      banner_images_value: Array.isArray(sourceConfig.banner_images) ? sourceConfig.banner_images : [],
      promotions_value: nextPromotions,
      client_can_choose_employee_value: Boolean(sourceConfig.client_can_choose_employee),
      account_id_value: internalAdminAccountId,
      session_token_value: internalSessionToken
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
      active: service.active !== false
    });
  };

  const saveEmployee = async (event) => {
    event.preventDefault();

    const fullName = [employeeForm.first_name.trim(), employeeForm.last_name.trim()].filter(Boolean).join(' ');

    const payload = {
      name: editingEmployeeId ? employeeForm.name.trim() : employeeUsernamePreview,
      first_name: employeeForm.first_name.trim() || null,
      last_name: employeeForm.last_name.trim() || null,
      birth_date: employeeForm.birth_date || null,
      phone: employeeForm.phone.trim() || null,
      address_street: employeeForm.address_street.trim() || null,
      address_number: employeeForm.address_number.trim() || null,
      address_locality: employeeForm.address_locality.trim() || null,
      photo_url: employeeForm.photo_url || null,
      code: employeeForm.code.trim() || null,
      active: editingEmployeeId ? employeeForm.active : true,
      is_admin: employeeForm.is_admin
    };

    if (!editingEmployeeId && (!payload.first_name || !payload.last_name)) {
      alert('Ingresá nombre y apellido para generar el usuario.');
      return;
    }

    if (!payload.name || (!editingEmployeeId && !fullName)) {
      alert('No se pudo generar el usuario del empleado.');
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
        address_street_value: payload.address_street,
        address_number_value: payload.address_number,
        address_locality_value: payload.address_locality,
        photo_url_value: payload.photo_url,
        code_value: payload.code,
        active_value: payload.active,
        is_admin_value: payload.is_admin,
        service_ids_value: employeeForm.serviceIds,
        account_id_value: adminAccountId,
        session_token_value: internalSessionToken
      })
      : await supabase.rpc('create_admin_employee', {
        name_value: payload.name,
        first_name_value: payload.first_name,
        last_name_value: payload.last_name,
        birth_date_value: payload.birth_date,
        phone_value: payload.phone,
        address_street_value: payload.address_street,
        address_number_value: payload.address_number,
        address_locality_value: payload.address_locality,
        photo_url_value: payload.photo_url,
        code_value: payload.code,
        service_ids_value: employeeForm.serviceIds,
        is_admin_value: payload.is_admin,
        account_id_value: adminAccountId,
        session_token_value: internalSessionToken
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

    const serviceResult = await supabase.rpc('save_admin_service', {
      service_id_value: editingServiceId,
      name_value: payload.name,
      icon_value: payload.icon,
      color_value: payload.color,
      default_duration_value: payload.default_duration,
      active_value: payload.active,
      account_id_value: internalAdminAccountId,
      session_token_value: internalSessionToken
    }).single();

    if (serviceResult.error) {
      alert(`No se pudo guardar la actividad: ${serviceResult.error.message}`);
      setIsSaving(false);
      return;
    }

    if (!serviceResult.data) {
      alert('No se pudo verificar el guardado: Supabase no devolvió la actividad.');
      setIsSaving(false);
      return;
    }

    if (!serviceMatchesPayload(serviceResult.data, payload)) {
      alert('Supabase recibió el pedido, pero no aplicó los cambios.');
      setIsSaving(false);
      return;
    }

    setServices((currentServices) => {
      if (editingServiceId) {
        return currentServices.map((service) =>
          String(service.id) === String(serviceResult.data.id) ? serviceResult.data : service
        );
      }

      return [...currentServices, serviceResult.data];
    });

    resetServiceForm();
    setIsServiceFormOpen(false);
    await loadAdminData();
    onDataChanged?.();
    setIsSaving(false);
  };

  const toggleServiceStatus = async (service) => {
    const nextActive = service.active === false;
    const { data: updatedService, error } = await supabase.rpc('save_admin_service', {
      service_id_value: service.id,
      name_value: service.name,
      icon_value: service.icon,
      color_value: service.color,
      default_duration_value: service.default_duration,
      active_value: nextActive,
      account_id_value: internalAdminAccountId,
      session_token_value: internalSessionToken
    }).single();

    if (error) {
      alert(`No se pudo cambiar el estado de la actividad: ${error.message}`);
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

    const serviceResult = await supabase.rpc('delete_admin_service', {
      service_id_value: service.id,
      account_id_value: internalAdminAccountId,
      session_token_value: internalSessionToken
    });

    if (serviceResult.error) {
      alert(`No se pudo eliminar la actividad. ${serviceResult.error.message}`);
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
            <p>Gestioná perfiles internos, actividades asignadas y datos de contacto.</p>
          </div>
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
            <span>Actividades</span>
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
          <form className="agenda-modal-card admin-form-card employee-form-card" onSubmit={saveEmployee}>
            <div className="agenda-modal-header admin-collapsible-form-header">
              <span>{editingEmployeeId ? 'Editar empleado' : 'Nuevo empleado'}</span>
              <button
                className="availability-form-toggle admin-collapsible-form-toggle"
                type="button"
                onClick={() => setIsEmployeeFormOpen((current) => !current)}
                aria-expanded={isEmployeeFormOpen}
                aria-label={isEmployeeFormOpen ? 'Ocultar formulario de empleado' : 'Mostrar formulario de empleado'}
              >
                &gt;
              </button>
            </div>
            <div className={`agenda-modal-body admin-form-grid admin-collapsible-form-body ${isEmployeeFormOpen ? 'is-open' : 'is-collapsed'}`}>
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

              <label>
                Código
                <input value={employeeForm.code} onChange={(event) => updateEmployeeField('code', event.target.value)} placeholder="M3" />
              </label>
              <label className="admin-switch-row">
                <input type="checkbox" checked={editingEmployeeId ? employeeForm.active : true} disabled={!editingEmployeeId} onChange={(event) => updateEmployeeField('active', event.target.checked)} />
                Empleado activo
              </label>
              <label className="admin-switch-row">
                <input type="checkbox" checked={employeeForm.is_admin} onChange={(event) => updateEmployeeField('is_admin', event.target.checked)} />
                Administrador
              </label>

              <div className="admin-fieldset">
                <div className="admin-fieldset-title">Actividades que atiende</div>
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
            </div>
          </form>

          <div className="admin-list employee-record-list employee-button-list">
            {employees.map((employee) => (
              <article className={`admin-record-card admin-record-card-plain employee-record-card ${employee.active === false ? 'is-muted' : ''}`} key={employee.id}>
                <div className="admin-record-avatar" aria-hidden="true">
                  {employee.photo_url ? <img src={employee.photo_url} alt="" /> : (employee.name || 'E').slice(0, 1).toUpperCase()}
                </div>
                <div className="admin-record-main">
                  <div className="admin-record-title">{employee.name}</div>
                  <div className="admin-record-meta">{employee.code || 'Sin código'} · {employee.active === false ? 'Inactivo' : 'Activo'} · {employee.is_admin ? 'Administrador' : 'Empleado'}</div>
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
      </section>
    );
  }

  return (
    <section className="admin-shell service-admin-manager">
      <div className="admin-page-heading">
        <div>
          <h1>Administración de actividades</h1>
          <p>Configurá servicios, colores y disponibilidad operativa.</p>
        </div>
        <button className="admin-link-button" type="button" onClick={loadAdminData}>
          Actualizar
        </button>
      </div>

      <div className="admin-metric-grid service-metric-grid" aria-label="Resumen de actividades">
        <article className="admin-metric-card">
          <span>Actividades</span>
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
          <small>Empleado por actividad.</small>
        </article>
      </div>

      <div className="admin-status-tabs service-status-tabs" aria-label="Estados de referencia">
        <span className="is-success">Activa</span>
        <span className="is-info">Editable</span>
        <span className="is-warning">Pausada</span>
        <span className="is-danger">Eliminable</span>
      </div>

      <div className="admin-hero service-legacy-heading">
        <div>
          <span className="admin-kicker">ABM</span>
          <h1>Actividades</h1>
        </div>
      </div>

      <div className="admin-layout">
        <form className="agenda-modal-card admin-form-card service-form-card" onSubmit={saveService}>
          <div className="agenda-modal-header admin-collapsible-form-header">
            <span>{editingServiceId ? 'Editar actividad' : 'Nueva actividad'}</span>
            <button
              className="availability-form-toggle admin-collapsible-form-toggle"
              type="button"
              onClick={() => setIsServiceFormOpen((current) => !current)}
              aria-expanded={isServiceFormOpen}
              aria-label={isServiceFormOpen ? 'Ocultar formulario de actividad' : 'Mostrar formulario de actividad'}
            >
              &gt;
            </button>
          </div>
          <div className={`agenda-modal-body admin-form-grid admin-collapsible-form-body ${isServiceFormOpen ? 'is-open' : 'is-collapsed'}`}>
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
                {editingServiceId ? 'Guardar' : 'Crear'}
              </button>
              {editingServiceId && (
                <button className="agenda-option-button" type="button" onClick={resetServiceForm} aria-label="Cancelar edición" title="Cancelar edición">
                  Limpiar
                </button>
              )}
            </div>
          </div>
        </form>

        <div className="admin-list service-record-list service-button-grid">
          {services.map((service) => (
            <article className={`admin-record-card service-record-card ${service.active === false ? 'is-muted' : ''}`} key={service.id}>
              <div className="admin-record-color" style={{ background: service.color || '#94a3b8' }} />
              <div className="admin-record-main">
                <div className="admin-record-title admin-record-title-icon"><ActivityIcon service={service} size="small" /> {service.name}</div>
                <div className="service-record-badges">
                  <span>{service.default_duration || 30} min</span>
                  <span className={service.active === false ? 'is-warning' : 'is-success'}>{service.active === false ? 'Pausada' : 'Activa'}</span>
                </div>
                <div className="admin-record-services">{employeeServices.filter((relation) => Number(relation.service_id) === Number(service.id)).length} empleado(s) asignado(s)</div>
              </div>
              <div className="admin-record-actions">
                <button className="agenda-close-button service-card-action" type="button" onClick={() => editService(service)} aria-label="Editar actividad" title="Editar actividad">
                  Editar
                </button>
                <button className="agenda-option-button service-card-action" type="button" onClick={() => toggleServiceStatus(service)} aria-label={service.active === false ? 'Activar actividad' : 'Desactivar actividad'} title={service.active === false ? 'Activar actividad' : 'Desactivar actividad'}>
                  {service.active === false ? 'Activar' : 'Pausar'}
                </button>
                <button className="agenda-danger-button service-card-action" type="button" onClick={() => deleteService(service)} aria-label="Eliminar actividad" title="Eliminar actividad">
                  Eliminar
                </button>
              </div>
            </article>
          ))}
          {promotionServices.map((promotionService) => (
            <article className="admin-record-card service-record-card promotion-record-card" key={promotionService.id}>
              <div className="admin-record-color" style={{ background: promotionService.color }} />
              <div className="admin-record-main">
                <div className="admin-record-title admin-record-title-icon"><ActivityIcon service={promotionService} size="small" /> {promotionService.name}</div>
                <div className="service-record-badges">
                  <span>Promo</span>
                  <span className="is-success">Activa</span>
                </div>
                <div className="admin-record-services">
                  {promotionService.promotion?.value || 'Sin valor cargado'} · Se administra desde Configuración
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
