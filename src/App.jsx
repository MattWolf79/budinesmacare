import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';

import { supabase } from './api/supabaseClient';

// Reemplaza window.alert por el modal <AppAlertHost>
// todas las llamadas alert() usan el componente.
import {
  showAppAlert as alert
} from './utils/appAlert';

import Dashboard from './pages/Dashboard';
import LandingPage from './components/LandingPage';
import Login from './components/Login';
import PlatformAdmin from './components/PlatformAdmin';
import RoleAccess from './components/RoleAccess';

import {
  applyAppearanceStyle,
  getStoredAppearanceForSlug,
  rememberAppearanceForSlug
} from './utils/appearance';

import {
  getClientPortalPath,
  getCompanyPortalFromLocation,
  getCompanySlugFromLocation,
  isPlatformAdminLocation
} from './utils/tenant';

const validProfiles = [
  'client',
  'employee',
  'admin'
];

const profileStorageKey =
  'turnos_access_profile';

const requestedProfileStorageKey =
  'turnos_requested_profile';

const internalSessionStorageKey =
  'turnos_internal_session';

const localClientSessionStorageKey =
  'turnos_local_client_session';

const clienteGoogleSincronizadoStorageKey =
  'turnos_google_client_synced';

const lastActivityStorageKey =
  'turnos_last_activity_at';

const oauthCompanySlugStorageKey =
  'turnos_oauth_company_slug';

const inactivityLimitMs =
  5 * 60 * 1000;

const inactivityMessage =
  'Pasaron mas de 5 min sin operar, volver a intentar.';

// Las sesiones internas (admin/empleado/cliente por DNI)
// se guardan en localStorage para compartirlas entre pestañas.
// Así, cuando el link "Ir al Turno" del mail abre una pestaña
// nueva, reutiliza la sesión ya iniciada en otra pestaña.
// El corte por inactividad (5 min) sigue vigente porque también
// se apoya en esta misma persistencia.

// eslint-disable-next-line no-redeclare
const sessionStorage =
  window.localStorage;

const isDevLocalHost = (
  hostname
) =>
  ['localhost', '127.0.0.1'].includes(
    hostname
  ) ||
  /^10\./.test(hostname) ||
  /^192\.168\./.test(hostname) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(
    hostname
  );

const localClientAccessEnabled =
  import.meta.env.DEV &&
  isDevLocalHost(
    window.location.hostname
  );

const localInternalAccessEnabled =
  import.meta.env.DEV &&
  isDevLocalHost(
    window.location.hostname
  );

const getLastActivityAt = () =>
  Number(
    sessionStorage.getItem(
      lastActivityStorageKey
    ) || 0
  );

const touchLastActivity = () => {
  sessionStorage.setItem(
    lastActivityStorageKey,
    String(Date.now())
  );
};

const getAvailableProfiles = (
  role
) => {
  if (role === 'admin') {
    return ['admin'];
  }

  if (role === 'employee') {
    return ['employee'];
  }

  return ['client'];
};

const getAuthPhotoUrl = (
  user
) => {
  const metadata =
    user?.user_metadata || {};

  return (
    metadata.avatar_url ||
    metadata.picture ||
    metadata.photo_url ||
    null
  );
};

const getAuthDisplayName = (
  user
) => {
  const metadata =
    user?.user_metadata || {};

  return (
    metadata.full_name ||
    metadata.name ||
    user?.email ||
    ''
  );
};

const separarNombreClienteGoogle = (
  user
) => {
  const metadata =
    user?.user_metadata || {};

  const nombre = String(
    metadata.given_name || ''
  ).trim();

  const apellido = String(
    metadata.family_name || ''
  ).trim();

  if (nombre || apellido) {
    return {
      nombre,
      apellido
    };
  }

  const partes = String(
    getAuthDisplayName(user) || ''
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    nombre: partes[0] || '',
    apellido: partes
      .slice(1)
      .join(' ')
  };
};

const obtenerTelefonoClienteGoogle = (
  user
) => {
  const metadata =
    user?.user_metadata || {};

  return String(
    user?.phone ||
      metadata.phone ||
      metadata.phone_number ||
      metadata.mobile_phone ||
      ''
  ).trim();
};

