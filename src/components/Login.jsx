import { useState } from 'react';
import { supabase } from '../api/supabaseClient';

const requestedProfileStorageKey = 'turnos_requested_profile';

const accessOptions = [
  {
    id: 'client',
    icon: '🙋',
    title: 'Clientes',
    badge: 'Google',
    description: 'Para reservar turnos y consultar reservas propias.'
  },
  {
    id: 'employee',
    icon: '🧑‍💼',
    title: 'Empleados',
    badge: 'Acceso interno',
    description: 'Para ingresar o registrarse con nombre y contraseña.'
  },
  {
    id: 'admin',
    icon: '🛠️',
    title: 'Administrador',
    badge: 'Acceso interno',
    description: 'Para ingresar o crear acceso administrativo al panel completo.'
  }
];

const internalProfileLabels = {
  employee: 'Empleado',
  admin: 'Administrador'
};

const emptyRegistrationForm = {
  name: '',
  password: '',
  confirmPassword: ''
};

const emptyVisiblePasswords = {
  password: false,
  confirmPassword: false
};

const isAlphanumeric = (value) => /^[a-z0-9]+$/i.test(value);

export default function Login({ onInternalAccess }) {
  const [registrationProfile, setRegistrationProfile] = useState(null);
  const [internalAccessMode, setInternalAccessMode] = useState('login');
  const [registrationForm, setRegistrationForm] = useState(emptyRegistrationForm);
  const [registrationError, setRegistrationError] = useState('');
  const [registrationSuccess, setRegistrationSuccess] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState(emptyVisiblePasswords);
  const [isSubmittingInternalAccess, setIsSubmittingInternalAccess] = useState(false);

  const handleLogin = async (profileId) => {
    sessionStorage.setItem(requestedProfileStorageKey, profileId);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: {
          prompt: 'select_account'
        }
      }
    });

    if (error) {
      alert('No se pudo iniciar sesión. Intentá nuevamente.');
    }
  };

  const openRegistration = (profileId) => {
    setRegistrationProfile(profileId);
    setInternalAccessMode('login');
    setRegistrationForm(emptyRegistrationForm);
    setVisiblePasswords(emptyVisiblePasswords);
    setRegistrationError('');
    setRegistrationSuccess('');
  };

  const closeRegistration = () => {
    setRegistrationProfile(null);
    setRegistrationForm(emptyRegistrationForm);
    setVisiblePasswords(emptyVisiblePasswords);
    setRegistrationError('');
    setRegistrationSuccess('');
    setIsSubmittingInternalAccess(false);
  };

  const updateRegistrationField = (field, value) => {
    setRegistrationForm((current) => ({ ...current, [field]: value }));
    setRegistrationError('');
    setRegistrationSuccess('');
  };

  const changeInternalAccessMode = (mode) => {
    setInternalAccessMode(mode);
    setRegistrationForm(emptyRegistrationForm);
    setVisiblePasswords(emptyVisiblePasswords);
    setRegistrationError('');
    setRegistrationSuccess('');
  };

  const togglePasswordVisibility = (field) => {
    setVisiblePasswords((current) => ({
      ...current,
      [field]: !current[field]
    }));
  };

  const submitRegistration = async (event) => {
    event.preventDefault();

    const name = registrationForm.name.trim();
    const password = registrationForm.password.trim();
    const confirmPassword = registrationForm.confirmPassword.trim();

    if (name.length < 3) {
      setRegistrationError('El nombre debe tener al menos 3 caracteres.');
      return;
    }

    if (password.length < 6) {
      setRegistrationError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (!isAlphanumeric(password)) {
      setRegistrationError('La contraseña solo puede tener letras y números.');
      return;
    }

    if (internalAccessMode === 'register' && password !== confirmPassword) {
      setRegistrationError('Las contraseñas no coinciden.');
      return;
    }

    setIsSubmittingInternalAccess(true);

    if (internalAccessMode === 'register') {
      const { error } = await supabase.rpc('request_internal_registration', {
        account_role: registrationProfile,
        display_name_value: name,
        password_value: password,
        employee_id_value: null
      });

      setIsSubmittingInternalAccess(false);

      if (error) {
        setRegistrationError(error.message || 'No se pudo enviar la solicitud de registro.');
        return;
      }

      setRegistrationForm(emptyRegistrationForm);
      setInternalAccessMode('login');
      setRegistrationSuccess('Solicitud enviada. Cuando el administrador la apruebe, vas a poder ingresar con estos datos.');
      return;
    }

    const { data, error } = await supabase.rpc('verify_internal_login', {
      account_role: registrationProfile,
      display_name_value: name,
      password_value: password
    });

    setIsSubmittingInternalAccess(false);

    if (error) {
      setRegistrationError(error.message || 'No se pudo validar el acceso interno.');
      return;
    }

    const account = Array.isArray(data) ? data[0] : data;

    if (!account) {
      setRegistrationError('No se encontró una cuenta activa con esos datos.');
      return;
    }

    onInternalAccess(account);
    closeRegistration();
  };

  const handleAccessOption = (profileId) => {
    if (profileId === 'client') {
      handleLogin(profileId);
      return;
    }

    openRegistration(profileId);
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand-mark">T</div>
        <p className="login-kicker">Reserva de turnos</p>
        <h1>Turnos App</h1>
        <p className="login-copy">
          Elegí el tipo de acceso. Clientes ingresan con Google; empleados y administrador usan nombre y contraseña internos.
        </p>

        <div className="login-access-grid" aria-label="Tipos de acceso">
          {accessOptions.map((option) => (
            <button
              key={option.id}
              className={`login-access-card login-access-card-${option.id}`}
              type="button"
              onClick={() => handleAccessOption(option.id)}
            >
              <span className="login-access-icon" aria-hidden="true">{option.icon}</span>
              <span className="login-access-content">
                <span className="login-access-title-row">
                  <strong>{option.title}</strong>
                  <span>{option.badge}</span>
                </span>
                <small>{option.description}</small>
              </span>
            </button>
          ))}
        </div>

        <button className="login-google-button" type="button" onClick={() => handleLogin('client')}>
          <span className="login-google-icon" aria-hidden="true">G</span>
          Continuar como cliente con Google
        </button>
      </section>

      {registrationProfile && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Acceso interno">
          <form className="internal-register-modal" onSubmit={submitRegistration}>
            <div className="agenda-modal-header">
              Acceso {internalProfileLabels[registrationProfile]}
            </div>

            <div className="agenda-modal-body">
              <div className="internal-register-tabs" aria-label="Modo de acceso">
                <button
                  type="button"
                  className={internalAccessMode === 'login' ? 'is-active' : ''}
                  onClick={() => changeInternalAccessMode('login')}
                >
                  Ingresar
                </button>
                <button
                  type="button"
                  className={internalAccessMode === 'register' ? 'is-active' : ''}
                  onClick={() => changeInternalAccessMode('register')}
                >
                  Registrarse
                </button>
              </div>

              <p className="internal-register-copy">
                {internalAccessMode === 'register'
                  ? 'Creá un acceso interno con nombre y contraseña. Clientes continúan ingresando únicamente con Google.'
                  : 'Ingresá con el nombre y contraseña internos si ya tenés un usuario creado.'}
              </p>

              <label className="internal-register-field">
                Nombre
                <input
                  type="text"
                  value={registrationForm.name}
                  minLength="3"
                  maxLength="40"
                  autoComplete="name"
                  placeholder="Ej: Martina"
                  onChange={(event) => updateRegistrationField('name', event.target.value)}
                />
              </label>

              <label className="internal-register-field">
                Contraseña
                <span className="internal-password-control">
                  <input
                    type={visiblePasswords.password ? 'text' : 'password'}
                    value={registrationForm.password}
                    minLength="6"
                    maxLength="20"
                    pattern="[A-Za-z0-9]+"
                    autoComplete={internalAccessMode === 'register' ? 'new-password' : 'current-password'}
                    placeholder="Solo letras y números"
                    onChange={(event) => updateRegistrationField('password', event.target.value)}
                  />
                  <button
                    type="button"
                    className="internal-password-toggle"
                    onClick={() => togglePasswordVisibility('password')}
                    aria-label={visiblePasswords.password ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    title={visiblePasswords.password ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    👁️
                  </button>
                </span>
              </label>

              {internalAccessMode === 'register' && (
                <label className="internal-register-field">
                  Repetir contraseña
                  <span className="internal-password-control">
                    <input
                      type={visiblePasswords.confirmPassword ? 'text' : 'password'}
                      value={registrationForm.confirmPassword}
                      minLength="6"
                      maxLength="20"
                      pattern="[A-Za-z0-9]+"
                      autoComplete="new-password"
                      placeholder="Confirmá la contraseña"
                      onChange={(event) => updateRegistrationField('confirmPassword', event.target.value)}
                    />
                    <button
                      type="button"
                      className="internal-password-toggle"
                      onClick={() => togglePasswordVisibility('confirmPassword')}
                      aria-label={visiblePasswords.confirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      title={visiblePasswords.confirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      👁️
                    </button>
                  </span>
                </label>
              )}

              {registrationError && (
                <div className="internal-register-error" role="alert">
                  {registrationError}
                </div>
              )}

              {registrationSuccess && (
                <div className="internal-register-success" role="status">
                  {registrationSuccess}
                </div>
              )}

              <div className="internal-register-actions">
                <button className="internal-register-secondary" type="button" onClick={closeRegistration} disabled={isSubmittingInternalAccess}>
                  Cancelar
                </button>
                <button className="internal-register-primary" type="submit" disabled={isSubmittingInternalAccess}>
                  {isSubmittingInternalAccess
                    ? 'Procesando...'
                    : internalAccessMode === 'register' ? 'Registrar' : 'Ingresar'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}