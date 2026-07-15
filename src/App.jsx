import { useCallback, useEffect, useState } from 'react';
import { supabase } from './api/supabaseClient';
import Dashboard from './pages/Dashboard';
import Login from './components/Login';
import PlatformAdmin from './components/PlatformAdmin';
import RoleAccess from './components/RoleAccess';
import { getClientPortalPath, getCompanyPortalFromLocation, getCompanySlugFromLocation, isPlatformAdminLocation } from './utils/tenant';

const validProfiles = ['client', 'employee', 'admin'];
const profileStorageKey = 'turnos_access_profile';
const requestedProfileStorageKey = 'turnos_requested_profile';
const internalSessionStorageKey = 'turnos_internal_session';
const localClientSessionStorageKey = 'turnos_local_client_session';
const lastActivityStorageKey = 'turnos_last_activity_at';
const inactivityLimitMs = 5 * 60 * 1000;
const inactivityMessage = 'Pasaron mas de 5 min sin operar, volver a intentar.';
const localClientAccessEnabled = import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(window.location.hostname);

const getLastActivityAt = () => Number(sessionStorage.getItem(lastActivityStorageKey) || 0);

const touchLastActivity = () => {
  sessionStorage.setItem(lastActivityStorageKey, String(Date.now()));
};

const getAvailableProfiles = (role) => {
  if (role === 'admin') return ['admin'];
  if (role === 'employee') return ['employee'];

  return ['client'];
};

const getAuthPhotoUrl = (user) => {
  const metadata = user?.user_metadata || {};

  return metadata.avatar_url || metadata.picture || metadata.photo_url || null;
};

const getAuthDisplayName = (user) => {
  const metadata = user?.user_metadata || {};

  return metadata.full_name || metadata.name || user?.email || '';
};

const loadStoredInternalSession = (expectedCompanySlug = null) => {
  const storedSession = sessionStorage.getItem(internalSessionStorageKey);

  if (!storedSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(storedSession);

    if (!validProfiles.includes(parsedSession.role)) {
      return null;
    }

    if (expectedCompanySlug && parsedSession.companySlug !== expectedCompanySlug) {
      sessionStorage.removeItem(internalSessionStorageKey);
      return null;
    }

    return parsedSession;
  } catch {
    sessionStorage.removeItem(internalSessionStorageKey);
    return null;
  }
};

const loadStoredLocalClientSession = (expectedCompanySlug = null) => {
  if (!localClientAccessEnabled) return null;

  const storedSession = sessionStorage.getItem(localClientSessionStorageKey);

  if (!storedSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(storedSession);

    if (expectedCompanySlug && parsedSession.companySlug !== expectedCompanySlug) {
      sessionStorage.removeItem(localClientSessionStorageKey);
      return null;
    }

    return parsedSession?.role === 'client' ? parsedSession : null;
  } catch {
    sessionStorage.removeItem(localClientSessionStorageKey);
    return null;
  }
};

const getStoredProfile = () => {
  const requestedProfile = sessionStorage.getItem(requestedProfileStorageKey);
  const storedProfile = sessionStorage.getItem(profileStorageKey);
  const selectedProfile = requestedProfile || storedProfile || 'client';

  sessionStorage.removeItem(requestedProfileStorageKey);

  return validProfiles.includes(selectedProfile) ? selectedProfile : 'client';
};

const hasAuthCallbackParams = () => {
  const searchParams = new URLSearchParams(window.location.search || '');
  const hashParams = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));

  return searchParams.has('code') || searchParams.has('error') || hashParams.has('access_token') || hashParams.has('error');
};

