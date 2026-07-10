import { useState } from 'react';
import { supabase } from '../api/supabaseClient';
import turnosAppIcon from '../assets/turnos-app-icon.svg';

const requestedProfileStorageKey = 'turnos_requested_profile';
const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;

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
  username: '',
  firstName: '',
  lastName: '',
  birthDate: '',
  phone: '',
  addressStreet: '',
  addressNumber: '',
  addressLocality: '',
  photoUrl: '',
  password: '',
  confirmPassword: ''
};

const emptyVisiblePasswords = {
  password: false,
  confirmPassword: false
};

const emptyPasswordChangeForm = {
  currentPassword: '',
  password: '',
  confirmPassword: ''
};

const isAlphanumeric = (value) => /^[a-z0-9]+$/i.test(value);
const isUsername = (value) => /^[a-z0-9._-]+$/i.test(value);

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

export default function Login({ onInternalAccess, onLocalClientAccess }) {
  const [registrationProfile, setRegistrationProfile] = useState(null);
  const [internalAccessMode, setInternalAccessMode] = useState('login');
  const [registrationForm, setRegistrationForm] = useState(emptyRegistrationForm);
  const [registrationError, setRegistrationError] = useState('');
  const [registrationSuccess, setRegistrationSuccess] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState(emptyVisiblePasswords);
  const [passwordChangeAccount, setPasswordChangeAccount] = useState(null);
  const [passwordChangeForm, setPasswordChangeForm] = useState(emptyPasswordChangeForm);
  const [isSubmittingInternalAccess, setIsSubmittingInternalAccess] = useState(false);

  const handleLogin = async (profileId) => {
    sessionStorage.setItem(requestedProfileStorageKey, profileId);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${appUrl.replace(/\/$/, '')}/`,
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
    setPasswordChangeAccount(null);
    setPasswordChangeForm(emptyPasswordChangeForm);
    setRegistrationError('');
    setRegistrationSuccess('');
  };

  const closeRegistration = () => {
    setRegistrationProfile(null);
    setRegistrationForm(emptyRegistrationForm);
    setVisiblePasswords(emptyVisiblePasswords);
    setPasswordChangeAccount(null);
    setPasswordChangeForm(emptyPasswordChangeForm);
    setRegistrationError('');
    setRegistrationSuccess('');
    setIsSubmittingInternalAccess(false);
  };

  const updateRegistrationField = (field, value) => {
    setRegistrationForm((current) => ({ ...current, [field]: value }));
    setRegistrationError('');
    setRegistrationSuccess('');
  };

  const updatePasswordChangeField = (field, value) => {
    setPasswordChangeForm((current) => ({ ...current, [field]: value }));
    setRegistrationError('');
    setRegistrationSuccess('');
  };

  const changeInternalAccessMode = (mode) => {
    setInternalAccessMode(mode);
    setRegistrationForm(emptyRegistrationForm);
    setVisiblePasswords(emptyVisiblePasswords);
    setPasswordChangeAccount(null);
    setPasswordChangeForm(emptyPasswordChangeForm);
    setRegistrationError('');
    setRegistrationSuccess('');
  };

  const togglePasswordVisibility = (field) => {
    setVisiblePasswords((current) => ({
      ...current,
      [field]: !current[field]
    }));
  };

  const updatePhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setRegistrationError('Seleccioná una imagen válida para la foto de perfil.');
      return;
    }

    if (file.size > 750 * 1024) {
      setRegistrationError('La foto debe pesar menos de 750 KB.');
      return;
    }

    try {
      const photoUrl = await fileToDataUrl(file);
      updateRegistrationField('photoUrl', photoUrl);
    } catch (error) {
      setRegistrationError(error.message);
    }
  };

  const submitRegistration = async (event) => {
    event.preventDefault();

    const username = registrationForm.username.trim();
    const firstName = registrationForm.firstName.trim();
    const lastName = registrationForm.lastName.trim();
    const password = registrationForm.password.trim();
    const confirmPassword = registrationForm.confirmPassword.trim();

    if (username.length < 3 || !isUsername(username)) {
      setRegistrationError('El usuario debe tener al menos 3 caracteres y solo puede usar letras, números, punto, guion o guion bajo.');
      return;
    }

    if (internalAccessMode === 'register') {
      if (firstName.length < 2 || lastName.length < 2) {
        setRegistrationError('Ingresá nombre y apellido.');
        return;
      }

      if (!registrationForm.birthDate || !calculateAge(registrationForm.birthDate)) {
        setRegistrationError('Ingresá una fecha de nacimiento válida.');
        return;
      }

      if (!registrationForm.phone.trim()) {
        setRegistrationError('Ingresá un celular de contacto.');
        return;
      }
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
        username_value: username,
        first_name_value: firstName,
        last_name_value: lastName,
        birth_date_value: registrationForm.birthDate || null,
        phone_value: registrationForm.phone.trim() || null,
        address_street_value: registrationForm.addressStreet.trim() || null,
        address_number_value: registrationForm.addressNumber.trim() || null,
        address_locality_value: registrationForm.addressLocality.trim() || null,
        photo_url_value: registrationForm.photoUrl || null,
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
      username_value: username,
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

    if (account.must_change_password) {
      setPasswordChangeAccount(account);
      setPasswordChangeForm({
        currentPassword: password,
        password: '',
        confirmPassword: ''
      });
      setRegistrationForm((current) => ({ ...current, password: '', confirmPassword: '' }));
      setVisiblePasswords(emptyVisiblePasswords);
      setRegistrationError('');
      setRegistrationSuccess('');
      return;
    }

    onInternalAccess(account);
    closeRegistration();
  };

  const submitPasswordChange = async (event) => {
    event.preventDefault();

    const password = passwordChangeForm.password.trim();
    const confirmPassword = passwordChangeForm.confirmPassword.trim();

    if (!passwordChangeAccount) {
      setRegistrationError('Volvé a ingresar con tu usuario y contraseña inicial.');
      return;
    }

    if (password.length < 6) {
      setRegistrationError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (!isAlphanumeric(password)) {
      setRegistrationError('La nueva contraseña solo puede tener letras y números.');
      return;
    }

    if (password === passwordChangeForm.currentPassword || password === '123456') {
      setRegistrationError('La nueva contraseña debe ser distinta a la contraseña inicial.');
      return;
    }

    if (password !== confirmPassword) {
      setRegistrationError('Las contraseñas no coinciden.');
      return;
    }

    setIsSubmittingInternalAccess(true);

    const { data, error } = await supabase.rpc('change_internal_password', {
      account_id_value: passwordChangeAccount.id,
      current_password_value: passwordChangeForm.currentPassword,
      new_password_value: password
    });

    setIsSubmittingInternalAccess(false);

    if (error) {
      setRegistrationError(error.message || 'No se pudo cambiar la contraseña.');
      return;
    }

    const account = Array.isArray(data) ? data[0] : data;

    if (!account) {
      setRegistrationError('La contraseña se cambió, pero no se pudo iniciar la sesión. Volvé a ingresar.');
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
        <img className="login-brand-mark" src={turnosAppIcon} alt="Turnos app" />
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

        {onLocalClientAccess && (
          <button className="login-local-client-button" type="button" onClick={onLocalClientAccess}>
            Entrar como cliente local
          </button>
        )}

      </section>

      {registrationProfile && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Acceso interno">
          <form className="internal-register-modal" onSubmit={passwordChangeAccount ? submitPasswordChange : submitRegistration}>
            <div className="agenda-modal-header">
              {passwordChangeAccount ? 'Cambiar contraseña' : `Acceso ${internalProfileLabels[registrationProfile]}`}
            </div>

            <div className="agenda-modal-body">
              {passwordChangeAccount ? (
                <>
                  <p className="internal-register-copy">
                    Tu cuenta fue creada con una contraseña inicial. Para continuar, definí una nueva contraseña.
                  </p>

                  <label className="internal-register-field">
                    Nueva contraseña
                    <span className="internal-password-control">
                      <input
                        type={visiblePasswords.password ? 'text' : 'password'}
                        value={passwordChangeForm.password}
                        minLength="6"
                        maxLength="20"
                        pattern="[A-Za-z0-9]+"
                        autoComplete="new-password"
                        placeholder="Solo letras y números"
                        onChange={(event) => updatePasswordChangeField('password', event.target.value)}
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

                  <label className="internal-register-field">
                    Repetir contraseña
                    <span className="internal-password-control">
                      <input
                        type={visiblePasswords.confirmPassword ? 'text' : 'password'}
                        value={passwordChangeForm.confirmPassword}
                        minLength="6"
                        maxLength="20"
                        pattern="[A-Za-z0-9]+"
                        autoComplete="new-password"
                        placeholder="Confirmá la contraseña"
                        onChange={(event) => updatePasswordChangeField('confirmPassword', event.target.value)}
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
                </>
              ) : (
                <>
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
                  ? 'Creá un acceso interno con usuario único, datos personales y contraseña. Clientes continúan ingresando únicamente con Google.'
                  : 'Ingresá con tu usuario y contraseña internos si ya tenés una cuenta aprobada.'}
              </p>

              <label className="internal-register-field">
                Usuario
                <input
                  type="text"
                  value={registrationForm.username}
                  minLength="3"
                  maxLength="40"
                  autoComplete="username"
                  placeholder="Ej: martina.perez"
                  onChange={(event) => updateRegistrationField('username', event.target.value)}
                />
              </label>

              {internalAccessMode === 'register' && (
                <>
                  <div className="internal-register-two-columns">
                    <label className="internal-register-field">
                      Nombre
                      <input
                        type="text"
                        value={registrationForm.firstName}
                        maxLength="40"
                        autoComplete="given-name"
                        placeholder="Martina"
                        onChange={(event) => updateRegistrationField('firstName', event.target.value)}
                      />
                    </label>

                    <label className="internal-register-field">
                      Apellido
                      <input
                        type="text"
                        value={registrationForm.lastName}
                        maxLength="40"
                        autoComplete="family-name"
                        placeholder="Pérez"
                        onChange={(event) => updateRegistrationField('lastName', event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="internal-register-two-columns internal-register-age-row">
                    <label className="internal-register-field">
                      Fecha de nacimiento
                      <input
                        type="date"
                        value={registrationForm.birthDate}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={(event) => updateRegistrationField('birthDate', event.target.value)}
                      />
                    </label>

                    <label className="internal-register-field">
                      Edad
                      <input value={calculateAge(registrationForm.birthDate)} disabled placeholder="Auto" />
                    </label>
                  </div>

                  <label className="internal-register-field">
                    Celular
                    <input
                      type="tel"
                      value={registrationForm.phone}
                      maxLength="30"
                      autoComplete="tel"
                      placeholder="Ej: 11 5555 5555"
                      onChange={(event) => updateRegistrationField('phone', event.target.value)}
                    />
                  </label>

                  <div className="internal-register-address-grid">
                    <label className="internal-register-field">
                      Calle
                      <input value={registrationForm.addressStreet} maxLength="80" autoComplete="address-line1" onChange={(event) => updateRegistrationField('addressStreet', event.target.value)} />
                    </label>
                    <label className="internal-register-field">
                      Nro.
                      <input value={registrationForm.addressNumber} maxLength="12" onChange={(event) => updateRegistrationField('addressNumber', event.target.value)} />
                    </label>
                    <label className="internal-register-field">
                      Localidad
                      <input value={registrationForm.addressLocality} maxLength="60" autoComplete="address-level2" onChange={(event) => updateRegistrationField('addressLocality', event.target.value)} />
                    </label>
                  </div>

                  <label className="internal-register-field internal-photo-field">
                    Foto de perfil
                    <span className="internal-photo-control">
                      <span className="internal-photo-preview" aria-hidden="true">
                        {registrationForm.photoUrl ? <img src={registrationForm.photoUrl} alt="" /> : 'Foto'}
                      </span>
                      <input type="file" accept="image/*" onChange={updatePhoto} />
                    </span>
                  </label>
                </>
              )}

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
                </>
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
                    : passwordChangeAccount ? 'Cambiar contraseña' : internalAccessMode === 'register' ? 'Registrar' : 'Ingresar'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}