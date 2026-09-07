import { useEffect, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import { getClientPortalPath } from '../utils/tenant';
import { comprimirImagen } from '../utils/imagenes';

const requestedProfileStorageKey = 'turnos_requested_profile';
const oauthCompanySlugStorageKey = 'turnos_oauth_company_slug';

// Se usa localStorage (no sessionStorage) para que el perfil solicitado y la
// marca de actividad se compartan entre pestañas, en línea con la sesión interna.
// eslint-disable-next-line no-redeclare
const sessionStorage = window.localStorage;

const appUrl =
  import.meta.env.VITE_APP_URL ||
  window.location.origin;

const inAppBrowserPattern =
  /Instagram|FBAN|FBAV|FB_IAB|FB4A|FBIOS/i;

const getAppLink = (companySlug) =>
  `${appUrl.replace(/\/$/, '')}${getClientPortalPath(companySlug)}`;

const isInAppBrowser = () =>
  inAppBrowserPattern.test(
    window.navigator.userAgent || ''
  );

const accessOptions = [
  {
    id: 'client',
    icon: '🙋',
    title: 'Clientes',
    badge: 'Google o usuario',
    description:
      'Para reservar turnos y consultar reservas con Google o usuario propio.'
  },
  {
    id: 'admin',
    icon: '🛠️',
    title: 'Administrador',
    badge: 'Acceso interno',
    description:
      'Para ingresar al panel de gestión de pedidos.'
  }
];

const accessProfileLabels = {
  client: 'Cliente',
  employee: 'Empleado',
  admin: 'Administrador'
};

const emptyRegistrationForm = {
  username: '',
  firstName: '',
  lastName: '',
  dni: '',
  birthDate: '',
  phone: '',
  email: '',
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

const isAlphanumeric = (value) =>
  /^[a-z0-9]+$/i.test(value);

const isUsername = (value) =>
  /^[a-z0-9._-]+$/i.test(value);

const isEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value || '').trim()
  );

const isDni = (value) =>
  /^\d{7,10}$/.test(
    String(value || '').trim()
  );

const normalizeUsernamePart = (value) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const generateInternalUsername = (
  firstName,
  lastName
) => {
  const normalizedFirstName =
    normalizeUsernamePart(firstName);

  const normalizedLastName =
    normalizeUsernamePart(lastName);

  if (
    !normalizedFirstName ||
    !normalizedLastName
  ) {
    return '';
  }

  return `${normalizedFirstName.slice(
    0,
    1
  )}${normalizedLastName}`;
};

const calculateAge = (birthDateValue) => {
  if (!birthDateValue) return '';

  const birthDate = new Date(
    `${birthDateValue}T00:00:00`
  );

  if (
    Number.isNaN(
      birthDate.getTime()
    )
  ) {
    return '';
  }

  const today = new Date();

  let age =
    today.getFullYear() -
    birthDate.getFullYear();

  const monthDiff =
    today.getMonth() -
    birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (
      monthDiff === 0 &&
      today.getDate() <
        birthDate.getDate()
    )
  ) {
    age -= 1;
  }

  return age >= 0
    ? String(age)
    : '';
};

