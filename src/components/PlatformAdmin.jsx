import { useState } from 'react';
import { supabase } from '../api/supabaseClient';

const turnosAppLogo = '/logo-quieroturnoapp.png';

const initialLoginForm = {
  username: 'Admin',
  password: 'Admin'
};

const initialCompanyForm = {
  tipoEmpresa: 'turno_cobro',
  companyName: '',
  companySlug: '',
  adminUsername: '',
  adminFirstName: '',
  adminLastName: '',
  adminEmail: '',
  clientLogoDataUrl: '',
  clientLogoFileName: '',
  clientLogoMimeType: '',
  preciosHabilitados: true,
  descuentosHabilitados: true,
  recargosHabilitados: true,
  promocionesHabilitadas: true,
  turnosSuperpuestosHabilitados: true,
  intervaloGrillaMinutos: '30',
  empleadosPuedenReservar: true,
  empleadosVenAgendaCompleta: true,
  visibilidadTurnosEmpleado: 'completa',
  empleadosCancelanTurnos: 'propios',
  empleadosVenDetalleTurnos: 'propios',
  pdfDetalleTurnoHabilitado: false
};

const initialEditForm = {
  tipoEmpresa: 'turno_cobro',
  lookupSlug: '',
  companySlug: '',
  companyName: '',
  clientLogoDataUrl: '',
  clientLogoFileName: '',
  clientLogoMimeType: '',
  preciosHabilitados: true,
  descuentosHabilitados: true,
  recargosHabilitados: true,
  promocionesHabilitadas: true,
  sucursalesHabilitadas: false,
  packsHabilitados: false,
  turnosSuperpuestosHabilitados: true,
  intervaloGrillaMinutos: '30',
  empleadosPuedenReservar: true,
  empleadosVenAgendaCompleta: true,
  visibilidadTurnosEmpleado: 'completa',
  empleadosCancelanTurnos: 'propios',
  empleadosVenDetalleTurnos: 'propios',
  pdfDetalleTurnoHabilitado: false,
  landingHabilitada: false,
  landingEtiqueta: '',
  landingTitulo: '',
  landingSubtitulo: '',
  landingDescripcion: '',
  landingCtaTexto: '',
  landingBeneficios: '',
  landingDireccion: '',
  landingTelefono: '',
  landingWhatsapp: '',
  landingInstagram: '',
  landingMostrarAccesoInterno: true,
  landingHeroImageDataUrl: '',
  landingHeroImageFileName: '',
  landingHeroImageMimeType: ''
};

const initialResetForm = {
  companySlug: '',
  adminUsername: ''
};

const platformSections = [
  { id: 'setup', label: 'Crear empresa', shortLabel: 'Crear', icon: '＋' },
  { id: 'edit', label: 'Configuración operativa', shortLabel: 'Config', icon: '⚙' },
  { id: 'maintenance', label: 'Mantenimiento', shortLabel: 'Mant.', icon: '↺' }
];

const tiposEmpresa = [
  { id: 'turno_cobro', label: 'Empresa Turno Cobro' },
  { id: 'turno_sin_cobro', label: 'Empresa Turno Sin Cobro' },
  { id: 'pedido_cobro', label: 'Empresa Pedido Cobro' },
  { id: 'pedido_sin_cobro', label: 'Empresa Pedido Sin Cobro' }
];

const presetsTipoEmpresa = {
  turno_cobro: {
    preciosHabilitados: true,
    descuentosHabilitados: true,
    recargosHabilitados: true,
    promocionesHabilitadas: true,
    turnosSuperpuestosHabilitados: true,
    intervaloGrillaMinutos: '30',
    empleadosPuedenReservar: true,
    visibilidadTurnosEmpleado: 'completa',
    empleadosCancelanTurnos: 'propios',
    empleadosVenDetalleTurnos: 'propios'
  },
  turno_sin_cobro: {
    preciosHabilitados: false,
    descuentosHabilitados: false,
    recargosHabilitados: false,
    promocionesHabilitadas: true,
    turnosSuperpuestosHabilitados: true,
    intervaloGrillaMinutos: '30',
    empleadosPuedenReservar: true,
    visibilidadTurnosEmpleado: 'completa',
    empleadosCancelanTurnos: 'propios',
    empleadosVenDetalleTurnos: 'propios'
  },
  pedido_cobro: {
    preciosHabilitados: true,
    descuentosHabilitados: true,
    recargosHabilitados: true,
    promocionesHabilitadas: true,
    turnosSuperpuestosHabilitados: false,
    intervaloGrillaMinutos: '30',
    empleadosPuedenReservar: true,
    visibilidadTurnosEmpleado: 'solo_propios',
    empleadosCancelanTurnos: 'propios',
    empleadosVenDetalleTurnos: 'propios',
    pdfDetalleTurnoHabilitado: false
  },
  pedido_sin_cobro: {
    preciosHabilitados: false,
    descuentosHabilitados: false,
    recargosHabilitados: false,
    promocionesHabilitadas: true,
    turnosSuperpuestosHabilitados: false,
    intervaloGrillaMinutos: '30',
    empleadosPuedenReservar: true,
    visibilidadTurnosEmpleado: 'solo_propios',
    empleadosCancelanTurnos: 'propios',
    empleadosVenDetalleTurnos: 'propios',
    pdfDetalleTurnoHabilitado: false
  }
};

const obtenerModoOperacionDesdeTipoEmpresa = (tipoEmpresa) => (
  String(tipoEmpresa || '').startsWith('pedido_') ? 'pedido' : 'turno'
);

const obtenerUsoAgendaDesdeTipoEmpresa = (tipoEmpresa) => !String(tipoEmpresa || '').startsWith('pedido_');

