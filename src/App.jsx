import { useCallback, useEffect, useState } from 'react';
import { supabase } from './api/supabaseClient';
import Dashboard from './pages/Dashboard';
import Login from './components/Login';
import RoleAccess from './components/RoleAccess';

const validProfiles = ['client', 'employee', 'admin'];
const profileStorageKey = 'turnos_access_profile';
const requestedProfileStorageKey = 'turnos_requested_profile';
const internalSessionStorageKey = 'turnos_internal_session';

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

const loadStoredInternalSession = () => {
  const storedSession = sessionStorage.getItem(internalSessionStorageKey);

  if (!storedSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(storedSession);

    if (!validProfiles.includes(parsedSession.role)) {
      return null;
    }

    return parsedSession;
  } catch {
    sessionStorage.removeItem(internalSessionStorageKey);
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

export default function App() {

  const [session, setSession] = useState(null);
  const [internalSession, setInternalSession] = useState(loadStoredInternalSession);
  const [accessProfile, setAccessProfile] = useState(null);
  const [authProfile, setAuthProfile] = useState(null);

  const availableProfiles = internalSession
    ? getAvailableProfiles(internalSession.role)
    : getAvailableProfiles(authProfile?.role || accessProfile);
  const canChangeProfile = availableProfiles.length > 1;

  const selectAccessProfile = (profile) => {
    setAccessProfile(profile);
    sessionStorage.setItem(profileStorageKey, profile);
  };

  const clearAccessProfile = () => {
    setAccessProfile(null);
    setAuthProfile(null);
    sessionStorage.removeItem(profileStorageKey);
    sessionStorage.removeItem(requestedProfileStorageKey);
  };

  const clearInternalSession = () => {
    setInternalSession(null);
    sessionStorage.removeItem(internalSessionStorageKey);
  };

  const changeInternalAccess = () => {
    clearAccessProfile();
    clearInternalSession();
  };

  const startInternalSession = (account) => {
    const nextSession = {
      id: account.id,
      role: account.role,
      displayName: account.display_name,
      username: account.username || null,
      firstName: account.first_name || null,
      lastName: account.last_name || null,
      photoUrl: account.photo_url || null,
      employeeId: account.employee_id || null
    };

    setInternalSession(nextSession);
    setAccessProfile(account.role);
    sessionStorage.setItem(internalSessionStorageKey, JSON.stringify(nextSession));
    sessionStorage.setItem(profileStorageKey, account.role);
  };

  const logout = async () => {
    clearAccessProfile();
    clearInternalSession();

    const { error } = await supabase.auth.signOut();

    if (error) {
      alert('No se pudo cerrar la sesión. Intentá nuevamente.');
    }
  };

  const loadAuthProfile = useCallback(async (user) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, display_name, email, employee_id, active')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || data?.active === false) {
      return null;
    }

    return data;
  }, []);

  const applyAuthSession = useCallback(async (nextSession) => {
    setSession(nextSession);

    if (!nextSession) {
      return;
    }

    const profile = await loadAuthProfile(nextSession.user);
    const profileRole = validProfiles.includes(profile?.role) ? profile.role : null;

    setAuthProfile(profile);
    setAccessProfile(profileRole || getStoredProfile());
  }, [loadAuthProfile]);

  useEffect(() => {

    supabase.auth.getSession().then(({ data }) => {
      applyAuthSession(data.session);
    });

    const { data: listener } =
      supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          applyAuthSession(session);
        } else {
          setSession(null);
          setAuthProfile(null);

          const storedInternalSession = loadStoredInternalSession();

          if (storedInternalSession) {
            setInternalSession(storedInternalSession);
            setAccessProfile(storedInternalSession.role);
          } else {
            clearAccessProfile();
          }
        }
      });

    return () => {
      listener.subscription.unsubscribe();
    };

  }, [applyAuthSession]);

  if (!session && !internalSession) {
    return <Login onInternalAccess={startInternalSession} />;
  }

  if (internalSession) {
    const internalUser = {
      id: internalSession.id,
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

    return (
      <RoleAccess
        user={internalUser}
        selectedProfile={internalSession.role}
        onSelectProfile={selectAccessProfile}
        onChangeProfile={changeInternalAccess}
        availableProfiles={availableProfiles}
        canChangeProfile={canChangeProfile}
        onLogout={logout}
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
    >
      {accessProfile === 'admin' && (
        <Dashboard
          user={authenticatedUser}
          accessProfile={accessProfile}
          onChangeProfile={clearAccessProfile}
          canChangeProfile={canChangeProfile}
          onLogout={logout}
        />
      )}
    </RoleAccess>
  );
}