const loadStoredInternalSession = (
  expectedCompanySlug = null
) => {
  const storedSession =
    sessionStorage.getItem(
      internalSessionStorageKey
    );

  if (!storedSession) {
    return null;
  }

  try {
    const parsedSession =
      JSON.parse(storedSession);

    if (
      !validProfiles.includes(
        parsedSession.role
      )
    ) {
      return null;
    }

    if (
      expectedCompanySlug &&
      parsedSession.companySlug !==
        expectedCompanySlug
    ) {
      sessionStorage.removeItem(
        internalSessionStorageKey
      );

      return null;
    }

    return parsedSession;
  } catch {
    sessionStorage.removeItem(
      internalSessionStorageKey
    );

    return null;
  }
};

const loadStoredLocalClientSession = (
  expectedCompanySlug = null
) => {
  if (!localClientAccessEnabled) {
    return null;
  }

  const storedSession =
    sessionStorage.getItem(
      localClientSessionStorageKey
    );

  if (!storedSession) {
    return null;
  }

  try {
    const parsedSession =
      JSON.parse(storedSession);

    if (
      expectedCompanySlug &&
      parsedSession.companySlug !==
        expectedCompanySlug
    ) {
      sessionStorage.removeItem(
        localClientSessionStorageKey
      );

      return null;
    }

    return parsedSession?.role ===
      'client'
      ? parsedSession
      : null;
  } catch {
    sessionStorage.removeItem(
      localClientSessionStorageKey
    );

    return null;
  }
};

const getStoredProfile = () => {
  const requestedProfile =
    sessionStorage.getItem(
      requestedProfileStorageKey
    );

  const storedProfile =
    sessionStorage.getItem(
      profileStorageKey
    );

  const selectedProfile =
    requestedProfile ||
    storedProfile ||
    'client';

  sessionStorage.removeItem(
    requestedProfileStorageKey
  );

  return validProfiles.includes(
    selectedProfile
  )
    ? selectedProfile
    : 'client';
};