const aplicarPresetTipoEmpresa = (formulario, tipoEmpresa) => {
  const preset = presetsTipoEmpresa[tipoEmpresa];
  if (!preset) return { ...formulario, tipoEmpresa };

  return {
    ...formulario,
    tipoEmpresa,
    ...preset
  };
};

const esTipoPedido = (tipoEmpresa) => obtenerModoOperacionDesdeTipoEmpresa(tipoEmpresa) === 'pedido';

const resolverTipoEmpresaDesdeConfiguracion = (configuracionOperativa = {}) => {
  const usaPrecios = configuracionOperativa.precios_habilitados !== false;
  const modoOperacion = String(configuracionOperativa.modo_operacion || '').trim().toLowerCase();
  const usaAgenda = configuracionOperativa.usa_agenda !== false;

  if (usaAgenda === false) {
    return usaPrecios ? 'pedido_cobro' : 'pedido_sin_cobro';
  }

  if (modoOperacion === 'pedido') {
    return usaPrecios ? 'pedido_cobro' : 'pedido_sin_cobro';
  }

  return usaPrecios ? 'turno_cobro' : 'turno_sin_cobro';
};

const Field = ({ label, children }) => (
  <label className="platform-field">
    <span>{label}</span>
    {children}
  </label>
);

const CheckField = ({ label, checked, onChange, disabled = false, disabledHint = '' }) => (
  <label className="platform-check-field">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} title={disabledHint || undefined} />
    <span>{label}</span>
    {disabled && disabledHint && <small>{disabledHint}</small>}
  </label>
);

const ConfigSection = ({ title, children }) => (
  <div className="platform-config-section">
    <p>{title}</p>
    <div className="platform-form-grid">{children}</div>
  </div>
);

const getTipoEmpresaSummary = (tipoEmpresa) => {
  const modoPedido = esTipoPedido(tipoEmpresa);
  const conCobro = String(tipoEmpresa || '').endsWith('_cobro');

  return {
    aplica: [
      modoPedido ? 'Flujo de pedidos (sin grilla horaria).' : 'Flujo de turnos con agenda horaria.',
      conCobro ? 'Cobros activos (precios y valor monetario).' : 'Operación sin cobros.'
    ],
    noAplica: [
      modoPedido ? 'Turnos superpuestos.' : 'N/A',
      modoPedido ? 'PDF detalle de turno.' : 'N/A',
      modoPedido ? 'Bloque de grilla y visibilidad de agenda.' : 'N/A',
      conCobro ? 'N/A' : 'Descuentos y recargos.'
    ].filter((item) => item !== 'N/A')
  };
};

const getConfigPayload = (form) => ({
  modo_operacion_valor: obtenerModoOperacionDesdeTipoEmpresa(form.tipoEmpresa),
  usa_agenda_valor: obtenerUsoAgendaDesdeTipoEmpresa(form.tipoEmpresa),
  precios_habilitados_valor: Boolean(form.preciosHabilitados),
  descuentos_habilitados_valor: Boolean(form.preciosHabilitados) ? Boolean(form.descuentosHabilitados) : false,
  recargos_habilitados_valor: Boolean(form.preciosHabilitados) ? Boolean(form.recargosHabilitados) : false,
  promociones_habilitadas_valor: Boolean(form.promocionesHabilitadas),
  sucursales_habilitadas_valor: Boolean(form.sucursalesHabilitadas),
  packs_habilitados_valor: Boolean(form.packsHabilitados),
  turnos_superpuestos_habilitados_valor: esTipoPedido(form.tipoEmpresa) ? false : Boolean(form.turnosSuperpuestosHabilitados),
  intervalo_grilla_minutos_valor: esTipoPedido(form.tipoEmpresa) ? 30 : (Number(form.intervaloGrillaMinutos) || 30),
  empleados_pueden_reservar_valor: Boolean(form.empleadosPuedenReservar),
  empleados_ven_agenda_completa_valor: esTipoPedido(form.tipoEmpresa) ? false : form.visibilidadTurnosEmpleado !== 'solo_propios',
  visibilidad_turnos_empleado_valor: esTipoPedido(form.tipoEmpresa) ? 'solo_propios' : (form.visibilidadTurnosEmpleado || 'completa'),
  empleados_cancelan_turnos_valor: form.empleadosCancelanTurnos || 'propios',
  empleados_ven_detalle_turnos_valor: form.empleadosVenDetalleTurnos || 'propios',
  pdf_detalle_turno_habilitado_valor: esTipoPedido(form.tipoEmpresa) ? false : Boolean(form.pdfDetalleTurnoHabilitado)
});

const buildLandingConfig = (form) => {
  const beneficios = String(form.landingBeneficios || '')
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item !== '')
    .slice(0, 4);

  return {
    habilitada: Boolean(form.landingHabilitada),
    etiqueta: String(form.landingEtiqueta || '').trim(),
    titulo: String(form.landingTitulo || '').trim(),
    subtitulo: String(form.landingSubtitulo || '').trim(),
    descripcion: String(form.landingDescripcion || '').trim(),
    cta_texto: String(form.landingCtaTexto || '').trim(),
    beneficios,
    direccion: String(form.landingDireccion || '').trim(),
    telefono: String(form.landingTelefono || '').trim(),
    whatsapp: String(form.landingWhatsapp || '').trim(),
    instagram: String(form.landingInstagram || '').trim().replace(/^@+/, ''),
    mostrar_acceso_interno: form.landingMostrarAccesoInterno !== false,
    hero_image_data_url: form.landingHeroImageDataUrl || '',
    hero_image_file_name: form.landingHeroImageFileName || '',
    hero_image_mime_type: form.landingHeroImageMimeType || ''
  };
};

