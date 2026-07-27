import { useEffect, useState } from 'react';
import EmployeeDashboard from './EmployeeDashboard';
import ClientDashboard from './ClientDashboard';
import ClientProfilePanel from './ClientProfilePanel';
import ClientsPanel from './ClientsPanel';
import Navbar from './Navbar';
import AdminSidebar from './AdminSidebar';
import NewBookingPanel from './NewBookingPanel';
import { WorkspaceHero, WorkspaceProfileIdentity, UserPhoto } from './WorkspaceHero';
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
  { id: 'summary', label: 'Resumen', mobileLabel: 'Resumen', icon: '▦' },
  { id: 'agenda', label: 'Agenda', mobileLabel: 'Agenda', icon: '📅' },
  { id: 'clients', label: 'Clientes', mobileLabel: 'Clientes', icon: '🙋' },
  { id: 'profile', label: 'Mi perfil', mobileLabel: 'Perfil', icon: '👤' },
  { id: 'availability', label: 'Disponibilidad', mobileLabel: 'Horario', icon: '🕒' }
];

const employeeBottomNavItems = employeeNavItems.filter((item) => item.id !== 'profile' && item.id !== 'clients');

const employeeSidebarGroups = [
  {
    label: 'MI ESPACIO',
    items: employeeNavItems.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))
  }
];

const clientNavItems = [
  { id: 'home', label: 'Inicio', icon: '⌂' },
  { id: 'reserve', label: 'Nueva Reserva', icon: '📅' },
  { id: 'mis-turnos', label: 'Mis turnos', icon: '📋' },
  { id: 'perfil', label: 'Perfil', icon: '👤' }
];

const clientSidebarGroups = [
  {
    label: 'MI CUENTA',
    items: clientNavItems.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))
  }
];

const clientHeroCopy = {
  home: { eyebrow: 'Bienvenida', description: 'Descubrí promos, packs y servicios, y reservá cuando quieras.' },
  reserve: { eyebrow: 'Reserva', title: 'Reservar turno', description: 'Seleccioná un horario disponible en la grilla para crear tu turno.' },
  'mis-turnos': { eyebrow: 'Mis turnos', title: 'Mis turnos', description: 'Revisá tus turnos activos y tu historial.' },
  perfil: { eyebrow: 'Perfil', title: 'Mi perfil', description: 'Revisá y actualizá tus datos personales.' }
};

const employeeHeroCopy = {
  summary: { eyebrow: 'Acceso interno', title: 'Mi espacio', description: 'Un vistazo a tu día, próximos turnos y disponibilidad.' },
  agenda: { eyebrow: 'Acceso interno', title: 'Mi agenda laboral', description: 'Un panel enfocado en los turnos asignados.' },
  'new-booking': { eyebrow: 'Reserva', title: 'Nueva reserva', description: 'Creá un turno para un cliente.' },
  clients: { eyebrow: 'Clientes', title: 'Gestión de clientes', description: 'Administrá y organizá tu base de clientes.' },
  profile: { eyebrow: 'Mi perfil', title: 'Mi perfil', description: 'Revisá y actualizá tus datos personales.' },
  availability: { eyebrow: 'Agenda disponible', title: 'Disponibilidad', description: 'Configurá los días y horarios en los que atendés.' }
};