export default function Login({
  companySlug,
  companyContext,
  allowedProfiles = accessOptions.map(
    (option) => option.id
  ),
  onInternalAccess,
  onLocalClientAccess,
  onLocalInternalAccess,
  localClientAccessEnabled = false,
  localInternalAccessEnabled = false,
  sessionNotice = '',
  onDismissSessionNotice
}) {
  const [
    registrationProfile,
    setRegistrationProfile
  ] = useState(null);

  const [
    inAppBrowserNoticeOpen,
    setInAppBrowserNoticeOpen
  ] = useState(false);

  const [
    copyLinkStatus,
    setCopyLinkStatus
  ] = useState('');

  const [
    internalAccessMode,
    setInternalAccessMode
  ] = useState('login');

  const [
    registrationForm,
    setRegistrationForm
  ] = useState(
    emptyRegistrationForm
  );

  const [
    registrationError,
    setRegistrationError
  ] = useState('');

  const [
    registrationSuccess,
    setRegistrationSuccess
  ] = useState('');

  const [
    visiblePasswords,
    setVisiblePasswords
  ] = useState(
    emptyVisiblePasswords
  );

  const [
    passwordChangeAccount,
    setPasswordChangeAccount
  ] = useState(null);

  const [
    passwordChangeForm,
    setPasswordChangeForm
  ] = useState(
    emptyPasswordChangeForm
  );

  const [
    isSubmittingInternalAccess,
    setIsSubmittingInternalAccess
  ] = useState(false);

  useEffect(() => {
    if (registrationProfile) return;

    const options =
      accessOptions.filter(
        (option) =>
          allowedProfiles.includes(
            option.id
          )
      );

    if (options[0]?.id) {
      setRegistrationProfile(
        options[0].id
      );
    }
  }, [
    registrationProfile,
    allowedProfiles
  ]);

  const handleLogin = async (
    profileId
  ) => {
    onDismissSessionNotice?.();

    /*
     * Guardamos el perfil solicitado y el slug
     * antes de salir hacia Google.
     *
     * Esto permite reconstruir la URL correcta
     * aunque Supabase/Google devuelva el callback
     * sobre "/".
     */
    sessionStorage.setItem(
      requestedProfileStorageKey,
      profileId
    );

    if (companySlug) {
      sessionStorage.setItem(
        oauthCompanySlugStorageKey,
        companySlug
      );
    } else {
      sessionStorage.removeItem(
        oauthCompanySlugStorageKey
      );
    }

    sessionStorage.setItem(
      'turnos_last_activity_at',
      String(Date.now())
    );

    const { data, error } =
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getAppLink(
            companySlug
          ),
          skipBrowserRedirect: true,
          queryParams: {
            prompt: 'select_account'
          }
        }
      });

    if (error) {
      alert(
        'No se pudo iniciar sesión. Intentá nuevamente.'
      );
      return;
    }

    if (data?.url) {
      window.location.assign(
        data.url
      );
    }
  };

  const copyAppLink = async () => {
    const link =
      getAppLink(companySlug);

    try {
      await navigator.clipboard.writeText(
        link
      );

      setCopyLinkStatus(
        'Link copiado. Abrilo desde Chrome o Safari.'
      );
    } catch {
      setCopyLinkStatus(link);
    }
  };

  const openRegistration = (
    profileId
  ) => {
    onDismissSessionNotice?.();

    setRegistrationProfile(
      profileId
    );

    setInternalAccessMode('login');

    setRegistrationForm(
      emptyRegistrationForm
    );

    setVisiblePasswords(
      emptyVisiblePasswords
    );

    setPasswordChangeAccount(null);

    setPasswordChangeForm(
      emptyPasswordChangeForm
    );

    setRegistrationError('');
    setRegistrationSuccess('');
  };

  const closeRegistration = () => {
    setRegistrationProfile(null);

    setRegistrationForm(
      emptyRegistrationForm
    );

    setVisiblePasswords(
      emptyVisiblePasswords
    );

    setPasswordChangeAccount(null);

    setPasswordChangeForm(
      emptyPasswordChangeForm
    );

    setRegistrationError('');
    setRegistrationSuccess('');

    setIsSubmittingInternalAccess(
      false
    );
  };

  const updateRegistrationField = (
    field,
    value
  ) => {
    setRegistrationForm(
      (current) => ({
        ...current,
        [field]: value
      })
    );

    setRegistrationError('');
    setRegistrationSuccess('');
  };

  const updatePasswordChangeField = (
    field,
    value
  ) => {
    setPasswordChangeForm(
      (current) => ({
        ...current,
        [field]: value
      })
    );

    setRegistrationError('');
    setRegistrationSuccess('');
  };

  const changeInternalAccessMode = (
    mode
  ) => {
    setInternalAccessMode(mode);

    setRegistrationForm(
      emptyRegistrationForm
    );

    setVisiblePasswords(
      emptyVisiblePasswords
    );

    setPasswordChangeAccount(null);

    setPasswordChangeForm(
      emptyPasswordChangeForm
    );

    setRegistrationError('');
    setRegistrationSuccess('');
  };

  const togglePasswordVisibility = (
    field
  ) => {
    setVisiblePasswords(
      (current) => ({
        ...current,
        [field]: !current[field]
      })
    );
  };

  const updatePhoto = async (
    event
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) return;

    if (
      !file.type.startsWith(
        'image/'
      )
    ) {
      setRegistrationError(
        'Seleccioná una imagen válida para la foto de perfil.'
      );
      return;
    }

    if (file.size > 750 * 1024) {
      setRegistrationError(
        'La foto debe pesar menos de 750 KB.'
      );
      return;
    }

    try {
      const photoUrl =
        await comprimirImagen(
          file,
          {
            ladoMaximo: 512,
            calidad: 0.72
          }
        );

      updateRegistrationField(
        'photoUrl',
        photoUrl
      );
    } catch (error) {
      setRegistrationError(
        error.message
      );
    }
  };

  const submitRegistration = async (
    event
  ) => {
    event.preventDefault();

    const isClientAccess =
      registrationProfile ===
      'client';

    const firstName =
      registrationForm.firstName.trim();

    const lastName =
      registrationForm.lastName.trim();

    const dni = String(
      registrationForm.dni || ''
    ).trim();

    const username =
      internalAccessMode ===
      'register'
        ? generateInternalUsername(
            firstName,
            lastName
          )
        : registrationForm.username.trim();

    const password =
      registrationForm.password.trim();

    const confirmPassword =
      registrationForm.confirmPassword.trim();

    if (
      internalAccessMode ===
      'register'
    ) {
      if (
        firstName.length < 2 ||
        lastName.length < 2
      ) {
        setRegistrationError(
          'Ingresá nombre y apellido.'
        );
        return;
      }

      if (
        username.length < 3 ||
        !isUsername(username)
      ) {
        setRegistrationError(
          'No se pudo generar un usuario válido con ese nombre y apellido.'
        );
        return;
      }

      if (
        isClientAccess &&
        !isDni(dni)
      ) {
        setRegistrationError(
          'Ingresá un DNI válido de 7 a 10 dígitos.'
        );
        return;
      }

      if (
        !registrationForm.phone.trim()
      ) {
        setRegistrationError(
          'Ingresá un celular de contacto.'
        );
        return;
      }

      if (
        !isClientAccess &&
        (
          !registrationForm.birthDate ||
          !calculateAge(
            registrationForm.birthDate
          )
        )
      ) {
        setRegistrationError(
          'Ingresá una fecha de nacimiento válida.'
        );
        return;
      }

      if (
        !isClientAccess &&
        !isEmail(
          registrationForm.email
        )
      ) {
        setRegistrationError(
          'Ingresá un mail válido para recibir notificaciones.'
        );
        return;
      }

      if (
        isClientAccess &&
        registrationForm.email.trim() &&
        !isEmail(
          registrationForm.email
        )
      ) {
        setRegistrationError(
          'Si ingresás mail, debe tener un formato válido.'
        );
        return;
      }
    } else if (
      !isClientAccess &&
      (
        username.length < 3 ||
        !isUsername(username)
      )
    ) {
      setRegistrationError(
        'El usuario debe tener al menos 3 caracteres y solo puede usar letras, números, punto, guion o guion bajo.'
      );
      return;
    }

    if (password.length < 6) {
      setRegistrationError(
        'La contraseña debe tener al menos 6 caracteres.'
      );
      return;
    }

    if (!isAlphanumeric(password)) {
      setRegistrationError(
        'La contraseña solo puede tener letras y números.'
      );
      return;
    }

    if (
      internalAccessMode ===
        'register' &&
      password !== confirmPassword
    ) {
      setRegistrationError(
        'Las contraseñas no coinciden.'
      );
      return;
    }

    setIsSubmittingInternalAccess(
      true
    );

    if (
      internalAccessMode ===
        'register' &&
      isClientAccess
    ) {
      const {
        data,
        error
      } = await supabase.rpc(
        'register_client_access',
        {
          first_name_value:
            firstName,
          last_name_value:
            lastName,
          dni_value: dni,
          phone_value:
            registrationForm.phone.trim() ||
            null,
          email_value:
            registrationForm.email.trim().toLowerCase() ||
            null,
          birth_date_value:
            registrationForm.birthDate ||
            null,
          address_street_value:
            registrationForm.addressStreet.trim() ||
            null,
          address_number_value:
            registrationForm.addressNumber.trim() ||
            null,
          address_locality_value:
            registrationForm.addressLocality.trim() ||
            null,
          password_value:
            password,
          company_slug_value:
            companySlug
        }
      );

      setIsSubmittingInternalAccess(
        false
      );

      if (error) {
        setRegistrationError(
          error.message ||
            'No se pudo crear la cuenta de cliente.'
        );
        return;
      }

      const account =
        Array.isArray(data)
          ? data[0]
          : data;

      setRegistrationForm(
        (current) => ({
          ...emptyRegistrationForm,
          username:
            account?.username ||
            ''
        })
      );

      setInternalAccessMode(
        'login'
      );

      setRegistrationSuccess(
        'Cuenta creada. Ya podés ingresar con DNI y contraseña.'
      );

      return;
    }

    if (
      internalAccessMode ===
      'register'
    ) {
      const {
        data,
        error
      } = await supabase.rpc(
        'request_internal_registration',
        {
          account_role:
            registrationProfile,
          username_value:
            username,
          first_name_value:
            firstName,
          last_name_value:
            lastName,
          birth_date_value:
            registrationForm.birthDate ||
            null,
          phone_value:
            registrationForm.phone.trim() ||
            null,
          email_value:
            registrationForm.email.trim().toLowerCase() ||
            null,
          address_street_value:
            registrationForm.addressStreet.trim() ||
            null,
          address_number_value:
            registrationForm.addressNumber.trim() ||
            null,
          address_locality_value:
            registrationForm.addressLocality.trim() ||
            null,
          photo_url_value:
            registrationForm.photoUrl ||
            null,
          password_value:
            password,
          employee_id_value:
            null,
          company_slug_value:
            companySlug
        }
      );

      setIsSubmittingInternalAccess(
        false
      );

      if (error) {
        setRegistrationError(
          error.message ||
            'No se pudo enviar la solicitud de registro.'
        );
        return;
      }

      setRegistrationForm(
        emptyRegistrationForm
      );

      setInternalAccessMode(
        'login'
      );

      const request =
        Array.isArray(data)
          ? data[0]
          : data;

      setRegistrationSuccess(
        `Solicitud enviada. Tu usuario será ${
          request?.username ||
          username
        }. Cuando el administrador la apruebe, vas a poder ingresar con estos datos.`
      );

      return;
    }

    if (
      isClientAccess &&
      !isDni(dni)
    ) {
      setIsSubmittingInternalAccess(
        false
      );

      setRegistrationError(
        'Ingresá el DNI con 7 a 10 dígitos para continuar.'
      );

      return;
    }

    const loginResult =
      isClientAccess
        ? await supabase.rpc(
            'verify_client_login',
            {
              dni_value: dni,
              password_value:
                password,
              company_slug_value:
                companySlug
            }
          )
        : await supabase.rpc(
            'verify_internal_login',
            {
              account_role:
                registrationProfile,
              username_value:
                username,
              password_value:
                password,
              company_slug_value:
                companySlug
            }
          );

    const {
      data,
      error
    } = loginResult;

    setIsSubmittingInternalAccess(
      false
    );

    if (error) {
      setRegistrationError(
        error.message ||
          'No se pudo validar el acceso interno.'
      );
      return;
    }

    const account =
      Array.isArray(data)
        ? data[0]
        : data;

    if (!account) {
      setRegistrationError(
        'No se encontró una cuenta activa con esos datos.'
      );
      return;
    }

    if (
      account.must_change_password
    ) {
      setPasswordChangeAccount(
        account
      );

      setPasswordChangeForm({
        currentPassword:
          password,
        password: '',
        confirmPassword: ''
      });

      setRegistrationForm(
        (current) => ({
          ...current,
          password: '',
          confirmPassword: ''
        })
      );

      setVisiblePasswords(
        emptyVisiblePasswords
      );

      setRegistrationError('');
      setRegistrationSuccess('');

      return;
    }

    onInternalAccess(account);
    closeRegistration();
  };

  const handleClientGoogleAccess =
    async () => {
      if (isInAppBrowser()) {
        sessionStorage.setItem(
          requestedProfileStorageKey,
          'client'
        );

        setCopyLinkStatus('');
        setInAppBrowserNoticeOpen(
          true
        );

        return;
      }

      closeRegistration();

      await handleLogin('client');
    };

  const submitPasswordChange = async (
    event
  ) => {
    event.preventDefault();

    const password =
      passwordChangeForm.password.trim();

    const confirmPassword =
      passwordChangeForm.confirmPassword.trim();

    if (!passwordChangeAccount) {
      setRegistrationError(
        'Volvé a ingresar con tu usuario y contraseña inicial.'
      );
      return;
    }

    if (password.length < 6) {
      setRegistrationError(
        'La nueva contraseña debe tener al menos 6 caracteres.'
      );
      return;
    }

    if (!isAlphanumeric(password)) {
      setRegistrationError(
        'La nueva contraseña solo puede tener letras y números.'
      );
      return;
    }

    if (
      password ===
        passwordChangeForm.currentPassword ||
      password === '123456'
    ) {
      setRegistrationError(
        'La nueva contraseña debe ser distinta a la contraseña inicial.'
      );
      return;
    }

    if (
      password !== confirmPassword
    ) {
      setRegistrationError(
        'Las contraseñas no coinciden.'
      );
      return;
    }

    setIsSubmittingInternalAccess(
      true
    );

    const {
      data,
      error
    } = await supabase.rpc(
      'change_internal_password',
      {
        account_id_value:
          passwordChangeAccount.id,
        current_password_value:
          passwordChangeForm.currentPassword,
        new_password_value:
          password,
        company_slug_value:
          companySlug
      }
    );

    setIsSubmittingInternalAccess(
      false
    );

    if (error) {
      setRegistrationError(
        error.message ||
          'No se pudo cambiar la contraseña.'
      );
      return;
    }

    const account =
      Array.isArray(data)
        ? data[0]
        : data;

    if (!account) {
      setRegistrationError(
        'La contraseña se cambió, pero no se pudo iniciar la sesión. Volvé a ingresar.'
      );
      return;
    }

    onInternalAccess(account);
    closeRegistration();
  };

  const handleLocalClientAccess =
    () => {
      onDismissSessionNotice?.();
      onLocalClientAccess?.();
    };

  const handleLocalInternalAccess =
    (role) => {
      onDismissSessionNotice?.();
      onLocalInternalAccess?.(role);
    };

  const handleGoBack = () => {
    onDismissSessionNotice?.();

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.assign(
      companySlug
        ? `/${companySlug}`
        : '/'
    );
  };

  const companyDisplayName =
    companyContext?.company_name ||
    companyContext?.name ||
    'QuieroTurnoApp';

  const visibleAccessOptions =
    accessOptions.filter(
      (option) =>
        allowedProfiles.includes(
          option.id
        )
    );

  const isSingleCompanyAccess =
    visibleAccessOptions.length === 1 &&
    [
      'client',
      'employee',
      'admin'
    ].includes(
      visibleAccessOptions[0]?.id
    );

  const showPoweredBy =
    isSingleCompanyAccess &&
    Boolean(
      companyContext?.client_logo_data_url
    );

  const hasMultipleProfiles =
    visibleAccessOptions.length > 1;

  const defaultProfileId =
    visibleAccessOptions[0]?.id ??
    null;

  const activeProfile =
    registrationProfile ||
    defaultProfileId;

  const isClientRegistration =
    activeProfile === 'client';

  const generatedRegistrationUsername =
    generateInternalUsername(
      registrationForm.firstName,
      registrationForm.lastName
    );

  const localAccessSlot = (
    <>
      {activeProfile === 'client' &&
        localClientAccessEnabled && (
          <button
            className="login-local-client-button"
            type="button"
            onClick={
              handleLocalClientAccess
            }
          >
            Probar cliente local
          </button>
        )}

      {activeProfile === 'employee' &&
        localInternalAccessEnabled && (
          <button
            className="login-local-client-button"
            type="button"
            onClick={() =>
              handleLocalInternalAccess(
                'employee'
              )
            }
          >
            Probar empleado local
          </button>
        )}

      {activeProfile === 'admin' &&
        localInternalAccessEnabled && (
          <button
            className="login-local-client-button"
            type="button"
            onClick={() =>
              handleLocalInternalAccess(
                'admin'
              )
            }
          >
            Probar admin local
          </button>
        )}
    </>
  );

  const heroBenefits = [
    'Seguimiento de tus pedidos.',
    'Recordatorios',
    'Seriedad',
    'Excelente atención'
  ];

  return (
    <main className="login-page">
      <aside
        className="login-hero-panel"
        aria-hidden="true"
      >
        <div className="login-hero-panel-inner">
          <span className="login-hero-brand">
            {companyDisplayName}
          </span>

          <h2 className="login-hero-title">
            Todo listo para gestionar tus pedidos,
            <span className="login-hero-title-accent">
              Entrá y continuá donde lo dejaste.
            </span>
          </h2>

          <ul className="login-hero-benefits">
            {heroBenefits.map(
              (benefit) => (
                <li
                  key={benefit}
                  className="login-hero-benefit"
                >
                  <span
                    className="login-hero-check"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  {benefit}
                </li>
              )
            )}
          </ul>
        </div>
      </aside>

      <section className="login-card">
        <button
          type="button"
          className="login-back"
          onClick={handleGoBack}
        >
          <span aria-hidden="true">
            ←
          </span>{' '}
          Volver
        </button>

        <h1 className="login-form-title">
          Acceso a {companyDisplayName}
        </h1>

        <p className="login-form-subtitle">
          Gestioná tus pedidos con un solo click.
        </p>

        {showPoweredBy && (
          <div
            className="login-powered-by"
            aria-label="Powered by QuieroTurnoApp"
          >
            <span>
              Realizado por
            </span>

            <a
              href="https://budinesmacare.com.ar/"
              target="_blank"
              rel="noreferrer"
            >
              https://budinesmacare.com.ar/
            </a>
          </div>
        )}

        {sessionNotice && (
          <div
            className="login-session-notice"
            role="alert"
          >
            {sessionNotice}
          </div>
        )}

        {hasMultipleProfiles && (
          <div
            className="login-profile-tabs"
            aria-label="Tipo de acceso"
          >
            {visibleAccessOptions.map(
              (option) => (
                <button
                  key={option.id}
                  type="button"
                  className={
                    activeProfile ===
                    option.id
                      ? 'is-active'
                      : ''
                  }
                  onClick={() =>
                    openRegistration(
                      option.id
                    )
                  }
                >
                  <span aria-hidden="true">
                    {option.icon}
                  </span>

                  {option.title}
                </button>
              )
            )}
          </div>
        )}

        <form
          className="login-inline-form"
          onSubmit={
            passwordChangeAccount
              ? submitPasswordChange
              : submitRegistration
          }
        >
          <div className="login-inline-body">
            {passwordChangeAccount ? (
              <>
                <p className="internal-register-copy">
                  Tu cuenta fue creada con una contraseña inicial. Para continuar, definí una nueva contraseña.
                </p>

                <p className="internal-required-hint">
                  <span
                    className="internal-required-mark"
                    aria-hidden="true"
                  >
                    *
                  </span>{' '}
                  Campo obligatorio
                </p>

                <label className="internal-register-field">
                  Nueva contraseña{' '}
                  <span
                    className="internal-required-mark"
                    aria-hidden="true"
                  >
                    *
                  </span>

                  <span className="internal-password-control">
                    <input
                      type={
                        visiblePasswords.password
                          ? 'text'
                          : 'password'
                      }
                      value={
                        passwordChangeForm.password
                      }
                      minLength="6"
                      maxLength="20"
                      pattern="[A-Za-z0-9]+"
                      autoComplete="new-password"
                      placeholder="Solo letras y números"
                      onChange={(event) =>
                        updatePasswordChangeField(
                          'password',
                          event.target.value
                        )
                      }
                    />

                    <button
                      type="button"
                      className="internal-password-toggle"
                      onClick={() =>
                        togglePasswordVisibility(
                          'password'
                        )
                      }
                      aria-label={
                        visiblePasswords.password
                          ? 'Ocultar contraseña'
                          : 'Mostrar contraseña'
                      }
                      title={
                        visiblePasswords.password
                          ? 'Ocultar contraseña'
                          : 'Mostrar contraseña'
                      }
                    >
                      👁️
                    </button>
                  </span>
                </label>

                <label className="internal-register-field">
                  Repetir contraseña{' '}
                  <span
                    className="internal-required-mark"
                    aria-hidden="true"
                  >
                    *
                  </span>

                  <span className="internal-password-control">
                    <input
                      type={
                        visiblePasswords.confirmPassword
                          ? 'text'
                          : 'password'
                      }
                      value={
                        passwordChangeForm.confirmPassword
                      }
                      minLength="6"
                      maxLength="20"
                      pattern="[A-Za-z0-9]+"
                      autoComplete="new-password"
                      placeholder="Confirmá la contraseña"
                      onChange={(event) =>
                        updatePasswordChangeField(
                          'confirmPassword',
                          event.target.value
                        )
                      }
                    />

                    <button
                      type="button"
                      className="internal-password-toggle"
                      onClick={() =>
                        togglePasswordVisibility(
                          'confirmPassword'
                        )
                      }
                      aria-label={
                        visiblePasswords.confirmPassword
                          ? 'Ocultar contraseña'
                          : 'Mostrar contraseña'
                      }
                      title={
                        visiblePasswords.confirmPassword
                          ? 'Ocultar contraseña'
                          : 'Mostrar contraseña'
                      }
                    >
                      👁️
                    </button>
                  </span>
                </label>
              </>
            ) : (
              <>
                <p className="internal-register-copy">
                  {isClientRegistration
                    ? internalAccessMode ===
                      'register'
                      ? 'Creá tu cuenta de cliente con datos obligatorios. El usuario se genera con la inicial del nombre y el apellido.'
                      : 'Ingresá con DNI y contraseña. También podés continuar con Google.'
                    : internalAccessMode ===
                      'register'
                    ? 'Creá un acceso interno con datos personales y contraseña. El usuario se genera con la inicial del nombre y el apellido.'
                    : 'Ingresá con tu usuario y contraseña internos si ya tenés una cuenta aprobada.'}
                </p>

                <p className="internal-required-hint">
                  <span
                    className="internal-required-mark"
                    aria-hidden="true"
                  >
                    *
                  </span>{' '}
                  Campo obligatorio
                </p>

                {isClientRegistration &&
                  internalAccessMode ===
                    'login' && (
                    <>
                      <button
                        className="login-google-button"
                        type="button"
                        onClick={
                          handleClientGoogleAccess
                        }
                      >
                        <svg
                          className="login-google-icon"
                          viewBox="0 0 48 48"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            fill="#EA4335"
                            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                          />

                          <path
                            fill="#4285F4"
                            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                          />

                          <path
                            fill="#FBBC05"
                            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                          />

                          <path
                            fill="#34A853"
                            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                          />
                        </svg>

                        Continuar con Google
                      </button>

                      <p className="client-access-separator">
                        o ingresar con dni
                      </p>
                    </>
                  )}

                {internalAccessMode ===
                  'login' && (
                  <>
                    {!isClientRegistration && (
                      <label className="internal-register-field">
                        Usuario{' '}
                        <span
                          className="internal-required-mark"
                          aria-hidden="true"
                        >
                          *
                        </span>

                        <input
                          type="text"
                          value={
                            registrationForm.username
                          }
                          minLength="3"
                          maxLength="40"
                          autoComplete="username"
                          placeholder="Ej: mperez"
                          onChange={(event) =>
                            updateRegistrationField(
                              'username',
                              event.target.value
                            )
                          }
                        />
                      </label>
                    )}

                    {isClientRegistration && (
                      <label className="internal-register-field">
                        DNI{' '}
                        <span
                          className="internal-required-mark"
                          aria-hidden="true"
                        >
                          *
                        </span>

                        <input
                          type="text"
                          value={
                            registrationForm.dni
                          }
                          maxLength="10"
                          autoComplete="off"
                          inputMode="numeric"
                          pattern="[0-9]{7,10}"
                          placeholder="Solo números"
                          onChange={(event) =>
                            updateRegistrationField(
                              'dni',
                              event.target.value.replace(
                                /\D/g,
                                ''
                              )
                            )
                          }
                        />
                      </label>
                    )}
                  </>
                )}

                {internalAccessMode ===
                  'register' && (
                  <>
                    <div className="internal-register-two-columns">
                      <label className="internal-register-field">
                        Nombre{' '}
                        <span
                          className="internal-required-mark"
                          aria-hidden="true"
                        >
                          *
                        </span>

                        <input
                          type="text"
                          value={
                            registrationForm.firstName
                          }
                          maxLength="40"
                          autoComplete="given-name"
                          placeholder="Martina"
                          onChange={(event) =>
                            updateRegistrationField(
                              'firstName',
                              event.target.value
                            )
                          }
                        />
                      </label>

                      <label className="internal-register-field">
                        Apellido{' '}
                        <span
                          className="internal-required-mark"
                          aria-hidden="true"
                        >
                          *
                        </span>

                        <input
                          type="text"
                          value={
                            registrationForm.lastName
                          }
                          maxLength="40"
                          autoComplete="family-name"
                          placeholder="Pérez"
                          onChange={(event) =>
                            updateRegistrationField(
                              'lastName',
                              event.target.value
                            )
                          }
                        />
                      </label>
                    </div>

                    <label className="internal-register-field">
                      Usuario

                      <input
                        value={
                          generatedRegistrationUsername
                        }
                        disabled
                        placeholder="Ej: mperez"
                      />
                    </label>

                    {isClientRegistration ? (
                      <>
                        <div className="internal-register-two-columns">
                          <label className="internal-register-field">
                            DNI{' '}
                            <span
                              className="internal-required-mark"
                              aria-hidden="true"
                            >
                              *
                            </span>

                            <input
                              type="text"
                              value={
                                registrationForm.dni
                              }
                              maxLength="10"
                              autoComplete="off"
                              inputMode="numeric"
                              pattern="[0-9]{7,10}"
                              placeholder="Solo números"
                              onChange={(event) =>
                                updateRegistrationField(
                                  'dni',
                                  event.target.value.replace(
                                    /\D/g,
                                    ''
                                  )
                                )
                              }
                            />
                          </label>

                          <label className="internal-register-field">
                            Celular{' '}
                            <span
                              className="internal-required-mark"
                              aria-hidden="true"
                            >
                              *
                            </span>

                            <input
                              type="tel"
                              value={
                                registrationForm.phone
                              }
                              maxLength="30"
                              autoComplete="tel"
                              placeholder="Ej: 11 5555 5555"
                              onChange={(event) =>
                                updateRegistrationField(
                                  'phone',
                                  event.target.value
                                )
                              }
                            />
                          </label>
                        </div>

                        <label className="internal-register-field">
                          Mail (opcional)

                          <input
                            type="email"
                            value={
                              registrationForm.email
                            }
                            maxLength="120"
                            autoComplete="email"
                            placeholder="nombre@correo.com"
                            onChange={(event) =>
                              updateRegistrationField(
                                'email',
                                event.target.value
                              )
                            }
                          />
                        </label>

                        <div className="internal-register-two-columns internal-register-age-row">
                          <label className="internal-register-field">
                            Fecha de nacimiento

                            <input
                              type="date"
                              value={
                                registrationForm.birthDate
                              }
                              max={
                                new Date()
                                  .toISOString()
                                  .slice(
                                    0,
                                    10
                                  )
                              }
                              onChange={(event) =>
                                updateRegistrationField(
                                  'birthDate',
                                  event.target.value
                                )
                              }
                            />
                          </label>

                          <label className="internal-register-field">
                            Edad

                            <input
                              value={calculateAge(
                                registrationForm.birthDate
                              )}
                              disabled
                              placeholder="Auto"
                            />
                          </label>
                        </div>

                        <div className="internal-register-address-grid">
                          <label className="internal-register-field">
                            Calle

                            <input
                              value={
                                registrationForm.addressStreet
                              }
                              maxLength="80"
                              autoComplete="address-line1"
                              onChange={(event) =>
                                updateRegistrationField(
                                  'addressStreet',
                                  event.target.value
                                )
                              }
                            />
                          </label>

                          <label className="internal-register-field">
                            Nro.

                            <input
                              value={
                                registrationForm.addressNumber
                              }
                              maxLength="12"
                              onChange={(event) =>
                                updateRegistrationField(
                                  'addressNumber',
                                  event.target.value
                                )
                              }
                            />
                          </label>

                          <label className="internal-register-field">
                            Localidad

                            <input
                              value={
                                registrationForm.addressLocality
                              }
                              maxLength="60"
                              autoComplete="address-level2"
                              onChange={(event) =>
                                updateRegistrationField(
                                  'addressLocality',
                                  event.target.value
                                )
                              }
                            />
                          </label>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="internal-register-two-columns internal-register-age-row">
                          <label className="internal-register-field">
                            Fecha de nacimiento{' '}
                            <span
                              className="internal-required-mark"
                              aria-hidden="true"
                            >
                              *
                            </span>

                            <input
                              type="date"
                              value={
                                registrationForm.birthDate
                              }
                              max={
                                new Date()
                                  .toISOString()
                                  .slice(
                                    0,
                                    10
                                  )
                              }
                              onChange={(event) =>
                                updateRegistrationField(
                                  'birthDate',
                                  event.target.value
                                )
                              }
                            />
                          </label>

                          <label className="internal-register-field">
                            Edad

                            <input
                              value={calculateAge(
                                registrationForm.birthDate
                              )}
                              disabled
                              placeholder="Auto"
                            />
                          </label>
                        </div>

                        <label className="internal-register-field">
                          Celular{' '}
                          <span
                            className="internal-required-mark"
                            aria-hidden="true"
                          >
                            *
                          </span>

                          <input
                            type="tel"
                            value={
                              registrationForm.phone
                            }
                            maxLength="30"
                            autoComplete="tel"
                            placeholder="Ej: 11 5555 5555"
                            onChange={(event) =>
                              updateRegistrationField(
                                'phone',
                                event.target.value
                              )
                            }
                          />
                        </label>

                        <label className="internal-register-field">
                          Mail{' '}
                          <span
                            className="internal-required-mark"
                            aria-hidden="true"
                          >
                            *
                          </span>

                          <input
                            type="email"
                            value={
                              registrationForm.email
                            }
                            maxLength="120"
                            autoComplete="email"
                            placeholder="martina@correo.com"
                            onChange={(event) =>
                              updateRegistrationField(
                                'email',
                                event.target.value
                              )
                            }
                          />
                        </label>

                        <div className="internal-register-address-grid">
                          <label className="internal-register-field">
                            Calle

                            <input
                              value={
                                registrationForm.addressStreet
                              }
                              maxLength="80"
                              autoComplete="address-line1"
                              onChange={(event) =>
                                updateRegistrationField(
                                  'addressStreet',
                                  event.target.value
                                )
                              }
                            />
                          </label>

                          <label className="internal-register-field">
                            Nro.

                            <input
                              value={
                                registrationForm.addressNumber
                              }
                              maxLength="12"
                              onChange={(event) =>
                                updateRegistrationField(
                                  'addressNumber',
                                  event.target.value
                                )
                              }
                            />
                          </label>

                          <label className="internal-register-field">
                            Localidad

                            <input
                              value={
                                registrationForm.addressLocality
                              }
                              maxLength="60"
                              autoComplete="address-level2"
                              onChange={(event) =>
                                updateRegistrationField(
                                  'addressLocality',
                                  event.target.value
                                )
                              }
                            />
                          </label>
                        </div>

                        <label className="internal-register-field internal-photo-field">
                          Foto de perfil

                          <span className="internal-photo-control">
                            <span
                              className="internal-photo-preview"
                              aria-hidden="true"
                            >
                              {registrationForm.photoUrl ? (
                                <img
                                  src={
                                    registrationForm.photoUrl
                                  }
                                  alt=""
                                />
                              ) : (
                                'Foto'
                              )}
                            </span>

                            <input
                              type="file"
                              accept="image/*"
                              onChange={
                                updatePhoto
                              }
                            />
                          </span>
                        </label>
                      </>
                    )}
                  </>
                )}

                <label className="internal-register-field">
                  Contraseña{' '}
                  <span
                    className="internal-required-mark"
                    aria-hidden="true"
                  >
                    *
                  </span>

                  <span className="internal-password-control">
                    <input
                      type={
                        visiblePasswords.password
                          ? 'text'
                          : 'password'
                      }
                      value={
                        registrationForm.password
                      }
                      minLength="6"
                      maxLength="20"
                      pattern="[A-Za-z0-9]+"
                      autoComplete={
                        internalAccessMode ===
                        'register'
                          ? 'new-password'
                          : 'current-password'
                      }
                      placeholder="Solo letras y números"
                      onChange={(event) =>
                        updateRegistrationField(
                          'password',
                          event.target.value
                        )
                      }
                    />

                    <button
                      type="button"
                      className="internal-password-toggle"
                      onClick={() =>
                        togglePasswordVisibility(
                          'password'
                        )
                      }
                      aria-label={
                        visiblePasswords.password
                          ? 'Ocultar contraseña'
                          : 'Mostrar contraseña'
                      }
                      title={
                        visiblePasswords.password
                          ? 'Ocultar contraseña'
                          : 'Mostrar contraseña'
                      }
                    >
                      👁️
                    </button>
                  </span>
                </label>

                {internalAccessMode ===
                  'register' && (
                  <label className="internal-register-field">
                    Repetir contraseña{' '}
                    <span
                      className="internal-required-mark"
                      aria-hidden="true"
                    >
                      *
                    </span>

                    <span className="internal-password-control">
                      <input
                        type={
                          visiblePasswords.confirmPassword
                            ? 'text'
                            : 'password'
                        }
                        value={
                          registrationForm.confirmPassword
                        }
                        minLength="6"
                        maxLength="20"
                        pattern="[A-Za-z0-9]+"
                        autoComplete="new-password"
                        placeholder="Confirmá la contraseña"
                        onChange={(event) =>
                          updateRegistrationField(
                            'confirmPassword',
                            event.target.value
                          )
                        }
                      />

                      <button
                        type="button"
                        className="internal-password-toggle"
                        onClick={() =>
                          togglePasswordVisibility(
                            'confirmPassword'
                          )
                        }
                        aria-label={
                          visiblePasswords.confirmPassword
                            ? 'Ocultar contraseña'
                            : 'Mostrar contraseña'
                        }
                        title={
                          visiblePasswords.confirmPassword
                            ? 'Ocultar contraseña'
                            : 'Mostrar contraseña'
                        }
                      >
                        👁️
                      </button>
                    </span>
                  </label>
                )}
              </>
            )}

            {registrationError && (
              <div
                className="internal-register-error"
                role="alert"
              >
                {registrationError}
              </div>
            )}

            {registrationSuccess && (
              <div
                className="internal-register-success"
                role="status"
              >
                {registrationSuccess}
              </div>
            )}

            <div className="internal-register-actions">
              <button
                className="internal-register-primary login-inline-submit"
                type="submit"
                disabled={
                  isSubmittingInternalAccess
                }
              >
                {isSubmittingInternalAccess
                  ? 'Procesando...'
                  : passwordChangeAccount
                    ? 'Cambiar contraseña'
                    : internalAccessMode ===
                        'register'
                      ? 'Registrar'
                      : 'Ingresar'}
              </button>
            </div>

            {!passwordChangeAccount && (
              <p className="login-mode-switch">
                {internalAccessMode ===
                'register'
                  ? '¿Ya tenés una cuenta? '
                  : '¿No tenés una cuenta? '}

                <button
                  type="button"
                  onClick={() =>
                    changeInternalAccessMode(
                      internalAccessMode ===
                        'register'
                        ? 'login'
                        : 'register'
                    )
                  }
                >
                  {internalAccessMode ===
                  'register'
                    ? 'Ingresá'
                    : 'Registrate'}
                </button>
              </p>
            )}

            {localAccessSlot}
          </div>
        </form>
      </section>

      {inAppBrowserNoticeOpen && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label="Abrir en navegador"
        >
          <div className="agenda-modal-card login-browser-modal">
            <div className="agenda-modal-header">
              Abrir en navegador
            </div>

            <div className="agenda-modal-body login-browser-modal-body">
              <p>
                Instagram puede bloquear el inicio de sesión con Google. Para entrar como cliente, abrí esta página en Chrome o Safari.
              </p>

              <div className="login-browser-link">
                {getAppLink(companySlug)}
              </div>

              {copyLinkStatus && (
                <p className="login-browser-status">
                  {copyLinkStatus}
                </p>
              )}
            </div>

            <div className="agenda-modal-actions">
              <button
                className="agenda-option-button"
                type="button"
                onClick={() =>
                  setInAppBrowserNoticeOpen(
                    false
                  )
                }
              >
                Cerrar
              </button>

              <button
                className="agenda-close-button"
                type="button"
                onClick={
                  copyAppLink
                }
              >
                Copiar link
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}