const applyLandingConfig = (landing) => {
  const config = landing || {};
  const beneficios = Array.isArray(config.beneficios) ? config.beneficios.join('\n') : '';

  return {
    landingHabilitada: config.habilitada === true,
    landingEtiqueta: config.etiqueta || '',
    landingTitulo: config.titulo || '',
    landingSubtitulo: config.subtitulo || '',
    landingDescripcion: config.descripcion || '',
    landingCtaTexto: config.cta_texto || '',
    landingBeneficios: beneficios,
    landingDireccion: config.direccion || '',
    landingTelefono: config.telefono || '',
    landingWhatsapp: config.whatsapp || '',
    landingInstagram: config.instagram || '',
    landingMostrarAccesoInterno: config.mostrar_acceso_interno !== false,
    landingHeroImageDataUrl: config.hero_image_data_url || '',
    landingHeroImageFileName: config.hero_image_file_name || '',
    landingHeroImageMimeType: config.hero_image_mime_type || ''
  };
};

const applyConfigData = (data) => {
  const config = data?.configuracion_operativa || {};

  return {
    tipoEmpresa: resolverTipoEmpresaDesdeConfiguracion(config),
    lookupSlug: data?.company_slug || '',
    companySlug: data?.company_slug || '',
    companyName: data?.company_name || '',
    clientLogoDataUrl: data?.client_logo_data_url || '',
    clientLogoFileName: data?.client_logo_file_name || '',
    clientLogoMimeType: data?.client_logo_mime_type || '',
    preciosHabilitados: config.precios_habilitados !== false,
    descuentosHabilitados: config.descuentos_habilitados !== false,
    recargosHabilitados: config.recargos_habilitados !== false,
    promocionesHabilitadas: config.promociones_habilitadas !== false,
    sucursalesHabilitadas: config.sucursales_habilitadas === true,
    packsHabilitados: config.packs_habilitados === true,
    turnosSuperpuestosHabilitados: config.turnos_superpuestos_habilitados !== false,
    intervaloGrillaMinutos: String(config.intervalo_grilla_minutos || 30),
    empleadosPuedenReservar: config.empleados_pueden_reservar !== false,
    empleadosVenAgendaCompleta: (config.visibilidad_turnos_empleado || 'completa') !== 'solo_propios',
    visibilidadTurnosEmpleado: config.visibilidad_turnos_empleado || 'completa',
    empleadosCancelanTurnos: config.empleados_cancelan_turnos || 'propios',
    empleadosVenDetalleTurnos: config.empleados_ven_detalle_turnos || 'propios',
    pdfDetalleTurnoHabilitado: config.pdf_detalle_turno_habilitado === true,
    ...applyLandingConfig(data?.landing_config)
  };
};

const normalizeSlug = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, '');

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

