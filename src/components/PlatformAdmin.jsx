import { useState } from 'react';
import { supabase } from '../api/supabaseClient';

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
  adminEmail: ''
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

const normalizeSlug = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, '');

export default function PlatformAdmin() {
  const [loginForm, setLoginForm] = useState(initialLoginForm);
  const [platformSession, setPlatformSession] = useState(null);
  const [companyForm, setCompanyForm] = useState(initialCompanyForm);
  const [resetForm, setResetForm] = useState(initialResetForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const updateResetField = (field, value) => {
    setResetForm((current) => ({
      ...current,
      [field]: field === 'companySlug' ? normalizeSlug(value) : value
    }));
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

    setPlatformSession({
      id: account.id,
      username: account.username,
      displayName: account.display_name,
      sessionToken: account.session_token
    });
    setLoginForm(initialLoginForm);
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
      admin_email_value: companyForm.adminEmail.trim().toLowerCase() || null
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message || 'No se pudo crear la empresa.');
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    setMessage(`Empresa creada: ${result.company_slug}. Admin: ${result.admin_username}. Password temporal: ${result.temporary_password}. URL: ${window.location.origin}/${result.company_slug}`);
    setCompanyForm(initialCompanyForm);
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
        <div>
          <p>Administración plataforma</p>
          <h1>Empresas</h1>
          <span>Alta de empresas, administradores iniciales y blanqueo de accesos.</span>
        </div>
        <button type="button" onClick={logout}>Salir</button>
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
          <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Crear empresa'}</button>
        </form>

        <form className="platform-admin-panel" onSubmit={submitReset}>
          <div className="platform-panel-heading">
            <p>Mantenimiento</p>
            <h2>Blanquear password</h2>
          </div>
          <Field label="Slug empresa">
            <input value={resetForm.companySlug} onChange={(event) => updateResetField('companySlug', event.target.value)} placeholder="jardinmasaje" required />
          </Field>
          <Field label="Usuario administrador">
            <input value={resetForm.adminUsername} onChange={(event) => updateResetField('adminUsername', event.target.value)} placeholder="adminjardin" required />
          </Field>
          <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Procesando...' : 'Blanquear password'}</button>
        </form>
      </section>
    </main>
  );
}