const getRoleViewFromHash = (selectedProfile) => {
  const hash = window.location.hash.replace(/^#/, '');

  if (selectedProfile === 'employee' && hash === 'employee-agenda') return 'agenda';
  if (selectedProfile === 'client' && hash === 'client-reserve') return 'reserve';
  if (selectedProfile === 'client' && hash === 'client-mis-turnos') return 'mis-turnos';
  if (selectedProfile === 'client' && hash === 'client-perfil') return 'perfil';

  return null;
};

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

function EmployeeBottomNav({ activeView, onViewChange, items = employeeBottomNavItems }) {
  return (
    <nav className="employee-bottom-nav" aria-label="Secciones empleado">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`employee-bottom-nav-button ${activeView === item.id ? 'is-active' : ''}`}
          onClick={() => onViewChange(item.id)}
        >
          <span className="employee-bottom-nav-icon" aria-hidden="true">{item.icon}</span>
          <span className="employee-bottom-nav-label">{item.mobileLabel || item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function RoleWorkspace({ selectedProfile, user, onChangeProfile, onLogout, canChangeProfile, companySlug, companyContext }) {
  const [clientActiveView, setClientActiveView] = useState('home');
  const [selectedPromotion, setSelectedPromotion] = useState(null);
  const [employeeActiveView, setEmployeeActiveView] = useState('summary');
  const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);
  const [newBookingInitial, setNewBookingInitial] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [companyName, setCompanyName] = useState('QuieroTurnoApp');
  const [businessHoursText, setBusinessHoursText] = useState('');
  const [welcomeBackground, setWelcomeBackground] = useState(null);
  const profile = profileOptions[selectedProfile];
  const isClientProfile = selectedProfile === 'client';
  const isEmployeeProfile = selectedProfile === 'employee';
  const workspaceLogoSrc = companyContext?.client_logo_data_url || turnosAppLogo;
  const workspaceLogoAlt = companyContext?.client_logo_data_url ? `${companyName} - ${profile?.label || 'QuieroTurnoApp'}` : undefined;
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
    setSelectedPromotion(null);
    setSidebarOpen(false);
  };

  const changeEmployeeView = (view) => {
    if (view === 'new-booking') {
      setNewBookingInitial(null);
      setIsNewBookingOpen(true);
      setSidebarOpen(false);
      return;
    }
    setEmployeeActiveView(view);
    setSidebarOpen(false);
  };

  const openEmployeeNewBooking = (options = null) => {
    setNewBookingInitial(options);
    setIsNewBookingOpen(true);
    setSidebarOpen(false);
  };

  const reservePromotion = (promotion) => {
    setSelectedPromotion(promotion);
    setClientActiveView('reserve');
  };

  if (isEmployeeProfile) {
    const empleadosPuedenReservar = companyContext?.configuracion_operativa?.empleados_pueden_reservar !== false;
    const employeeNavItemsForUser = empleadosPuedenReservar
      ? [
          employeeNavItems[0],
          { id: 'new-booking', label: 'Nueva reserva', mobileLabel: 'Reservar', icon: '➕' },
          ...employeeNavItems.slice(1)
        ]
      : employeeNavItems;
    const employeeSidebarGroupsForUser = [
      {
        label: 'MI ESPACIO',
        items: employeeNavItemsForUser.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))
      }
    ];
    const employeeBottomNavItemsForUser = employeeNavItemsForUser.filter((item) => item.id !== 'profile' && item.id !== 'clients');

    return (
      <main className="role-workspace role-workspace-employee has-role-sidebar">
        <Navbar
          user={user}
          activeView={employeeActiveView}
          accessProfile="employee"
          onViewChange={changeEmployeeView}
          onChangeProfile={onChangeProfile}
          onLogout={onLogout}
          showNavigation={false}
          showMenuToggle
          onMenuToggle={() => setSidebarOpen((current) => !current)}
          canChangeProfile={canChangeProfile}
          logoSrc={workspaceLogoSrc}
          logoAlt={workspaceLogoAlt}
        />
        <div className="role-workspace-body">
          <AdminSidebar
            groups={employeeSidebarGroupsForUser}
            activeView={employeeActiveView}
            onViewChange={changeEmployeeView}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            companyName={companyName}
            logoSrc={workspaceLogoSrc}
          />
          <div className="role-workspace-content">
            <WorkspaceHero
              className={shouldUseWelcomeBackground ? 'employee-welcome-hero has-custom-background' : ''}
              style={shouldUseWelcomeBackground ? welcomeBackgroundStyle : undefined}
              eyebrow={(employeeHeroCopy[employeeActiveView] || profile).eyebrow}
              title={(employeeHeroCopy[employeeActiveView] || profile).title}
              description={(employeeHeroCopy[employeeActiveView] || profile).description}
              identity={<WorkspaceProfileIdentity user={user} roleLabel={profile.label} photoFallback={profile.icon} />}
            />
            {employeeActiveView === 'clients' ? (
              <ClientsPanel user={user} companySlug={companySlug} companyContext={companyContext} hideHeading />
            ) : (
              <EmployeeDashboard user={user} activeView={employeeActiveView} companySlug={companySlug} companyContext={companyContext} onRequestNewBooking={empleadosPuedenReservar ? openEmployeeNewBooking : undefined} />
            )}
          </div>
        </div>
        {isNewBookingOpen && (
          <NewBookingPanel
            user={user}
            companySlug={companySlug}
            companyContext={companyContext}
            initialDate={newBookingInitial?.date || null}
            initialStartTime={newBookingInitial?.startTime || null}
            branchId={newBookingInitial?.branchId || null}
            onClose={() => setIsNewBookingOpen(false)}
            onBookingCreated={() => {
              window.dispatchEvent(new Event('turnos-app-configuration-saved'));
              setEmployeeActiveView('agenda');
            }}
          />
        )}
      </main>
    );
  }

  if (isClientProfile) {
    const heroCopy = clientHeroCopy[clientActiveView] || clientHeroCopy.home;
    const heroTitle = clientActiveView === 'home'
      ? <span className="client-welcome-name">{companyName}</span>
      : (heroCopy.title || companyName);

    return (
      <main className="role-workspace role-workspace-client has-role-sidebar">
        <Navbar
          user={user}
          activeView={clientActiveView}
          accessProfile="client"
          onViewChange={changeClientView}
          onChangeProfile={onChangeProfile}
          onLogout={onLogout}
          showNavigation={false}
          showMenuToggle
          onMenuToggle={() => setSidebarOpen((current) => !current)}
          canChangeProfile={canChangeProfile}
          logoSrc={workspaceLogoSrc}
          logoAlt={workspaceLogoAlt}
        />
        <div className="role-workspace-body">
          <AdminSidebar
            groups={clientSidebarGroups}
            activeView={clientActiveView}
            onViewChange={changeClientView}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            companyName={companyName}
            logoSrc={workspaceLogoSrc}
          />
          <div className="role-workspace-content">
            <WorkspaceHero
              className={`${clientActiveView === 'home' ? 'client-welcome-hero' : 'client-reserve-hero'} ${shouldUseWelcomeBackground ? 'has-custom-background' : ''}`.trim()}
              style={shouldUseWelcomeBackground ? welcomeBackgroundStyle : undefined}
              eyebrow={heroCopy.eyebrow}
              title={heroTitle}
              description={heroCopy.description}
              identity={<WorkspaceProfileIdentity user={user} roleLabel={profile.label} photoFallback={profile.icon} />}
            >
              {clientActiveView === 'home' && businessHoursText && <p className="client-business-hours-text">{businessHoursText}</p>}
            </WorkspaceHero>
            {clientActiveView === 'perfil' ? (
              <ClientProfilePanel user={user} companySlug={companySlug} />
            ) : (
              <ClientDashboard
                user={user}
                activeView={clientActiveView}
                selectedPromotion={selectedPromotion}
                onReservePromotion={reservePromotion}
                onReserveTurn={() => {
                  setSelectedPromotion(null);
                  setClientActiveView('reserve');
                }}
                onRescheduleDone={() => {
                  setSelectedPromotion(null);
                  setClientActiveView('reserve');
                }}
                companySlug={companySlug}
                companyContext={companyContext}
              />
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`role-workspace role-workspace-${selectedProfile}`}>
      <section className="role-workspace-topbar">
        <div className="role-workspace-brand">
          <img className="app-navbar-logo" src={workspaceLogoSrc} alt={workspaceLogoAlt || `QuieroTurnoApp - ${profile.label}`} />
        </div>

        <div className="role-workspace-session">
          <span>{user?.email || 'Sin usuario'}</span>
          {canChangeProfile && (
            <button type="button" className="app-navbar-switch" onClick={onChangeProfile}>Cambiar perfil</button>
          )}
          <button type="button" className="app-navbar-logout" onClick={onLogout}>Salir</button>
        </div>
      </section>

      <WorkspaceHero
        eyebrow={profile.eyebrow}
        title={profile.title}
        description={profile.description}
        identity={<WorkspaceProfileIdentity user={user} roleLabel={profile.label} photoFallback={profile.icon} />}
      />

      <section className="role-action-grid" aria-label="Acciones previstas">
        {profile.actions.map((action) => (
          <article className="role-action-card" key={action}>
            <span aria-hidden="true">✓</span>
            <strong>{action}</strong>
            <p>Diseño preparado para conectar permisos, datos y acciones en la próxima etapa.</p>
          </article>
        ))}
      </section>
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