export default function App() {
  const isPlatformAdminRoute = isPlatformAdminLocation();
  const companyPortal = getCompanyPortalFromLocation();
  const isClientPortal = companyPortal === 'client';
  const isInternalPortal = companyPortal === 'internal';
  const routeAllowedProfiles = isClientPortal
    ? ['client']
    : isInternalPortal
      ? ['employee', 'admin']
      : validProfiles;

  const [companySlug] = useState(getCompanySlugFromLocation);
  const [companyContext, setCompanyContext] = useState(null);
  const [companyContextLoading, setCompanyContextLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [internalSession, setInternalSession] = useState(() => loadStoredInternalSession(companySlug));
  const [localClientSession, setLocalClientSession] = useState(() => loadStoredLocalClientSession(companySlug));
  const [accessProfile, setAccessProfile] = useState(null);
  const [authProfile, setAuthProfile] = useState(null);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState('');

  const baseAvailableProfiles = internalSession
    ? getAvailableProfiles(internalSession.role)
    : getAvailableProfiles(authProfile?.role || accessProfile);
  const availableProfiles = baseAvailableProfiles.filter((profile) => routeAllowedProfiles.includes(profile));
  const canChangeProfile = availableProfiles.length > 1;
  const companyContextId = companyContext?.id;

  useEffect(() => {
    if (companyPortal === 'root' && companySlug) {
      window.location.replace(getClientPortalPath(companySlug));
    }
  }, [companyPortal, companySlug]);

  useEffect(() => {
    let active = true;

    const loadCompanyContext = async () => {
      setCompanyContextLoading(true);

      if (!companySlug) {
        setCompanyContext({ active: false, status: 'missing_slug', slug: null });
        setCompanyContextLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc('get_company_public_context', {
        slug_value: companySlug
      });

      if (!active) return;

      setCompanyContext(error ? { active: false, status: 'not_found', slug: companySlug } : data);
      setCompanyContextLoading(false);
    };

    loadCompanyContext();

    return () => {
      active = false;
    };
  }, [companySlug]);

  const selectAccessProfile = (profile) => {
    setSessionExpiredMessage('');
    touchLastActivity();
    setAccessProfile(profile);
    sessionStorage.setItem(profileStorageKey, profile);
  };

  const clearAccessProfile = () => {
    setAccessProfile(null);
    setAuthProfile(null);
    setLocalClientSession(null);
    sessionStorage.removeItem(profileStorageKey);
    sessionStorage.removeItem(requestedProfileStorageKey);
    sessionStorage.removeItem(localClientSessionStorageKey);
  };

  const clearInternalSession = () => {
    setInternalSession(null);
    sessionStorage.removeItem(internalSessionStorageKey);
  };

  const changeInternalAccess = () => {
    setSessionExpiredMessage('');
    clearAccessProfile();
    clearInternalSession();
  };

  const startInternalSession = (account) => {
    const nextSession = {
      id: account.id,
      sessionToken: account.session_token || account.sessionToken || null,
      role: account.role,
      displayName: account.display_name,
      username: account.username || null,
      firstName: account.first_name || null,
      lastName: account.last_name || null,
      photoUrl: account.photo_url || null,
      employeeId: account.employee_id || null,
      companySlug
    };

    setSessionExpiredMessage('');
    setInternalSession(nextSession);
    setAccessProfile(account.role);
    touchLastActivity();
    sessionStorage.setItem(internalSessionStorageKey, JSON.stringify(nextSession));
    sessionStorage.setItem(profileStorageKey, account.role);
  };

  const startLocalClientSession = () => {
    if (!localClientAccessEnabled) return;

    const nextSession = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'cliente.local@turnos.test',
      role: 'client',
      displayName: 'Cliente local',
      photoUrl: null,
      isLocalClient: true,
      companySlug
    };

    setSessionExpiredMessage('');
    setSession(null);
    setAuthProfile(null);
    setLocalClientSession(nextSession);
    setAccessProfile('client');
    touchLastActivity();
    sessionStorage.setItem(localClientSessionStorageKey, JSON.stringify(nextSession));
    sessionStorage.setItem(profileStorageKey, 'client');
  };

  const logout = async () => {
    setSessionExpiredMessage('');
    clearAccessProfile();
    clearInternalSession();
    setLocalClientSession(null);
    sessionStorage.removeItem(lastActivityStorageKey);

    const { error } = await supabase.auth.signOut();

    if (error) {
      alert('No se pudo cerrar la sesión. Intentá nuevamente.');
    }
  };

  const loadAuthProfile = useCallback(async (user) => {
    let profileQuery = supabase
      .from('profiles')
      .select('role, display_name, email, employee_id, active')
      .eq('user_id', user.id);

    if (companyContextId) {
      profileQuery = profileQuery.eq('company_id', companyContextId);
    }

    const { data, error } = await profileQuery.maybeSingle();

    if (error || data?.active === false) {
      return null;
    }

    return data;
  }, [companyContextId]);

  const applyAuthSession = useCallback(async (nextSession) => {
    setSession(nextSession);

    if (!nextSession) {
      return;
    }

    setSessionExpiredMessage('');
    touchLastActivity();

    const profile = await loadAuthProfile(nextSession.user);
    const profileRole = validProfiles.includes(profile?.role) ? profile.role : null;

    setAuthProfile(profile);
    setAccessProfile(profileRole || getStoredProfile());
  }, [loadAuthProfile]);

  useEffect(() => {
    let active = true;

    const initializeAuthSession = async () => {
      setAuthLoading(true);

      try {
        if (hasAuthCallbackParams()) {
          await supabase.auth.exchangeCodeForSession(window.location.href);
          window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        }

        const { data } = await supabase.auth.getSession();

        if (!active) return;
        await applyAuthSession(data.session);
      } catch (error) {
        console.error('No se pudo procesar el inicio de sesión.', error);
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    };

    initializeAuthSession();

    const { data: listener } =
      supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          applyAuthSession(session).finally(() => setAuthLoading(false));
        } else {
          setSession(null);
          setAuthProfile(null);

          const storedInternalSession = loadStoredInternalSession(companySlug);

          if (storedInternalSession) {
            setInternalSession(storedInternalSession);
            setAccessProfile(storedInternalSession.role);
          } else if (localClientAccessEnabled) {
            const storedLocalClientSession = loadStoredLocalClientSession(companySlug);

            if (storedLocalClientSession) {
              setLocalClientSession(storedLocalClientSession);
              setAccessProfile('client');
            } else {
              clearAccessProfile();
            }
          } else {
            clearAccessProfile();
          }

          setAuthLoading(false);
        }
      });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };

  }, [applyAuthSession, companySlug]);

  useEffect(() => {
    if (!session && !internalSession && !localClientSession) {
      return undefined;
    }

    let timeoutId = null;
    let expired = false;

    const expireInactiveSession = async () => {
      if (expired) return;
      expired = true;

      setSessionExpiredMessage(inactivityMessage);
      clearAccessProfile();
      clearInternalSession();
      setLocalClientSession(null);
      sessionStorage.removeItem(lastActivityStorageKey);
      setSession(null);
      setAuthProfile(null);

      if (session) {
        const { error } = await supabase.auth.signOut();
        if (error) {
          console.error('No se pudo cerrar la sesión por inactividad.', error);
        }
      }
    };

    const scheduleExpiration = () => {
      const lastActivityAt = getLastActivityAt();
      const elapsedMs = lastActivityAt ? Date.now() - lastActivityAt : 0;

      window.clearTimeout(timeoutId);

      if (lastActivityAt && elapsedMs >= inactivityLimitMs) {
        expireInactiveSession();
        return;
      }

      timeoutId = window.setTimeout(expireInactiveSession, inactivityLimitMs - elapsedMs);
    };

    const registerActivity = () => {
      touchLastActivity();
      scheduleExpiration();
    };

    if (!getLastActivityAt()) {
      touchLastActivity();
    }

    scheduleExpiration();

    const activityEvents = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, registerActivity, { passive: true });
    });
    document.addEventListener('visibilitychange', scheduleExpiration);

    return () => {
      window.clearTimeout(timeoutId);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, registerActivity);
      });
      document.removeEventListener('visibilitychange', scheduleExpiration);
    };
  }, [session, internalSession, localClientSession]);

  if (isPlatformAdminRoute) {
    return <PlatformAdmin />;
  }

  if (companyPortal === 'root' && companySlug) {
    return <main className="login-page"><section className="login-card"><p className="login-copy">Redirigiendo...</p></section></main>;
  }

  if (companyContextLoading || authLoading) {
    return <main className="login-page"><section className="login-card"><p className="login-copy">Cargando empresa...</p></section></main>;
  }

  if (!companyContext?.active) {
    return (
      <main className="login-page">
        <section className="login-card">
          <p className="login-kicker">Empresa no disponible</p>
          <h1 className="login-brand-heading">QuieroTurnoApp</h1>
          <p className="login-copy">Ingresá con la URL de tu empresa para acceder a clientes, empleados o administración.</p>
        </section>
      </main>
    );
  }

  const loginView = (
    <Login
      companySlug={companySlug}
      companyContext={companyContext}
      allowedProfiles={routeAllowedProfiles}
      onInternalAccess={startInternalSession}
      onLocalClientAccess={startLocalClientSession}
      localClientAccessEnabled={localClientAccessEnabled && routeAllowedProfiles.includes('client')}
      sessionNotice={sessionExpiredMessage}
      onDismissSessionNotice={() => setSessionExpiredMessage('')}
    />
  );

  if (isClientPortal && !session && !localClientSession) {
    return loginView;
  }

  if (isInternalPortal && !internalSession) {
    return loginView;
  }

  if (!session && !internalSession && !localClientSession) {
    return loginView;
  }

  if (localClientSession) {
    return (
      <RoleAccess
        user={localClientSession}
        selectedProfile="client"
        onSelectProfile={selectAccessProfile}
        onChangeProfile={clearAccessProfile}
        availableProfiles={['client']}
        canChangeProfile={false}
        onLogout={logout}
        companySlug={companySlug}
        companyContext={companyContext}
      />
    );
  }

  if (internalSession) {
    const internalUser = {
      id: internalSession.id,
      sessionToken: internalSession.sessionToken,
      email: internalSession.displayName,
      role: internalSession.role,
      employeeId: internalSession.employeeId,
      username: internalSession.username,
      displayName: internalSession.displayName,
      firstName: internalSession.firstName,
      lastName: internalSession.lastName,
      photoUrl: internalSession.photoUrl,
      isInternal: true
    };

    if (internalSession.role === 'admin') {
      return (
        <Dashboard
          user={internalUser}
          accessProfile="admin"
          onChangeProfile={changeInternalAccess}
          canChangeProfile={canChangeProfile}
          onLogout={logout}
          companySlug={companySlug}
          companyContext={companyContext}
        />
      );
    }

    return (
      <RoleAccess
        user={internalUser}
        selectedProfile={internalSession.role}
        onSelectProfile={selectAccessProfile}
        onChangeProfile={changeInternalAccess}
        availableProfiles={availableProfiles}
        canChangeProfile={canChangeProfile}
        onLogout={logout}
        companySlug={companySlug}
        companyContext={companyContext}
      />
    );
  }

  if (!accessProfile) {
    return (
      <RoleAccess
        user={session.user}
        onSelectProfile={selectAccessProfile}
        availableProfiles={availableProfiles}
        canChangeProfile={canChangeProfile}
        onLogout={logout}
        companySlug={companySlug}
        companyContext={companyContext}
      />
    );
  }

  const authenticatedUser = {
    ...session.user,
    email: authProfile?.email || session.user.email,
    role: authProfile?.role || accessProfile,
    displayName: authProfile?.display_name || getAuthDisplayName(session.user),
    photoUrl: getAuthPhotoUrl(session.user),
    employeeId: authProfile?.employee_id || null,
    isInternal: false
  };

  return (
    <RoleAccess
      user={authenticatedUser}
      selectedProfile={accessProfile}
      onSelectProfile={selectAccessProfile}
      onChangeProfile={clearAccessProfile}
      availableProfiles={availableProfiles}
      canChangeProfile={canChangeProfile}
      onLogout={logout}
      companySlug={companySlug}
      companyContext={companyContext}
    >
      {accessProfile === 'admin' && (
        <Dashboard
          user={authenticatedUser}
          accessProfile={accessProfile}
          onChangeProfile={clearAccessProfile}
          canChangeProfile={canChangeProfile}
          onLogout={logout}
          companySlug={companySlug}
          companyContext={companyContext}
        />
      )}
    </RoleAccess>
  );
}
