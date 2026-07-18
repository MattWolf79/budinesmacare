import { useEffect, useState } from 'react';
import EmployeeDashboard from './EmployeeDashboard';
import ClientDashboard from './ClientDashboard';
import Navbar from './Navbar';
import { supabase } from '../api/supabaseClient';

const turnosAppLogo = '/logo-quieroturnoapp.png';

const profileOptions = {
  client: {
    label: 'Cliente',
    eyebrow: 'Acceso cliente',
    icon: '🙋',
    title: 'Mis turnos',
    description: 'Una vista simple para reservar, revisar próximos turnos y gestionar cancelaciones futuras.',
    actions: ['Reservar turnos', 'Ver mis reservas', 'Cancelar próximos turnos']
  },
  employee: {
    label: 'Empleado',
    eyebrow: 'Acceso interno',
    icon: '🧑‍💼',
    title: 'Mi agenda laboral',
    description: 'Un panel enfocado en los turnos asignados y la disponibilidad propia.',
    actions: ['Ver agenda asignada', 'Consultar disponibilidad', 'Actualizar horarios']
  },
  admin: {
    label: 'Administrador',
    eyebrow: 'Gestión completa',
    icon: '🛠️',
    title: 'Administración general',
    description: 'Mantiene la agenda completa actual con empleados, servicios, disponibilidad y reservas.',
    actions: ['Gestionar agenda', 'Administrar empleados', 'Configurar servicios']
  }
};

const profileList = ['client', 'employee', 'admin'];

const employeeNavItems = [
  { id: 'summary', label: 'Resumen', icon: '▦' },
  { id: 'agenda', label: 'Agenda', icon: '📅' },
  { id: 'availability', label: 'Disponibilidad', icon: '🕒' }
];

const clientNavItems = [
  { id: 'home', label: 'Inicio', icon: '⌂' },
  { id: 'reserve', label: 'Reservar', icon: '📅' }
];

