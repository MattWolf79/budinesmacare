import { useEffect, useState } from 'react';
import EmployeeDashboard from './EmployeeDashboard';
import ClientDashboard from './ClientDashboard';
import Navbar from './Navbar';
import { supabase } from '../api/supabaseClient';
import turnosAppLogo from '../assets/turnos-app-navbar-logo.svg';
import turnosAppIcon from '../assets/turnos-app-icon.svg';

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
    description: 'Mantiene la agenda completa actual con empleados, actividades, disponibilidad y reservas.',
    actions: ['Gestionar agenda', 'Administrar empleados', 'Configurar actividades']
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
  { id: 'reserve', label: 'Reservar Turno', icon: '+' }
];

function UserPhoto({ user, fallback }) {
  if (user?.photoUrl) {
    return <img src={user.photoUrl} alt="" />;
  }

  return fallback;
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

function ServiceColorLegend() {
  const [services, setServices] = useState([]);

  useEffect(() => {
    let active = true;

    const timeoutId = window.setTimeout(async () => {
      const { data, error } = await supabase
        .from('services')
        .select('id, name, color, active')
        .order('id', { ascending: true });

      if (!active) return;

      if (!error) {
        setServices((data || []).filter((service) => service.active !== false));
      }
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (!services.length) {
    return null;
  }

  return (
    <div className="service-color-legend" aria-label="Referencias de colores de actividades">
      {services.map((service) => (
        <span className="service-color-item" key={service.id} style={{ '--service-chip-color': service.color || '#94a3b8' }}>
          <span className="service-color-swatch" style={{ background: service.color || '#94a3b8' }} aria-hidden="true" />
          {service.name}
        </span>
      ))}
    </div>
  );
}

function RoleWorkspace({ selectedProfile, user, onChangeProfile, onLogout, canChangeProfile }) {
  const [clientActiveView, setClientActiveView] = useState('home');
  const [selectedPromotion, setSelectedPromotion] = useState(null);
  const [employeeActiveView, setEmployeeActiveView] = useState('summary');
  const profile = profileOptions[selectedProfile];
  const shouldUseClientPhoto = selectedProfile === 'client' && Boolean(user?.photoUrl);
  const isClientProfile = selectedProfile === 'client';

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
            <img className="app-navbar-logo" src={turnosAppLogo} alt={`Turnos app - ${profile.label}`} />
          </div>

          <div className="role-workspace-session">
            <span className="app-navbar-avatar role-workspace-avatar" aria-hidden="true">
              <UserPhoto user={user} fallback={String(user?.displayName || user?.email || 'U').trim().charAt(0).toUpperCase() || 'U'} />
            </span>
            <span>{user?.email || 'Sin usuario'}</span>
            {canChangeProfile && (
              <button type="button" className="app-navbar-switch" onClick={onChangeProfile}>Cambiar perfil</button>
            )}
            <button type="button" className="app-navbar-logout" onClick={onLogout}>Salir</button>
          </div>
        </section>
      )}

      {isClientProfile ? (
        <section className={`role-workspace-hero ${clientActiveView === 'home' ? 'client-welcome-hero' : 'client-reserve-hero'}`}>
          <div>
            <p className="admin-kicker">{clientActiveView === 'home' ? 'Bienvenida' : 'Reserva'}</p>
            <h1>{clientActiveView === 'home' ? 'Bienvenido a Turnos App' : 'Reservar turno'}</h1>
            <p>
              {clientActiveView === 'home'
                ? 'Consultá tus próximos turnos y elegí una actividad cuando quieras reservar.'
                : 'Seleccioná un horario disponible en la grilla para crear tu próximo turno.'}
            </p>
            <ServiceColorLegend />
          </div>
          <span className={`role-workspace-icon ${shouldUseClientPhoto ? 'has-photo' : ''}`} aria-hidden="true">
            <UserPhoto user={shouldUseClientPhoto ? user : null} fallback={profile.icon} />
          </span>
        </section>
      ) : (
        <section className="role-workspace-hero">
          <div>
            <p className="admin-kicker">{profile.eyebrow}</p>
            <h1>{profile.title}</h1>
            <p>{profile.description}</p>
          </div>
          <span className="role-workspace-icon" aria-hidden="true">
            <UserPhoto user={null} fallback={profile.icon} />
          </span>
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
        />
      ) : selectedProfile === 'employee' ? (
        <EmployeeDashboard user={user} activeView={employeeActiveView} />
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
  onLogout
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
      />
    );
  }

  return (
    <main className="profile-select-page">
      <section className="profile-select-panel">
        <img className="login-brand-mark" src={turnosAppIcon} alt="Turnos app" />
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