export default function PlatformAdmin() {
  const [loginForm, setLoginForm] = useState(initialLoginForm);
  const [platformSession, setPlatformSession] = useState(null);
  const [platformCompanies, setPlatformCompanies] = useState([]);
  const [companyForm, setCompanyForm] = useState(initialCompanyForm);
  const [editForm, setEditForm] = useState(initialEditForm);
  const [resetForm, setResetForm] = useState(initialResetForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingCompany, setIsLoadingCompany] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [activeSection, setActiveSection] = useState('setup');
  const modoPedidoAlta = esTipoPedido(companyForm.tipoEmpresa);
  const modoPedidoEdicion = esTipoPedido(editForm.tipoEmpresa);
  const etiquetaOperacionAlta = modoPedidoAlta ? 'pedido' : 'turno';
  const etiquetaOperacionEdicion = modoPedidoEdicion ? 'pedido' : 'turno';
  const resumenAlta = getTipoEmpresaSummary(companyForm.tipoEmpresa);
  const resumenEdicion = getTipoEmpresaSummary(editForm.tipoEmpresa);

  const updateLoginField = (field, value) => {
    setLoginForm((current) => ({ ...current, [field]: value }));
  };

  const updateCompanyField = (field, value) => {
    if (field === 'tipoEmpresa') {
      setCompanyForm((current) => aplicarPresetTipoEmpresa(current, value));
      return;
    }

    setCompanyForm((current) => {
      const nextValue = field === 'companySlug' ? normalizeSlug(value) : value;
      const next = {
        ...current,
        [field]: nextValue
      };

      if (field === 'preciosHabilitados' && value === false) {
        next.descuentosHabilitados = false;
        next.recargosHabilitados = false;
      }

      return next;
    });
  };

  const updateEditField = (field, value) => {
    if (field === 'tipoEmpresa') {
      setEditForm((current) => aplicarPresetTipoEmpresa(current, value));
      return;
    }

    setEditForm((current) => {
      const nextValue = ['lookupSlug', 'companySlug'].includes(field) ? normalizeSlug(value) : value;
      const next = {
        ...current,
        [field]: nextValue
      };

      if (field === 'preciosHabilitados' && value === false) {
        next.descuentosHabilitados = false;
        next.recargosHabilitados = false;
      }

      return next;
    });
  };

  const changeLogo = async (event, setForm) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorMessage('El logo debe ser una imagen JPG, PNG o WEBP.');
      return;
    }

    if (file.size > 900 * 1024) {
      setErrorMessage('El logo no puede superar los 900 KB.');
      return;
    }

    const dataUrl = await fileToDataUrl(file);
    setForm((current) => ({
      ...current,
      clientLogoDataUrl: String(dataUrl || ''),
      clientLogoFileName: file.name,
      clientLogoMimeType: file.type
    }));
  };

  const changeCompanyLogo = (event) => changeLogo(event, setCompanyForm);

  const changeClientLogo = (event) => changeLogo(event, setEditForm);

  const removeLogo = (setForm) => {
    setForm((current) => ({
      ...current,
      clientLogoDataUrl: '',
      clientLogoFileName: '',
      clientLogoMimeType: ''
    }));
  };

  const removeCompanyLogo = () => removeLogo(setCompanyForm);

  const removeClientLogo = () => removeLogo(setEditForm);

  const changeLandingHero = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorMessage('La imagen de la landing debe ser JPG, PNG o WEBP.');
      return;
    }

    if (file.size > 1100 * 1024) {
      setErrorMessage('La imagen de la landing no puede superar los 1,1 MB.');
      return;
    }

    const dataUrl = await fileToDataUrl(file);
    setEditForm((current) => ({
      ...current,
      landingHeroImageDataUrl: String(dataUrl || ''),
      landingHeroImageFileName: file.name,
      landingHeroImageMimeType: file.type
    }));
  };

  const removeLandingHero = () => {
    setEditForm((current) => ({
      ...current,
      landingHeroImageDataUrl: '',
      landingHeroImageFileName: '',
      landingHeroImageMimeType: ''
    }));
  };

  const updateResetField = (field, value) => {
    setResetForm((current) => ({
      ...current,
      [field]: field === 'companySlug' ? normalizeSlug(value) : value
    }));
  };

  const loadPlatformCompanies = async (session = platformSession) => {
    if (!session) return;

    const { data, error } = await supabase.rpc('plataforma_listar_empresas', {
      cuenta_plataforma_id_valor: session.id,
      token_sesion_valor: session.sessionToken
    });

    if (error) {
      setErrorMessage(error.message || 'No se pudo cargar el listado de empresas.');
      return;
    }

    setPlatformCompanies(Array.isArray(data) ? data : []);
  };

  const submitLogin = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');
    setErrorMessage('');

    const { data, error } = await supabase.rpc('verify_platform_admin_login', {
      username_value: loginForm.username.trim(),
      password_value: loginForm.password
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message || 'No se pudo ingresar.');
      return;
    }

    const account = Array.isArray(data) ? data[0] : data;

    if (!account?.session_token) {
      setErrorMessage('No se pudo iniciar la sesión de plataforma.');
      return;
    }

    const nextSession = {
      id: account.id,
      username: account.username,
      displayName: account.display_name,
      sessionToken: account.session_token
    };

    setPlatformSession(nextSession);
    setLoginForm(initialLoginForm);
    await loadPlatformCompanies(nextSession);
  };

  const submitCompany = async (event) => {
    event.preventDefault();
    if (!platformSession) return;

    setIsSubmitting(true);
    setMessage('');
    setErrorMessage('');

    const { data, error } = await supabase.rpc('platform_create_company_admin', {
      platform_account_id_value: platformSession.id,
      session_token_value: platformSession.sessionToken,
      company_name_value: companyForm.companyName.trim(),
      company_slug_value: companyForm.companySlug.trim(),
      admin_username_value: companyForm.adminUsername.trim(),
      admin_first_name_value: companyForm.adminFirstName.trim() || null,
      admin_last_name_value: companyForm.adminLastName.trim() || null,
      admin_email_value: companyForm.adminEmail.trim().toLowerCase() || null,
      client_logo_data_url_valor: companyForm.clientLogoDataUrl || null,
      client_logo_file_name_valor: companyForm.clientLogoFileName || null,
      client_logo_mime_type_valor: companyForm.clientLogoMimeType || null,
      ...getConfigPayload(companyForm)
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message || 'No se pudo crear la empresa.');
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    setMessage(`Empresa creada: ${result.company_slug}. Admin: ${result.admin_username}. Password temporal: ${result.temporary_password}. URL: ${window.location.origin}/${result.company_slug}`);
    setCompanyForm(initialCompanyForm);
    await loadPlatformCompanies();
  };

  const loadCompanyConfig = async (event) => {
    event.preventDefault();
    if (!platformSession) return;

    setIsLoadingCompany(true);
    setMessage('');
    setErrorMessage('');

    const { data, error } = await supabase.rpc('plataforma_obtener_configuracion_empresa', {
      cuenta_plataforma_id_valor: platformSession.id,
      token_sesion_valor: platformSession.sessionToken,
      slug_empresa_valor: editForm.lookupSlug.trim()
    });

    setIsLoadingCompany(false);

    if (error) {
      setErrorMessage(error.message || 'No se pudo cargar la empresa.');
      return;
    }

    setEditForm(applyConfigData(data));
    setMessage(`Configuración cargada para ${data.company_slug}.`);
  };

  const submitEditCompany = async (event) => {
    event.preventDefault();
    if (!platformSession) return;

    setIsSubmitting(true);
    setMessage('');
    setErrorMessage('');

    const { data, error } = await supabase.rpc('plataforma_actualizar_configuracion_empresa', {
      cuenta_plataforma_id_valor: platformSession.id,
      token_sesion_valor: platformSession.sessionToken,
      slug_empresa_valor: editForm.lookupSlug.trim(),
      slug_url_valor: editForm.companySlug.trim(),
      client_logo_data_url_valor: editForm.clientLogoDataUrl || null,
      client_logo_file_name_valor: editForm.clientLogoFileName || null,
      client_logo_mime_type_valor: editForm.clientLogoMimeType || null,
      landing_config_valor: buildLandingConfig(editForm),
      ...getConfigPayload(editForm)
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message || 'No se pudo modificar la empresa.');
      return;
    }

    setEditForm(initialEditForm);
    setMessage(`Configuración actualizada para ${data.company_slug}. URL: ${window.location.origin}/${data.company_slug}`);
    await loadPlatformCompanies();
  };

  const submitReset = async (event) => {
    event.preventDefault();
    if (!platformSession) return;

    setIsSubmitting(true);
    setMessage('');
    setErrorMessage('');

    const { data, error } = await supabase.rpc('platform_reset_company_admin_password', {
      platform_account_id_value: platformSession.id,
      session_token_value: platformSession.sessionToken,
      company_slug_value: resetForm.companySlug.trim(),
      admin_username_value: resetForm.adminUsername.trim()
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message || 'No se pudo blanquear la contraseña.');
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    setMessage(`Password blanqueada para ${result.admin_username}. Password temporal: ${result.temporary_password}.`);
    setResetForm(initialResetForm);
  };

  const logout = () => {
    setPlatformSession(null);
    setPlatformCompanies([]);
    setMessage('');
    setErrorMessage('');
  };

  if (!platformSession) {
    return (
      <main className="login-page platform-admin-page">
        <section className="login-card platform-admin-card">
          <p className="login-kicker">Administración plataforma</p>
          <img className="login-brand-mark" src="/logo-quieroturnoapp.png" alt="QuieroTurnoApp" />
          <h1 className="login-brand-heading">QuieroTurnoApp</h1>
          <p className="login-copy">Acceso interno para crear empresas y administradores iniciales.</p>

          <form className="platform-admin-form" onSubmit={submitLogin}>
            <label>
              Usuario
              <input value={loginForm.username} onChange={(event) => updateLoginField('username', event.target.value)} autoComplete="username" required />
            </label>
            <label>
              Password
              <input type="password" value={loginForm.password} onChange={(event) => updateLoginField('password', event.target.value)} autoComplete="current-password" required />
            </label>
            {errorMessage && <p className="platform-admin-error">{errorMessage}</p>}
            <button className="login-google-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Ingresando...' : 'Ingresar'}</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="platform-admin-workspace">
      <header className="platform-admin-header">
        <div className="platform-admin-brand">
          <img className="app-navbar-logo" src={turnosAppLogo} alt="QuieroTurnoApp - Plataforma" />
        </div>
        <div className="platform-admin-heading">
          <p>Administración plataforma</p>
          <h1>Empresas</h1>
          <span>Alta de empresas, administradores iniciales y blanqueo de accesos.</span>
        </div>
        <nav className="platform-admin-nav" aria-label="Secciones plataforma">
          {platformSections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`platform-admin-nav-button ${activeSection === section.id ? 'is-active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <span aria-hidden="true">{section.icon}</span>
              {section.label}
            </button>
          ))}
        </nav>
        <button className="app-navbar-logout" type="button" onClick={logout}>Salir</button>
      </header>

      {message && <p className="platform-admin-success">{message}</p>}
      {errorMessage && <p className="platform-admin-error">{errorMessage}</p>}

      <section className="platform-admin-shell">
        {activeSection === 'setup' && (
          <form className="platform-admin-panel platform-admin-panel-single" onSubmit={submitCompany}>
            <div className="platform-panel-heading">
              <p>Configuración inicial</p>
              <h2>Nueva empresa</h2>
            </div>
              <div className="platform-form-grid">
                <Field label="Tipo de empresa">
                  <select value={companyForm.tipoEmpresa} onChange={(event) => updateCompanyField('tipoEmpresa', event.target.value)}>
                    {tiposEmpresa.map((tipo) => (
                      <option key={tipo.id} value={tipo.id}>{tipo.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Nombre de empresa">
                <input value={companyForm.companyName} onChange={(event) => updateCompanyField('companyName', event.target.value)} placeholder="Jardin Masajes" required />
                </Field>
                <Field label="Slug URL">
                <input value={companyForm.companySlug} onChange={(event) => updateCompanyField('companySlug', event.target.value)} placeholder="jardinmasaje" required />
                </Field>
                <Field label="Usuario administrador">
                <input value={companyForm.adminUsername} onChange={(event) => updateCompanyField('adminUsername', event.target.value)} placeholder="adminjardin" required />
                </Field>
                <Field label="Nombre admin">
                <input value={companyForm.adminFirstName} onChange={(event) => updateCompanyField('adminFirstName', event.target.value)} placeholder="Nombre" />
                </Field>
                <Field label="Apellido admin">
                <input value={companyForm.adminLastName} onChange={(event) => updateCompanyField('adminLastName', event.target.value)} placeholder="Apellido" />
                </Field>
                <Field label="Email admin">
                <input type="email" value={companyForm.adminEmail} onChange={(event) => updateCompanyField('adminEmail', event.target.value)} placeholder="admin@empresa.com" />
                </Field>
              </div>
              <div className="platform-config-block">
                <ConfigSection title="Portal cliente">
                  <div className="platform-logo-upload">
                    <label className="platform-field">
                      <span>Logo Sacar turno</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={changeCompanyLogo} />
                    </label>
                    {companyForm.clientLogoDataUrl ? (
                      <div className="platform-logo-preview">
                        <img src={companyForm.clientLogoDataUrl} alt="Logo configurado para Sacar turno" />
                        <div>
                          <strong>{companyForm.clientLogoFileName || 'Logo cargado'}</strong>
                          <button className="platform-button-secondary" type="button" onClick={removeCompanyLogo}>Quitar logo</button>
                        </div>
                      </div>
                    ) : <p className="platform-company-loaded">Si no se carga un logo, se usa QuieroTurnoApp.</p>}
                  </div>
                </ConfigSection>
              </div>
              <div className="platform-config-block">
                <div className="platform-panel-heading">
                  <p>Modo operativo</p>
                  <h2>Agenda y permisos</h2>
                </div>
                <div className="platform-company-loaded">
                  <strong>Resumen del tipo seleccionado</strong>
                  <p>Aplica: {resumenAlta.aplica.join(' ')}</p>
                  {resumenAlta.noAplica.length > 0 && <p>No aplica: {resumenAlta.noAplica.join(' ')}</p>}
                </div>
                <ConfigSection title="Sistema">
                  <CheckField label="Usa precios en el sistema" checked={companyForm.preciosHabilitados} onChange={(value) => updateCompanyField('preciosHabilitados', value)} />
                  <CheckField label="Habilita descuentos" checked={companyForm.descuentosHabilitados} onChange={(value) => updateCompanyField('descuentosHabilitados', value)} disabled={!companyForm.preciosHabilitados} disabledHint="Requiere precios habilitados." />
                  <CheckField label="Habilita recargos" checked={companyForm.recargosHabilitados} onChange={(value) => updateCompanyField('recargosHabilitados', value)} disabled={!companyForm.preciosHabilitados} disabledHint="Requiere precios habilitados." />
                  <CheckField label="Habilita promociones" checked={companyForm.promocionesHabilitadas} onChange={(value) => updateCompanyField('promocionesHabilitadas', value)} />
                  <CheckField label="Permite turnos superpuestos" checked={companyForm.turnosSuperpuestosHabilitados} onChange={(value) => updateCompanyField('turnosSuperpuestosHabilitados', value)} disabled={modoPedidoAlta} disabledHint="No aplica en empresas de pedido." />
                  <CheckField label="Habilita PDF de detalle de turno" checked={companyForm.pdfDetalleTurnoHabilitado} onChange={(value) => updateCompanyField('pdfDetalleTurnoHabilitado', value)} disabled={modoPedidoAlta} disabledHint="No aplica en empresas de pedido." />
                </ConfigSection>
                <ConfigSection title="Agenda">
                  <Field label="Bloque de grilla">
                    <select value={companyForm.intervaloGrillaMinutos} onChange={(event) => updateCompanyField('intervaloGrillaMinutos', event.target.value)} disabled={modoPedidoAlta} title={modoPedidoAlta ? 'No aplica en empresas de pedido.' : undefined}>
                      <option value="15">15 minutos</option>
                      <option value="30">30 minutos</option>
                      <option value="45">45 minutos</option>
                      <option value="60">60 minutos</option>
                    </select>
                  </Field>
                  <Field label="Visibilidad empleado">
                    <select value={companyForm.visibilidadTurnosEmpleado} onChange={(event) => updateCompanyField('visibilidadTurnosEmpleado', event.target.value)} disabled={modoPedidoAlta} title={modoPedidoAlta ? 'No aplica en empresas de pedido.' : undefined}>
                      <option value="completa">Completa</option>
                      <option value="cliente_servicio">Cliente/Servicio</option>
                      <option value="solo_ocupado">Solo ocupado</option>
                      <option value="cliente_sin_empleado">Cliente sin empleado</option>
                      <option value="solo_propios">Solo sus turnos</option>
                    </select>
                  </Field>
                  {modoPedidoAlta && <p className="platform-company-loaded">En modo pedido no se usa grilla horaria ni visibilidad de agenda.</p>}
                </ConfigSection>
                <ConfigSection title="Permisos empleado">
                  <CheckField label={`Pueden crear ${etiquetaOperacionAlta}s`} checked={companyForm.empleadosPuedenReservar} onChange={(value) => updateCompanyField('empleadosPuedenReservar', value)} />
                  <Field label={`Cancelan ${etiquetaOperacionAlta}s`}>
                    <select value={companyForm.empleadosCancelanTurnos} onChange={(event) => updateCompanyField('empleadosCancelanTurnos', event.target.value)}>
                      <option value="propios">Propios</option>
                      <option value="todos">Todos</option>
                      <option value="ninguno">Ninguno</option>
                    </select>
                  </Field>
                  <Field label={`Ven detalle de ${etiquetaOperacionAlta}`}>
                    <select value={companyForm.empleadosVenDetalleTurnos} onChange={(event) => updateCompanyField('empleadosVenDetalleTurnos', event.target.value)}>
                      <option value="propios">Propios</option>
                      <option value="todos">Todos</option>
                      <option value="ninguno">Ninguno</option>
                    </select>
                  </Field>
                </ConfigSection>
              </div>
              <div className="platform-action-row platform-action-row-end">
                <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Crear empresa'}</button>
              </div>
            </form>
        )}

        {activeSection === 'edit' && (
          <form className="platform-admin-panel platform-admin-panel-single" onSubmit={submitEditCompany}>
            <div className="platform-panel-heading">
              <p>Modificar empresa</p>
              <h2>Configuración operativa</h2>
            </div>
              <div className="platform-load-row">
                <Field label="Empresa">
                  <select value={editForm.lookupSlug} onChange={(event) => updateEditField('lookupSlug', event.target.value)} required>
                    <option value="">Seleccionar empresa</option>
                    {platformCompanies.map((company) => (
                      <option key={company.company_id || company.company_slug} value={company.company_slug}>
                        {company.company_name} ({company.company_slug})
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="platform-load-button-wrap" aria-hidden="true">
                  <span className="platform-load-button-label" aria-hidden="true">&nbsp;</span>
                  <button className="platform-button-secondary platform-load-button" type="button" disabled={isLoadingCompany || isSubmitting || !editForm.lookupSlug} onClick={loadCompanyConfig}>{isLoadingCompany ? 'Cargando...' : 'Cargar'}</button>
                </div>
              </div>
              {editForm.companyName && <p className="platform-company-loaded">Empresa: {editForm.companyName}</p>}
              <Field label="Tipo de empresa">
                <select value={editForm.tipoEmpresa} onChange={(event) => updateEditField('tipoEmpresa', event.target.value)}>
                  {tiposEmpresa.map((tipo) => (
                    <option key={tipo.id} value={tipo.id}>{tipo.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Slug URL">
                <input value={editForm.companySlug} onChange={(event) => updateEditField('companySlug', event.target.value)} placeholder="verificacion" required />
              </Field>
              <div className="platform-config-block platform-config-block-compact">
                <ConfigSection title="Portal cliente">
                  <div className="platform-logo-upload">
                    <label className="platform-field">
                      <span>Logo Sacar turno</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={changeClientLogo} />
                    </label>
                    {editForm.clientLogoDataUrl ? (
                      <div className="platform-logo-preview">
                        <img src={editForm.clientLogoDataUrl} alt="Logo configurado para Sacar turno" />
                        <div>
                          <strong>{editForm.clientLogoFileName || 'Logo cargado'}</strong>
                          <button className="platform-button-secondary" type="button" onClick={removeClientLogo}>Quitar logo</button>
                        </div>
                      </div>
                    ) : <p className="platform-company-loaded">Si no se carga un logo, se usa QuieroTurnoApp.</p>}
                  </div>
                </ConfigSection>
              </div>
              <div className="platform-config-block platform-config-block-compact">
                <ConfigSection title="Landing pública (/{slug})">
                  <CheckField label="Mostrar landing en la URL de la empresa" checked={editForm.landingHabilitada} onChange={(value) => updateEditField('landingHabilitada', value)} />
                  <CheckField label="Mostrar accesos Empleado y Admin en la landing" checked={editForm.landingMostrarAccesoInterno} onChange={(value) => updateEditField('landingMostrarAccesoInterno', value)} />
                  <Field label="Etiqueta superior (opcional)">
                    <input value={editForm.landingEtiqueta} onChange={(event) => updateEditField('landingEtiqueta', event.target.value)} placeholder="Ej: Reservá online · Vacío = oculta" />
                  </Field>
                  <Field label="Título del hero">
                    <input value={editForm.landingTitulo} onChange={(event) => updateEditField('landingTitulo', event.target.value)} placeholder="Reservá tu turno en..." />
                  </Field>
                  <Field label="Subtítulo destacado">
                    <input value={editForm.landingSubtitulo} onChange={(event) => updateEditField('landingSubtitulo', event.target.value)} placeholder="Tu agenda, siempre a un clic" />
                  </Field>
                  <Field label="Descripción">
                    <textarea rows={2} value={editForm.landingDescripcion} onChange={(event) => updateEditField('landingDescripcion', event.target.value)} placeholder="Elegí el servicio, el día y el horario..." />
                  </Field>
                  <Field label="Texto del botón principal">
                    <input value={editForm.landingCtaTexto} onChange={(event) => updateEditField('landingCtaTexto', event.target.value)} placeholder="Reservá tu turno" />
                  </Field>
                  <Field label="Beneficios (uno por línea, máx 4)">
                    <textarea rows={4} value={editForm.landingBeneficios} onChange={(event) => updateEditField('landingBeneficios', event.target.value)} placeholder={'Reservá online 24/7\nRecordatorios automáticos\nSin llamados ni esperas'} />
                  </Field>
                  <Field label="Dirección">
                    <input value={editForm.landingDireccion} onChange={(event) => updateEditField('landingDireccion', event.target.value)} placeholder="Av. Siempre Viva 123" />
                  </Field>
                  <Field label="Teléfono">
                    <input value={editForm.landingTelefono} onChange={(event) => updateEditField('landingTelefono', event.target.value)} placeholder="+54 11 5555-5555" />
                  </Field>
                  <Field label="WhatsApp (número)">
                    <input value={editForm.landingWhatsapp} onChange={(event) => updateEditField('landingWhatsapp', event.target.value)} placeholder="5491155555555" />
                  </Field>
                  <Field label="Instagram (usuario)">
                    <input value={editForm.landingInstagram} onChange={(event) => updateEditField('landingInstagram', event.target.value)} placeholder="miempresa" />
                  </Field>
                  <div className="platform-logo-upload">
                    <label className="platform-field">
                      <span>Imagen de fondo del hero</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={changeLandingHero} />
                    </label>
                    {editForm.landingHeroImageDataUrl ? (
                      <div className="platform-logo-preview">
                        <img src={editForm.landingHeroImageDataUrl} alt="Imagen de fondo de la landing" />
                        <div>
                          <strong>{editForm.landingHeroImageFileName || 'Imagen cargada'}</strong>
                          <button className="platform-button-secondary" type="button" onClick={removeLandingHero}>Quitar imagen</button>
                        </div>
                      </div>
                    ) : <p className="platform-company-loaded">Sin imagen se usa un fondo oscuro con dorado.</p>}
                  </div>
                </ConfigSection>
              </div>
              <div className="platform-config-block platform-config-block-compact">
                <div className="platform-company-loaded">
                  <strong>Resumen del tipo seleccionado</strong>
                  <p>Aplica: {resumenEdicion.aplica.join(' ')}</p>
                  {resumenEdicion.noAplica.length > 0 && <p>No aplica: {resumenEdicion.noAplica.join(' ')}</p>}
                </div>
                <ConfigSection title="Sistema">
                  <CheckField label="Usa precios en el sistema" checked={editForm.preciosHabilitados} onChange={(value) => updateEditField('preciosHabilitados', value)} />
                  <CheckField label="Habilita descuentos" checked={editForm.descuentosHabilitados} onChange={(value) => updateEditField('descuentosHabilitados', value)} disabled={!editForm.preciosHabilitados} disabledHint="Requiere precios habilitados." />
                  <CheckField label="Habilita recargos" checked={editForm.recargosHabilitados} onChange={(value) => updateEditField('recargosHabilitados', value)} disabled={!editForm.preciosHabilitados} disabledHint="Requiere precios habilitados." />
                  <CheckField label="Habilita promociones" checked={editForm.promocionesHabilitadas} onChange={(value) => updateEditField('promocionesHabilitadas', value)} />
                  <CheckField label="Habilita multi-sucursal" checked={editForm.sucursalesHabilitadas} onChange={(value) => updateEditField('sucursalesHabilitadas', value)} />
                  <CheckField label="Habilita packs" checked={editForm.packsHabilitados} onChange={(value) => updateEditField('packsHabilitados', value)} />
                  <CheckField label="Permite turnos superpuestos" checked={editForm.turnosSuperpuestosHabilitados} onChange={(value) => updateEditField('turnosSuperpuestosHabilitados', value)} disabled={modoPedidoEdicion} disabledHint="No aplica en empresas de pedido." />
                  <CheckField label="Habilita PDF de detalle de turno" checked={editForm.pdfDetalleTurnoHabilitado} onChange={(value) => updateEditField('pdfDetalleTurnoHabilitado', value)} disabled={modoPedidoEdicion} disabledHint="No aplica en empresas de pedido." />
                </ConfigSection>
                <ConfigSection title="Agenda">
                  <Field label="Bloque de grilla">
                    <select value={editForm.intervaloGrillaMinutos} onChange={(event) => updateEditField('intervaloGrillaMinutos', event.target.value)} disabled={modoPedidoEdicion} title={modoPedidoEdicion ? 'No aplica en empresas de pedido.' : undefined}>
                      <option value="15">15 minutos</option>
                      <option value="30">30 minutos</option>
                      <option value="45">45 minutos</option>
                      <option value="60">60 minutos</option>
                    </select>
                  </Field>
                  <Field label="Visibilidad empleado">
                    <select value={editForm.visibilidadTurnosEmpleado} onChange={(event) => updateEditField('visibilidadTurnosEmpleado', event.target.value)} disabled={modoPedidoEdicion} title={modoPedidoEdicion ? 'No aplica en empresas de pedido.' : undefined}>
                      <option value="completa">Completa</option>
                      <option value="cliente_servicio">Cliente/Servicio</option>
                      <option value="solo_ocupado">Solo ocupado</option>
                      <option value="cliente_sin_empleado">Cliente sin empleado</option>
                      <option value="solo_propios">Solo sus turnos</option>
                    </select>
                  </Field>
                  {modoPedidoEdicion && <p className="platform-company-loaded">En modo pedido no se usa grilla horaria ni visibilidad de agenda.</p>}
                </ConfigSection>
                <ConfigSection title="Permisos empleado">
                  <CheckField label={`Pueden crear ${etiquetaOperacionEdicion}s`} checked={editForm.empleadosPuedenReservar} onChange={(value) => updateEditField('empleadosPuedenReservar', value)} />
                  <Field label={`Cancelan ${etiquetaOperacionEdicion}s`}>
                    <select value={editForm.empleadosCancelanTurnos} onChange={(event) => updateEditField('empleadosCancelanTurnos', event.target.value)}>
                      <option value="propios">Propios</option>
                      <option value="todos">Todos</option>
                      <option value="ninguno">Ninguno</option>
                    </select>
                  </Field>
                  <Field label={`Ven detalle de ${etiquetaOperacionEdicion}`}>
                    <select value={editForm.empleadosVenDetalleTurnos} onChange={(event) => updateEditField('empleadosVenDetalleTurnos', event.target.value)}>
                      <option value="propios">Propios</option>
                      <option value="todos">Todos</option>
                      <option value="ninguno">Ninguno</option>
                    </select>
                  </Field>
                </ConfigSection>
              </div>
              <div className="platform-action-row platform-action-row-end">
                <button type="submit" disabled={isSubmitting || isLoadingCompany || !editForm.lookupSlug || !editForm.companySlug}>{isSubmitting ? 'Guardando...' : 'Guardar cambios'}</button>
              </div>
            </form>
        )}

        {activeSection === 'maintenance' && (
          <form className="platform-admin-panel platform-admin-panel-single" onSubmit={submitReset}>
            <div className="platform-panel-heading">
              <p>Mantenimiento</p>
              <h2>Blanquear password</h2>
            </div>
              <Field label="Empresa">
                <select value={resetForm.companySlug} onChange={(event) => updateResetField('companySlug', event.target.value)} required>
                  <option value="">Seleccionar empresa</option>
                  {platformCompanies.map((company) => (
                    <option key={company.company_id || company.company_slug} value={company.company_slug}>
                      {company.company_name} ({company.company_slug})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Usuario administrador">
                <input value={resetForm.adminUsername} onChange={(event) => updateResetField('adminUsername', event.target.value)} placeholder="adminjardin" required />
              </Field>
              <div className="platform-action-row platform-action-row-end">
                <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Procesando...' : 'Blanquear password'}</button>
              </div>
            </form>
        )}
      </section>

      <nav className="platform-admin-bottom-nav" aria-label="Secciones plataforma mobile">
        {platformSections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`platform-admin-bottom-button ${activeSection === section.id ? 'is-active' : ''}`}
            onClick={() => setActiveSection(section.id)}
          >
            <span className="platform-admin-bottom-icon" aria-hidden="true">{section.icon}</span>
            <span className="platform-admin-bottom-label">{section.shortLabel}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