const getRoleViewFromHash = (selectedProfile) => {
  const hash = window.location.hash.replace(/^#/, '');

  if (selectedProfile === 'employee' && hash === 'employee-agenda') return 'agenda';
  if (selectedProfile === 'client' && hash === 'client-reserve') return 'reserve';

  return null;
};

function UserPhoto({ user, fallback }) {
  if (user?.photoUrl) {
    return <img src={user.photoUrl} alt="" />;
  }

  return fallback;
}

function WorkspaceProfilePhoto({ user, fallback, className = '' }) {
  return (
    <span className={`role-workspace-icon role-workspace-profile-photo ${user?.photoUrl ? 'has-photo' : ''} ${className}`.trim()} aria-hidden="true">
      <UserPhoto user={user} fallback={fallback} />
    </span>
  );
}

function WorkspaceProfileIdentity({ user, profile }) {
  return (
    <div className="workspace-profile-panel">
      <div className="workspace-profile-summary">
        <span className="workspace-profile-name">{user?.displayName || user?.email || user?.username || 'Sin usuario'}</span>
        <span className="workspace-profile-role">{profile.label}</span>
      </div>
      <WorkspaceProfilePhoto user={user} fallback={profile.icon} />
    </div>
  );
}

function ProfileCard({ profileId, selectedProfile, onSelectProfile, user }) {
  const profile = profileOptions[profileId];
  const isSelected = selectedProfile === profileId;
  const shouldUseClientPhoto = profileId === 'client' && Boolean(user?.photoUrl);

  return (
    <button
      type="button"
      className={`profile-card ${isSelected ? 'is-selected' : ''}`}
      onClick={() => onSelectProfile(profileId)}
    >
      <span className={`profile-card-icon ${shouldUseClientPhoto ? 'has-photo' : ''}`} aria-hidden="true">
        <UserPhoto user={profileId === 'client' ? user : null} fallback={profile.icon} />
      </span>
      <span className="profile-card-eyebrow">{profile.eyebrow}</span>
      <span className="profile-card-title">{profile.label}</span>
      <span className="profile-card-copy">{profile.description}</span>
    </button>
  );
}

function RoleWorkspace({ selectedProfile, user, onChangeProfile, onLogout, canChangeProfile, companySlug, companyContext }) {
  const [clientActiveView, setClientActiveView] = useState('home');
  const [selectedPromotion, setSelectedPromotion] = useState(null);
  const [employeeActiveView, setEmployeeActiveView] = useState('summary');
  const [companyName, setCompanyName] = useState('QuieroTurnoApp');
  const [businessHoursText, setBusinessHoursText] = useState('');
  const [welcomeBackground, setWelcomeBackground] = useState(null);
  const profile = profileOptions[selectedProfile];
  const isClientProfile = selectedProfile === 'client';
  const isEmployeeProfile = selectedProfile === 'employee';
  const welcomeBackgroundUrl = welcomeBackground?.dataUrl || welcomeBackground?.publicUrl || '';
  const welcomeBackgroundStyle = welcomeBackgroundUrl ? { '--welcome-background-image': `url("${welcomeBackgroundUrl}")` } : undefined;
  const shouldUseWelcomeBackground = (isClientProfile || isEmployeeProfile) && Boolean(welcomeBackgroundUrl);

  useEffect(() => {
    const applyHashView = () => {
      const hashView = getRoleViewFromHash(selectedProfile);

      if (selectedProfile === 'employee' && hashView) {
        setEmployeeActiveView(hashView);
      }

      if (selectedProfile === 'client' && hashView) {
        setClientActiveView(hashView);
        if (hashView !== 'reserve') setSelectedPromotion(null);
      }
    };

    applyHashView();
    window.addEventListener('hashchange', applyHashView);

    return () => {
      window.removeEventListener('hashchange', applyHashView);
    };
  }, [selectedProfile]);

  useEffect(() => {
    let active = true;

    const loadConfiguration = async () => {
      const { data, error } = await supabase.rpc('get_app_configuration', {
        company_slug_value: companySlug
      });

      if (!active || error) return;

      setCompanyName(String(data?.company_name || 'QuieroTurnoApp').trim() || 'QuieroTurnoApp');
  setBusinessHoursText(String(data?.business_hours_text || '').trim());
      setWelcomeBackground(data?.welcome_background_data_url || data?.welcome_background_public_url ? {
        dataUrl: data.welcome_background_data_url || '',
        publicUrl: data.welcome_background_public_url || '',
        fileName: data.welcome_background_file_name || '',
        mimeType: data.welcome_background_mime_type || ''
      } : null);
    };

    const refreshConfiguration = () => {
      loadConfiguration();
    };

    loadConfiguration();
    window.addEventListener('turnos-app-configuration-saved', refreshConfiguration);

    return () => {
      active = false;
      window.removeEventListener('turnos-app-configuration-saved', refreshConfiguration);
    };
  }, [companySlug]);

  const changeClientView = (view) => {
    setClientActiveView(view);

    if (view !== 'reserve') {
      setSelectedPromotion(null);
    }
  };

  const reservePromotion = (promotion) => {
    setSelectedPromotion(promotion);
    setClientActiveView('reserve');
  };

  return (
    <main className={`role-workspace role-workspace-${selectedProfile}`}>
      {selectedProfile === 'employee' || isClientProfile ? (
        <Navbar
          user={user}
          activeView={isClientProfile ? clientActiveView : employeeActiveView}
          accessProfile={selectedProfile}
          onViewChange={isClientProfile ? changeClientView : setEmployeeActiveView}
          onChangeProfile={onChangeProfile}
          onLogout={onLogout}
          showNavigation
          showProfileBadge
          canChangeProfile={canChangeProfile}
          navItems={isClientProfile ? clientNavItems : employeeNavItems}
        />
      ) : (
        <section className="role-workspace-topbar">
          <div className="role-workspace-brand">
            <img className="app-navbar-logo" src={turnosAppLogo} alt={`QuieroTurnoApp - ${profile.label}`} />
          </div>

          <div className="role-workspace-session">
            <span>{user?.email || 'Sin usuario'}</span>
            {canChangeProfile && (
              <button type="button" className="app-navbar-switch" onClick={onChangeProfile}>Cambiar perfil</button>
            )}
            <button type="button" className="app-navbar-logout" onClick={onLogout}>Salir</button>
          </div>
        </section>
      )}

      {isClientProfile ? (
        <section
          className={`role-workspace-hero ${clientActiveView === 'home' ? 'client-welcome-hero' : 'client-reserve-hero'} ${shouldUseWelcomeBackground ? 'has-custom-background' : ''}`}
          style={shouldUseWelcomeBackground ? welcomeBackgroundStyle : undefined}
        >
          <div>
            <p className="admin-kicker">{clientActiveView === 'home' ? 'Bienvenida' : 'Reserva'}</p>
            <h1>{clientActiveView === 'home' ? <span className="client-welcome-name">{companyName}</span> : 'Reservar turno'}</h1>
            <p>
              {clientActiveView === 'home'
                ? 'Consultá tus próximos turnos y elegí un servicio cuando quieras reservar.'
                : 'Seleccioná un horario disponible en la grilla para crear tu próximo turno.'}
            </p>
            {clientActiveView === 'home' && businessHoursText && <p className="client-business-hours-text">{businessHoursText}</p>}
          </div>
          <WorkspaceProfileIdentity user={user} profile={profile} />
        </section>
      ) : (
        <section
          className={`role-workspace-hero ${isEmployeeProfile && shouldUseWelcomeBackground ? 'employee-welcome-hero has-custom-background' : ''}`.trim()}
          style={isEmployeeProfile && shouldUseWelcomeBackground ? welcomeBackgroundStyle : undefined}
        >
          <div>
            <p className="admin-kicker">{profile.eyebrow}</p>
            <h1>{profile.title}</h1>
            <p>{profile.description}</p>
          </div>
          <WorkspaceProfileIdentity user={user} profile={profile} />
        </section>
      )}

      {isClientProfile ? (
        <ClientDashboard
          user={user}
          showAgenda={clientActiveView === 'reserve'}
          selectedPromotion={selectedPromotion}
          onReservePromotion={reservePromotion}
          onReserveTurn={() => {
            setSelectedPromotion(null);
            setClientActiveView('reserve');
          }}
          companySlug={companySlug}
          companyContext={companyContext}
        />
      ) : selectedProfile === 'employee' ? (
        <EmployeeDashboard user={user} activeView={employeeActiveView} companySlug={companySlug} companyContext={companyContext} />
      ) : (
        <section className="role-action-grid" aria-label="Acciones previstas">
          {profile.actions.map((action) => (
            <article className="role-action-card" key={action}>
              <span aria-hidden="true">✓</span>
              <strong>{action}</strong>
              <p>Diseño preparado para conectar permisos, datos y acciones en la próxima etapa.</p>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

export default function RoleAccess({
  children,
  user,
  selectedProfile,
  onSelectProfile,
  onChangeProfile,
  availableProfiles = profileList,
  canChangeProfile = availableProfiles.length > 1,
  onLogout,
  companySlug,
  companyContext
}) {
  if (children) {
    return children;
  }

  if (selectedProfile) {
    return (
      <RoleWorkspace
        selectedProfile={selectedProfile}
        user={user}
        onChangeProfile={onChangeProfile}
        canChangeProfile={canChangeProfile}
        onLogout={onLogout}
        companySlug={companySlug}
        companyContext={companyContext}
      />
    );
  }

  return (
    <main className="profile-select-page">
      <section className="profile-select-panel">
        <img className="login-brand-mark" src={turnosAppLogo} alt="QuieroTurnoApp" />
        <p className="login-kicker">Tipo de acceso</p>
        <h1>Elegí cómo querés entrar</h1>
        <p className="profile-select-copy">
          Esta capa deja separado el diseño de cliente, empleado y administrador. Por ahora el administrador conserva el panel completo actual.
        </p>

        <div className="profile-card-grid">
          {availableProfiles.map((profileId) => (
            <ProfileCard
              key={profileId}
              profileId={profileId}
              selectedProfile={selectedProfile}
              onSelectProfile={onSelectProfile}
              user={user}
            />
          ))}
        </div>

        <div className="profile-select-footer">
          <span>{user?.email || 'Sin usuario'}</span>
          <button type="button" className="app-navbar-logout" onClick={onLogout}>Salir</button>
        </div>
      </section>
    </main>
  );
}