const hasAuthCallbackParams = () => {
  const searchParams =
    new URLSearchParams(
      window.location.search || ''
    );

  const hashParams =
    new URLSearchParams(
      String(
        window.location.hash || ''
      ).replace(/^#/, '')
    );

  return (
    searchParams.has('code') ||
    searchParams.has('error') ||
    hashParams.has(
      'access_token'
    ) ||
    hashParams.has('error')
  );
};

/*
 * Recupera el slug que guardamos antes de enviar
 * al usuario a Google.
 *
 * Si Google/Supabase devuelve:
 *
 *   http://localhost:5173/
 *
 * podemos reconstruir:
 *
 *   http://localhost:5173/miempresa/sacarturno
 *
 * conservando además ?code=... o el hash OAuth.
 */
const recoverOAuthCompanySlug = () => {
  const currentSlug =
    getCompanySlugFromLocation();

  if (currentSlug) {
    return currentSlug;
  }

  const storedSlug =
    sessionStorage.getItem(
      oauthCompanySlugStorageKey
    );

  if (!storedSlug) {
    return null;
  }

  return String(
    storedSlug
  )
    .trim()
    .toLowerCase();
};

export default function App() {
  const isPlatformAdminRoute =
    isPlatformAdminLocation();

  const companyPortal =
    getCompanyPortalFromLocation();

  const isClientPortal =
    companyPortal === 'client';

  const isAdminPortal =
    companyPortal === 'admin';

  const isEmployeePortal =
    companyPortal === 'employee';

  const isInternalPortal =
    isAdminPortal ||
    isEmployeePortal;

  /*
   * IMPORTANTE:
   * usamos el slug de la URL normalmente,
   * pero si OAuth volvió a "/",
   * recuperamos el slug temporal guardado
   * antes de ir a Google.
   */
  const companySlug =
    getCompanySlugFromLocation() ||
    recoverOAuthCompanySlug();

  const routeAllowedProfiles =
    isClientPortal
      ? ['client']
      : isAdminPortal
        ? ['admin']
        : isEmployeePortal
          ? ['employee']
          : validProfiles;

  const [
    companyContext,
    setCompanyContext
  ] = useState(null);

  const [
    companyContextLoading,
    setCompanyContextLoading
  ] = useState(true);

  const [
    session,
    setSession
  ] = useState(null);

  const [
    authLoading,
    setAuthLoading
  ] = useState(true);

  const [
    internalSession,
    setInternalSession
  ] = useState(() =>
    loadStoredInternalSession(
      companySlug
    )
  );

  const [
    localClientSession,
    setLocalClientSession
  ] = useState(() =>
    loadStoredLocalClientSession(
      companySlug
    )
  );

  const [
    accessProfile,
    setAccessProfile
  ] = useState(null);

  const [
    authProfile,
    setAuthProfile
  ] = useState(null);

  const [
    sessionExpiredMessage,
    setSessionExpiredMessage
  ] = useState('');

  const baseAvailableProfiles =
    internalSession
      ? getAvailableProfiles(
          internalSession.role
        )
      : getAvailableProfiles(
          authProfile?.role ||
            accessProfile
        );

  const availableProfiles =
    baseAvailableProfiles.filter(
      (profile) =>
        routeAllowedProfiles.includes(
          profile
        )
    );

  const canChangeProfile =
    availableProfiles.length > 1;

  const companyContextId =
    companyContext?.id;

  const landingEnabled =
    companyContext?.landing
      ?.habilitada === true;

  /*
   * NUEVO:
   *
   * Si OAuth vuelve a "/",
   * reconstruimos la URL de la empresa
   * antes de procesar normalmente la aplicación.
   *
   * Conservamos ?code=... y el hash OAuth.
   */
  useEffect(() => {
    const currentUrlSlug =
      getCompanySlugFromLocation();

    if (currentUrlSlug) {
      return;
    }

    const storedSlug =
      sessionStorage.getItem(
        oauthCompanySlugStorageKey
      );

    if (!storedSlug) {
      return;
    }

    const normalizedSlug =
      String(storedSlug)
        .trim()
        .toLowerCase();

    if (!normalizedSlug) {
      sessionStorage.removeItem(
        oauthCompanySlugStorageKey
      );

      return;
    }

    const callbackExists =
      hasAuthCallbackParams();

    /*
     * Solo hacemos esta recuperación
     * cuando realmente estamos en la raíz.
     */
    const pathname =
      window.location.pathname;

    const isRootPath =
      pathname === '/' ||
      pathname === '/index.html';

    if (!isRootPath) {
      return;
    }

    const targetPath =
      getClientPortalPath(
        normalizedSlug
      );

    if (!targetPath) {
      sessionStorage.removeItem(
        oauthCompanySlugStorageKey
      );

      return;
    }

    const search =
      window.location.search || '';

    const hash =
      window.location.hash || '';

    const targetUrl =
      `${targetPath}${search}${hash}`;

    /*
     * Eliminamos la marca antes de navegar.
     * Si la navegación funciona, no queda
     * un slug OAuth viejo para futuras visitas.
     */
    sessionStorage.removeItem(
      oauthCompanySlugStorageKey
    );

    /*
     * replace evita agregar una entrada
     * incorrecta "/" al historial.
     */
    window.location.replace(
      targetUrl
    );
  }, []);

  useEffect(() => {
    const cachedForSlug =
      getStoredAppearanceForSlug(
        companySlug
      );

    applyAppearanceStyle(
      document.documentElement.style,
      companyContext?.appearance ||
        cachedForSlug,
      {
        remember: false,
        preferStoredDefault: true
      }
    );

    if (
      companyContext?.appearance &&
      companySlug
    ) {
      rememberAppearanceForSlug(
        companySlug,
        companyContext.appearance
      );
    }
  }, [
    companyContext?.appearance,
    companySlug
  ]);

  useEffect(() => {
    if (
      companyPortal === 'root' &&
      companySlug &&
      !companyContextLoading &&
      companyContext?.active &&
      !landingEnabled
    ) {
      window.location.replace(
        getClientPortalPath(
          companySlug
        )
      );
    }
  }, [
    companyPortal,
    companySlug,
    companyContextLoading,
    companyContext,
    landingEnabled
  ]);

  useEffect(() => {
    let active = true;
    let retryTimeoutId = null;

    const loadCompanyContext =
      async () => {
        setCompanyContextLoading(
          true
        );

        if (!companySlug) {
          setCompanyContext({
            active: false,
            status: 'missing_slug',
            slug: null
          });

          setCompanyContextLoading(
            false
          );

          return;
        }

        const loadContextAttempt =
          () =>
            supabase.rpc(
              'get_company_public_context',
              {
                slug_value:
                  companySlug
              }
            );

        let {
          data,
          error
        } = await loadContextAttempt();

        if (
          active &&
          (
            error ||
            !data?.active
          )
        ) {
          await new Promise(
            (resolve) => {
              retryTimeoutId =
                window.setTimeout(
                  resolve,
                  450
                );
            }
          );

          if (!active) {
            return;
          }

          ({
            data,
            error
          } =
            await loadContextAttempt());
        }

        if (!active) {
          return;
        }

        setCompanyContext(
          error
            ? {
                active: false,
                status:
                  'not_found',
                slug:
                  companySlug
              }
            : data
        );

        setCompanyContextLoading(
          false
        );
      };

    loadCompanyContext();

    return () => {
      active = false;

      if (retryTimeoutId) {
        window.clearTimeout(
          retryTimeoutId
        );
      }
    };
  }, [companySlug]);

  const refreshCompanyContext =
    useCallback(
      async () => {
        if (!companySlug) {
          return;
        }

        const {
          data,
          error
        } = await supabase.rpc(
          'get_company_public_context',
          {
            slug_value:
              companySlug
          }
        );

        if (
          !error &&
          data?.active
        ) {
          setCompanyContext(
            data
          );
        }
      },
      [companySlug]
    );

  const selectAccessProfile = (
    profile
  ) => {
    setSessionExpiredMessage('');

    touchLastActivity();

    setAccessProfile(
      profile
    );

    sessionStorage.setItem(
      profileStorageKey,
      profile
    );
  };

  const clearAccessProfile =
    () => {
      setAccessProfile(null);
      setAuthProfile(null);
      setLocalClientSession(null);

      sessionStorage.removeItem(
        profileStorageKey
      );

      sessionStorage.removeItem(
        requestedProfileStorageKey
      );

      sessionStorage.removeItem(
        localClientSessionStorageKey
      );
    };

  const clearInternalSession =
    () => {
      setInternalSession(null);

      sessionStorage.removeItem(
        internalSessionStorageKey
      );
    };

  const changeInternalAccess =
    () => {
      setSessionExpiredMessage('');

      clearAccessProfile();
      clearInternalSession();
    };

  useEffect(() => {
    if (
      !internalSession ||
      routeAllowedProfiles.includes(
        internalSession.role
      )
    ) {
      return;
    }

    setSessionExpiredMessage(
      'Ingresá con el perfil correspondiente a esta URL.'
    );

    clearInternalSession();

    setAccessProfile(null);

    sessionStorage.removeItem(
      profileStorageKey
    );
  }, [
    internalSession,
    routeAllowedProfiles
  ]);

  const startInternalSession = (
    account
  ) => {
    if (
      !routeAllowedProfiles.includes(
        account.role
      )
    ) {
      setSessionExpiredMessage(
        'Ingresá con el perfil correspondiente a esta URL.'
      );

      return;
    }

    const nextSession = {
      id: account.id,
      sessionToken:
        account.session_token ||
        account.sessionToken ||
        null,
      role: account.role,
      displayName:
        account.display_name,
      username:
        account.username ||
        null,
      firstName:
        account.first_name ||
        null,
      lastName:
        account.last_name ||
        null,
      photoUrl:
        account.photo_url ||
        null,
      employeeId:
        account.employee_id ||
        null,
      companySlug
    };

    setSessionExpiredMessage('');

    setInternalSession(
      nextSession
    );

    setAccessProfile(
      account.role
    );

    touchLastActivity();

    sessionStorage.setItem(
      internalSessionStorageKey,
      JSON.stringify(
        nextSession
      )
    );

    sessionStorage.setItem(
      profileStorageKey,
      account.role
    );
  };

  const startLocalClientSession =
    () => {
      if (
        !localClientAccessEnabled
      ) {
        return;
      }

      const nextSession = {
        id:
          '00000000-0000-4000-8000-000000000001',
        email:
          'cliente.local@turnos.test',
        role: 'client',
        displayName:
          'Cliente local',
        photoUrl: null,
        isLocalClient: true,
        companySlug
      };

      setSessionExpiredMessage('');

      setSession(null);
      setAuthProfile(null);

      clearInternalSession();

      setLocalClientSession(
        nextSession
      );

      setAccessProfile(
        'client'
      );

      touchLastActivity();

      sessionStorage.setItem(
        localClientSessionStorageKey,
        JSON.stringify(
          nextSession
        )
      );

      sessionStorage.setItem(
        profileStorageKey,
        'client'
      );
    };

  const startLocalInternalSession =
    (role) => {
      if (
        !localInternalAccessEnabled ||
        ![
          'employee',
          'admin'
        ].includes(role)
      ) {
        return;
      }

      const nextSession = {
        id: `00000000-0000-4000-8000-${
          role === 'admin'
            ? '000000000002'
            : '000000000003'
        }`,
        sessionToken:
          'local-dev-session',
        role,
        displayName:
          role === 'admin'
            ? 'Admin local'
            : 'Empleado local',
        username:
          role === 'admin'
            ? 'admin.local'
            : 'empleado.local',
        firstName:
          role === 'admin'
            ? 'Admin'
            : 'Empleado',
        lastName: 'Local',
        photoUrl: null,
        employeeId:
          role === 'employee'
            ? '00000000-0000-4000-8000-000000000101'
            : null,
        companySlug,
        isLocalInternal: true
      };

      setSessionExpiredMessage('');

      setLocalClientSession(
        null
      );

      sessionStorage.removeItem(
        localClientSessionStorageKey
      );

      setInternalSession(
        nextSession
      );

      setAccessProfile(
        role
      );

      touchLastActivity();

      sessionStorage.setItem(
        internalSessionStorageKey,
        JSON.stringify(
          nextSession
        )
      );

      sessionStorage.setItem(
        profileStorageKey,
        role
      );
    };

  const logout = async () => {
    setSessionExpiredMessage('');

    clearAccessProfile();
    clearInternalSession();

    setLocalClientSession(
      null
    );

    sessionStorage.removeItem(
      lastActivityStorageKey
    );

    const {
      error
    } =
      await supabase.auth.signOut();

    if (error) {
      alert(
        'No se pudo cerrar la sesión. Intentá nuevamente.'
      );
    }
  };

  const loadAuthProfile =
    useCallback(
      async (user) => {
        let profileQuery =
          supabase
            .from('profiles')
            .select(
              'role, display_name, email, employee_id, active'
            )
            .eq(
              'user_id',
              user.id
            );

        if (companyContextId) {
          profileQuery =
            profileQuery.eq(
              'company_id',
              companyContextId
            );
        }

        const {
          data,
          error
        } =
          await profileQuery.maybeSingle();

        if (
          error ||
          data?.active === false
        ) {
          return null;
        }

        return data;
      },
      [companyContextId]
    );

  const applyAuthSession =
    useCallback(
      async (nextSession) => {
        setSession(
          nextSession
        );

        if (!nextSession) {
          return;
        }

        setSessionExpiredMessage('');

        touchLastActivity();

        const profile =
          await loadAuthProfile(
            nextSession.user
          );

        const profileRole =
          validProfiles.includes(
            profile?.role
          )
            ? profile.role
            : null;

        setAuthProfile(
          profile
        );

        setAccessProfile(
          profileRole ||
            getStoredProfile()
        );
      },
      [loadAuthProfile]
    );

  useEffect(() => {
    let active = true;

    const initializeAuthSession =
      async () => {
        setAuthLoading(true);

        try {
          if (
            hasAuthCallbackParams()
          ) {
            await supabase.auth.exchangeCodeForSession(
              window.location.href
            );

            window.history.replaceState(
              {},
              document.title,
              window.location.pathname +
                window.location.hash
            );
          }

          const {
            data
          } =
            await supabase.auth.getSession();

          if (!active) {
            return;
          }

          await applyAuthSession(
            data.session
          );
        } catch (error) {
          console.error(
            'No se pudo procesar el inicio de sesión.',
            error
          );
        } finally {
          if (active) {
            setAuthLoading(
              false
            );
          }
        }
      };

    initializeAuthSession();

    const {
      data: listener
    } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {
          if (session) {
            applyAuthSession(
              session
            ).finally(() =>
              setAuthLoading(
                false
              )
            );
          } else {
            setSession(null);
            setAuthProfile(null);

            const storedInternalSession =
              loadStoredInternalSession(
                companySlug
              );

            if (
              storedInternalSession &&
              routeAllowedProfiles.includes(
                storedInternalSession.role
              )
            ) {
              setInternalSession(
                storedInternalSession
              );

              setAccessProfile(
                storedInternalSession.role
              );
            } else if (
              storedInternalSession
            ) {
              sessionStorage.removeItem(
                internalSessionStorageKey
              );

              clearAccessProfile();
            } else if (
              localClientAccessEnabled
            ) {
              const storedLocalClientSession =
                loadStoredLocalClientSession(
                  companySlug
                );

              if (
                storedLocalClientSession
              ) {
                setLocalClientSession(
                  storedLocalClientSession
                );

                setAccessProfile(
                  'client'
                );
              } else {
                clearAccessProfile();
              }
            } else {
              clearAccessProfile();
            }

            setAuthLoading(
              false
            );
          }
        }
      );

    return () => {
      active = false;

      listener.subscription.unsubscribe();
    };
  }, [
    applyAuthSession,
    companySlug
  ]);

  useEffect(() => {
    if (
      !session &&
      !internalSession &&
      !localClientSession
    ) {
      return undefined;
    }

    let timeoutId = null;
    let expired = false;

    const expireInactiveSession =
      async () => {
        if (expired) {
          return;
        }

        expired = true;

        setSessionExpiredMessage(
          inactivityMessage
        );

        clearAccessProfile();
        clearInternalSession();

        setLocalClientSession(
          null
        );

        sessionStorage.removeItem(
          lastActivityStorageKey
        );

        setSession(null);
        setAuthProfile(null);

        if (session) {
          const {
            error
          } =
            await supabase.auth.signOut();

          if (error) {
            console.error(
              'No se pudo cerrar la sesión por inactividad.',
              error
            );
          }
        }
      };

    const scheduleExpiration =
      () => {
        const lastActivityAt =
          getLastActivityAt();

        const elapsedMs =
          lastActivityAt
            ? Date.now() -
              lastActivityAt
            : 0;

        window.clearTimeout(
          timeoutId
        );

        if (
          lastActivityAt &&
          elapsedMs >=
            inactivityLimitMs
        ) {
          expireInactiveSession();
          return;
        }

        timeoutId =
          window.setTimeout(
            expireInactiveSession,
            inactivityLimitMs -
              elapsedMs
          );
      };

    const registerActivity =
      () => {
        touchLastActivity();
        scheduleExpiration();
      };

    if (!getLastActivityAt()) {
      touchLastActivity();
    }

    scheduleExpiration();

    const activityEvents = [
      'pointerdown',
      'keydown',
      'touchstart',
      'wheel'
    ];

    activityEvents.forEach(
      (eventName) => {
        window.addEventListener(
          eventName,
          registerActivity,
          {
            passive: true
          }
        );
      }
    );

    document.addEventListener(
      'visibilitychange',
      scheduleExpiration
    );

    return () => {
      window.clearTimeout(
        timeoutId
      );

      activityEvents.forEach(
        (eventName) => {
          window.removeEventListener(
            eventName,
            registerActivity
          );
        }
      );

      document.removeEventListener(
        'visibilitychange',
        scheduleExpiration
      );
    };
  }, [
    session,
    internalSession,
    localClientSession
  ]);

  const internalUser = useMemo(
    () => {
      if (!internalSession) {
        return null;
      }

      return {
        id: internalSession.id,
        sessionToken:
          internalSession.sessionToken,
        email:
          internalSession.email || '',
        role:
          internalSession.role,
        employeeId:
          internalSession.employeeId,
        username:
          internalSession.username,
        displayName:
          internalSession.displayName,
        firstName:
          internalSession.firstName,
        lastName:
          internalSession.lastName,
        photoUrl:
          internalSession.photoUrl,
        isInternal: true,
        isLocalInternal:
          internalSession.isLocalInternal ===
          true
      };
    },
    [internalSession]
  );

  const authenticatedUser =
    useMemo(
      () => {
        if (!session) {
          return null;
        }

        return {
          ...session.user,
          email:
            authProfile?.email ||
            session.user.email,
          role:
            authProfile?.role ||
            accessProfile,
          displayName:
            authProfile?.display_name ||
            getAuthDisplayName(
              session.user
            ),
          photoUrl:
            getAuthPhotoUrl(
              session.user
            ),
          employeeId:
            authProfile?.employee_id ||
            null,
          isInternal: false
        };
      },
      [
        session,
        authProfile,
        accessProfile
      ]
    );

  useEffect(() => {
    if (
      !session?.user ||
      accessProfile !== 'client' ||
      !companySlug ||
      !companyContext?.active
    ) {
      return;
    }

    const emailCliente =
      String(
        session.user.email || ''
      )
        .trim()
        .toLowerCase();

    if (!emailCliente) {
      return;
    }

    const claveSincronizacion =
      `${clienteGoogleSincronizadoStorageKey}:${companySlug}:${session.user.id}:${emailCliente}`;

    if (
      window.sessionStorage.getItem(
        claveSincronizacion
      ) === '1'
    ) {
      return;
    }

    let cancelado = false;

    const sincronizarClienteGoogle =
      async () => {
        const {
          nombre,
          apellido
        } =
          separarNombreClienteGoogle(
            session.user
          );

        const {
          error
        } =
          await supabase.rpc(
            'sync_google_client_account',
            {
              first_name_value:
                nombre || null,
              last_name_value:
                apellido || null,
              display_name_value:
                getAuthDisplayName(
                  session.user
                ) || null,
              email_value:
                emailCliente,
              phone_value:
                obtenerTelefonoClienteGoogle(
                  session.user
                ) || null,
              photo_url_value:
                getAuthPhotoUrl(
                  session.user
                ),
              company_slug_value:
                companySlug
            }
          );

        if (cancelado) {
          return;
        }

        if (error) {
          console.warn(
            'No se pudo registrar el cliente Google en la base de clientes.',
            error
          );

          return;
        }

        window.sessionStorage.setItem(
          claveSincronizacion,
          '1'
        );
      };

    sincronizarClienteGoogle();

    return () => {
      cancelado = true;
    };
  }, [
    session,
    accessProfile,
    companySlug,
    companyContext?.active
  ]);

  if (isPlatformAdminRoute) {
    return <PlatformAdmin />;
  }

  if (
    companyPortal === 'root' &&
    companySlug
  ) {
    if (companyContextLoading) {
      return (
        <main className="login-page">
          <section className="login-card">
            <p className="login-copy">
              Cargando empresa...
            </p>
          </section>
        </main>
      );
    }

    if (!companyContext?.active) {
      return (
        <main className="login-page">
          <section className="login-card">
            <p className="login-kicker">
              Empresa no disponible
            </p>

            <h1 className="login-brand-heading">
              QuieroTurnoApp
            </h1>

            <p className="login-copy">
              Ingresá con la URL de tu empresa para acceder a clientes, empleados o administración.
            </p>
          </section>
        </main>
      );
    }

    if (!landingEnabled) {
      return (
        <main className="login-page">
          <section className="login-card">
            <p className="login-copy">
              Redirigiendo...
            </p>
          </section>
        </main>
      );
    }

    return (
      <LandingPage
        companySlug={
          companySlug
        }
        companyContext={
          companyContext
        }
      />
    );
  }

  if (
    companyContextLoading ||
    authLoading
  ) {
    return (
      <main className="login-page">
        <section className="login-card">
          <p className="login-copy">
            Cargando empresa...
          </p>
        </section>
      </main>
    );
  }

  if (!companyContext?.active) {
    return (
      <main className="login-page">
        <section className="login-card">
          <p className="login-kicker">
            Empresa no disponible
          </p>

          <h1 className="login-brand-heading">
            QuieroTurnoApp
          </h1>

          <p className="login-copy">
            Ingresá con la URL de tu empresa para acceder a clientes, empleados o administración.
          </p>
        </section>
      </main>
    );
  }

  const loginView = (
    <Login
      companySlug={
        companySlug
      }
      companyContext={
        companyContext
      }
      allowedProfiles={
        routeAllowedProfiles
      }
      onInternalAccess={
        startInternalSession
      }
      onLocalClientAccess={
        startLocalClientSession
      }
      onLocalInternalAccess={
        startLocalInternalSession
      }
      localClientAccessEnabled={
        localClientAccessEnabled &&
        routeAllowedProfiles.includes(
          'client'
        )
      }
      localInternalAccessEnabled={
        localInternalAccessEnabled &&
        isInternalPortal
      }
      sessionNotice={
        sessionExpiredMessage
      }
      onDismissSessionNotice={() =>
        setSessionExpiredMessage(
          ''
        )
      }
    />
  );

  const internalSessionAllowed =
    internalSession &&
    routeAllowedProfiles.includes(
      internalSession.role
    );

  if (
    isClientPortal &&
    !session &&
    !localClientSession &&
    !internalSessionAllowed
  ) {
    return loginView;
  }

  if (
    isInternalPortal &&
    !internalSessionAllowed
  ) {
    return loginView;
  }

  if (
    !session &&
    !internalSessionAllowed &&
    !localClientSession
  ) {
    return loginView;
  }

  if (localClientSession) {
    return (
      <RoleAccess
        user={
          localClientSession
        }
        selectedProfile="client"
        onSelectProfile={
          selectAccessProfile
        }
        onChangeProfile={
          clearAccessProfile
        }
        availableProfiles={[
          'client'
        ]}
        canChangeProfile={
          false
        }
        onLogout={
          logout
        }
        companySlug={
          companySlug
        }
        companyContext={
          companyContext
        }
      />
    );
  }

  if (internalSessionAllowed) {
    if (
      internalSession.role ===
      'admin'
    ) {
      return (
        <Dashboard
          user={
            internalUser
          }
          accessProfile="admin"
          onChangeProfile={
            changeInternalAccess
          }
          canChangeProfile={
            canChangeProfile
          }
          onLogout={
            logout
          }
          companySlug={
            companySlug
          }
          companyContext={
            companyContext
          }
          onCompanyContextRefresh={
            refreshCompanyContext
          }
        />
      );
    }

    return (
      <RoleAccess
        user={
          internalUser
        }
        selectedProfile={
          internalSession.role
        }
        onSelectProfile={
          selectAccessProfile
        }
        onChangeProfile={
          changeInternalAccess
        }
        availableProfiles={
          availableProfiles
        }
        canChangeProfile={
          canChangeProfile
        }
        onLogout={
          logout
        }
        companySlug={
          companySlug
        }
        companyContext={
          companyContext
        }
      />
    );
  }

  if (!accessProfile) {
    return (
      <RoleAccess
        user={
          session.user
        }
        onSelectProfile={
          selectAccessProfile
        }
        availableProfiles={
          availableProfiles
        }
        canChangeProfile={
          canChangeProfile
        }
        onLogout={
          logout
        }
        companySlug={
          companySlug
        }
        companyContext={
          companyContext
        }
      />
    );
  }

  return (
    <RoleAccess
      user={
        authenticatedUser
      }
      selectedProfile={
        accessProfile
      }
      onSelectProfile={
        selectAccessProfile
      }
      onChangeProfile={
        clearAccessProfile
      }
      availableProfiles={
        availableProfiles
      }
      canChangeProfile={
        canChangeProfile
      }
      onLogout={
        logout
      }
      companySlug={
        companySlug
      }
      companyContext={
        companyContext
      }
    >
      {accessProfile ===
        'admin' && (
        <Dashboard
          user={
            authenticatedUser
          }
          accessProfile={
            accessProfile
          }
          onChangeProfile={
            clearAccessProfile
          }
          canChangeProfile={
            canChangeProfile
          }
          onLogout={
            logout
          }
          companySlug={
            companySlug
          }
          companyContext={
            companyContext
          }
          onCompanyContextRefresh={
            refreshCompanyContext
          }
        />
      )}
    </RoleAccess>
  );
}