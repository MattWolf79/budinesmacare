import { useState } from 'react';
import { supabase } from '../api/supabaseClient';

const turnosAppLogo = '/logo-quieroturnoapp.png';

const initialLoginForm = {
  username: 'Admin',
  password: 'Admin'
};

const initialCompanyForm = {
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
  lookupSlug: '',
  companySlug: '',
  companyName: '',
  clientLogoDataUrl: '',
  clientLogoFileName: '',
  clientLogoMimeType: '',
  preciosHabilitados: true,
  descuentosHabilitados: true,
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

const initialResetForm = {
  companySlug: '',
  adminUsername: ''
};

const Field = ({ label, children }) => (
  <label className="platform-field">
    <span>{label}</span>
    {children}
  </label>
);

const CheckField = ({ label, checked, onChange }) => (
  <label className="platform-check-field">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <span>{label}</span>
  </label>
);

const ConfigSection = ({ title, children }) => (
  <div className="platform-config-section">
    <p>{title}</p>
    <div className="platform-form-grid">{children}</div>
  </div>
);

const getConfigPayload = (form) => ({
  precios_habilitados_valor: Boolean(form.preciosHabilitados),
  descuentos_habilitados_valor: Boolean(form.descuentosHabilitados),
  promociones_habilitadas_valor: Boolean(form.promocionesHabilitadas),
  turnos_superpuestos_habilitados_valor: Boolean(form.turnosSuperpuestosHabilitados),
  intervalo_grilla_minutos_valor: Number(form.intervaloGrillaMinutos) || 30,
  empleados_pueden_reservar_valor: Boolean(form.empleadosPuedenReservar),
  empleados_ven_agenda_completa_valor: form.visibilidadTurnosEmpleado !== 'solo_propios',
  visibilidad_turnos_empleado_valor: form.visibilidadTurnosEmpleado || 'completa',
  empleados_cancelan_turnos_valor: form.empleadosCancelanTurnos || 'propios',
  empleados_ven_detalle_turnos_valor: form.empleadosVenDetalleTurnos || 'propios',
  pdf_detalle_turno_habilitado_valor: Boolean(form.pdfDetalleTurnoHabilitado)
});

const applyConfigData = (data) => {
  const config = data?.configuracion_operativa || {};

  return {
    lookupSlug: data?.company_slug || '',
    companySlug: data?.company_slug || '',
    companyName: data?.company_name || '',
    clientLogoDataUrl: data?.client_logo_data_url || '',
    clientLogoFileName: data?.client_logo_file_name || '',
    clientLogoMimeType: data?.client_logo_mime_type || '',
    preciosHabilitados: config.precios_habilitados !== false,
    descuentosHabilitados: config.descuentos_habilitados !== false,
    promocionesHabilitadas: config.promociones_habilitadas !== false,
    turnosSuperpuestosHabilitados: config.turnos_superpuestos_habilitados !== false,
    intervaloGrillaMinutos: String(config.intervalo_grilla_minutos || 30),
    empleadosPuedenReservar: config.empleados_pueden_reservar !== false,
    empleadosVenAgendaCompleta: (config.visibilidad_turnos_empleado || 'completa') !== 'solo_propios',
    visibilidadTurnosEmpleado: config.visibilidad_turnos_empleado || 'completa',
    empleadosCancelanTurnos: config.empleados_cancelan_turnos || 'propios',
    empleadosVenDetalleTurnos: config.empleados_ven_detalle_turnos || 'propios',
    pdfDetalleTurnoHabilitado: config.pdf_detalle_turno_habilitado === true
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

  const updateLoginField = (field, value) => {
    setLoginForm((current) => ({ ...current, [field]: value }));
  };

  const updateCompanyField = (field, value) => {
    setCompanyForm((current) => ({
      ...current,
      [field]: field === 'companySlug' ? normalizeSlug(value) : value
    }));
  };

  const updateEditField = (field, value) => {
    setEditForm((current) => ({
      ...current,
      [field]: ['lookupSlug', 'companySlug'].includes(field) ? normalizeSlug(value) : value
    }));
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
        <button className="app-navbar-logout" type="button" onClick={logout}>Salir</button>
      </header>

      {message && <p className="platform-admin-success">{message}</p>}
      {errorMessage && <p className="platform-admin-error">{errorMessage}</p>}

      <section className="platform-admin-grid">
        <form className="platform-admin-panel" onSubmit={submitCompany}>
          <div className="platform-panel-heading">
            <p>Configuración inicial</p>
            <h2>Nueva empresa</h2>
          </div>
          <div className="platform-form-grid">
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
            <ConfigSection title="Sistema">
              <CheckField label="Usa precios en el sistema" checked={companyForm.preciosHabilitados} onChange={(value) => updateCompanyField('preciosHabilitados', value)} />
              <CheckField label="Habilita descuentos" checked={companyForm.descuentosHabilitados} onChange={(value) => updateCompanyField('descuentosHabilitados', value)} />
              <CheckField label="Habilita promociones" checked={companyForm.promocionesHabilitadas} onChange={(value) => updateCompanyField('promocionesHabilitadas', value)} />
              <CheckField label="Permite turnos superpuestos" checked={companyForm.turnosSuperpuestosHabilitados} onChange={(value) => updateCompanyField('turnosSuperpuestosHabilitados', value)} />
              <CheckField label="Habilita PDF de detalle de turno" checked={companyForm.pdfDetalleTurnoHabilitado} onChange={(value) => updateCompanyField('pdfDetalleTurnoHabilitado', value)} />
            </ConfigSection>
            <ConfigSection title="Agenda">
              <Field label="Bloque de grilla">
                <select value={companyForm.intervaloGrillaMinutos} onChange={(event) => updateCompanyField('intervaloGrillaMinutos', event.target.value)}>
                  <option value="15">15 minutos</option>
                  <option value="30">30 minutos</option>
                  <option value="45">45 minutos</option>
                  <option value="60">60 minutos</option>
                </select>
              </Field>
              <Field label="Visibilidad empleado">
                <select value={companyForm.visibilidadTurnosEmpleado} onChange={(event) => updateCompanyField('visibilidadTurnosEmpleado', event.target.value)}>
                  <option value="completa">Completa</option>
                  <option value="cliente_servicio">Cliente/Servicio</option>
                  <option value="solo_ocupado">Solo ocupado</option>
                  <option value="cliente_sin_empleado">Cliente sin empleado</option>
                  <option value="solo_propios">Solo sus turnos</option>
                </select>
              </Field>
            </ConfigSection>
            <ConfigSection title="Permisos empleado">
              <CheckField label="Pueden crear turnos" checked={companyForm.empleadosPuedenReservar} onChange={(value) => updateCompanyField('empleadosPuedenReservar', value)} />
              <Field label="Cancelan turnos">
                <select value={companyForm.empleadosCancelanTurnos} onChange={(event) => updateCompanyField('empleadosCancelanTurnos', event.target.value)}>
                  <option value="propios">Propios</option>
                  <option value="todos">Todos</option>
                  <option value="ninguno">Ninguno</option>
                </select>
              </Field>
              <Field label="Ven detalle">
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

        <form className="platform-admin-panel" onSubmit={submitEditCompany}>
          <div className="platform-panel-heading">
            <p>Modificar empresa</p>
            <h2>Configuración operativa</h2>
          </div>
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
          {editForm.companyName && <p className="platform-company-loaded">Empresa: {editForm.companyName}</p>}
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
            <ConfigSection title="Sistema">
              <CheckField label="Usa precios en el sistema" checked={editForm.preciosHabilitados} onChange={(value) => updateEditField('preciosHabilitados', value)} />
              <CheckField label="Habilita descuentos" checked={editForm.descuentosHabilitados} onChange={(value) => updateEditField('descuentosHabilitados', value)} />
              <CheckField label="Habilita promociones" checked={editForm.promocionesHabilitadas} onChange={(value) => updateEditField('promocionesHabilitadas', value)} />
              <CheckField label="Permite turnos superpuestos" checked={editForm.turnosSuperpuestosHabilitados} onChange={(value) => updateEditField('turnosSuperpuestosHabilitados', value)} />
              <CheckField label="Habilita PDF de detalle de turno" checked={editForm.pdfDetalleTurnoHabilitado} onChange={(value) => updateEditField('pdfDetalleTurnoHabilitado', value)} />
            </ConfigSection>
            <ConfigSection title="Agenda">
              <Field label="Bloque de grilla">
                <select value={editForm.intervaloGrillaMinutos} onChange={(event) => updateEditField('intervaloGrillaMinutos', event.target.value)}>
                  <option value="15">15 minutos</option>
                  <option value="30">30 minutos</option>
                  <option value="45">45 minutos</option>
                  <option value="60">60 minutos</option>
                </select>
              </Field>
              <Field label="Visibilidad empleado">
                <select value={editForm.visibilidadTurnosEmpleado} onChange={(event) => updateEditField('visibilidadTurnosEmpleado', event.target.value)}>
                  <option value="completa">Completa</option>
                  <option value="cliente_servicio">Cliente/Servicio</option>
                  <option value="solo_ocupado">Solo ocupado</option>
                  <option value="cliente_sin_empleado">Cliente sin empleado</option>
                  <option value="solo_propios">Solo sus turnos</option>
                </select>
              </Field>
            </ConfigSection>
            <ConfigSection title="Permisos empleado">
              <CheckField label="Pueden crear turnos" checked={editForm.empleadosPuedenReservar} onChange={(value) => updateEditField('empleadosPuedenReservar', value)} />
              <Field label="Cancelan turnos">
                <select value={editForm.empleadosCancelanTurnos} onChange={(event) => updateEditField('empleadosCancelanTurnos', event.target.value)}>
                  <option value="propios">Propios</option>
                  <option value="todos">Todos</option>
                  <option value="ninguno">Ninguno</option>
                </select>
              </Field>
              <Field label="Ven detalle">
                <select value={editForm.empleadosVenDetalleTurnos} onChange={(event) => updateEditField('empleadosVenDetalleTurnos', event.target.value)}>
                  <option value="propios">Propios</option>
                  <option value="todos">Todos</option>
                  <option value="ninguno">Ninguno</option>
                </select>
              </Field>
            </ConfigSection>
          </div>
          <div className="platform-action-row">
            <button className="platform-button-secondary" type="button" disabled={isLoadingCompany || isSubmitting || !editForm.lookupSlug} onClick={loadCompanyConfig}>{isLoadingCompany ? 'Cargando...' : 'Cargar'}</button>
            <button type="submit" disabled={isSubmitting || isLoadingCompany || !editForm.lookupSlug || !editForm.companySlug}>{isSubmitting ? 'Guardando...' : 'Guardar cambios'}</button>
          </div>
        </form>

        <form className="platform-admin-panel" onSubmit={submitReset}>
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
      </section>
    </main>
  );
}
