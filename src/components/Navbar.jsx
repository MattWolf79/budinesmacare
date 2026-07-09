import turnosAppLogo from '../assets/turnos-app-navbar-logo.svg';

const defaultNavItems = [
  { id: 'agenda', label: 'Agenda', icon: '📅' },
  { id: 'employees', label: 'Empleados', icon: '👥' },
  { id: 'services', label: 'Actividades', icon: '✨' },
  { id: 'availability', label: 'Disponibilidad', icon: '🕒' },
  { id: 'settings', label: 'Configuración', icon: '⚙' }
];

const profileLabels = {
  admin: 'Administrador',
  client: 'Cliente',
  employee: 'Empleado'
};

const getUserInitials = (user) => {
  const label = user?.displayName || user?.email || user?.username || 'U';
  const parts = String(label).trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return String(parts[0]?.[0] || 'U').toUpperCase();
};

const getNavbarSubtitle = (accessProfile) => (
  accessProfile === 'client'
    ? 'Reservas online'
    : accessProfile === 'employee'
      ? 'Agenda laboral'
      : 'Panel comercial'
);

export default function Navbar({
  user,
  activeView,
  accessProfile,
  onViewChange,
  onChangeProfile,
  onLogout,
  showAdminNavigation = accessProfile === 'admin',
  showNavigation = showAdminNavigation,
  showProfileBadge = accessProfile === 'admin' || accessProfile === 'employee',
  canChangeProfile = false,
  navItems = defaultNavItems
}) {

  return (
    <div className="app-navbar">
      <div className="app-navbar-brand">
        <img className="app-navbar-logo" src={turnosAppLogo} alt={`Turnos app - ${getNavbarSubtitle(accessProfile)}`} />
      </div>

      {showNavigation && (
        <div className="app-navbar-menu" aria-label="Secciones">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`app-navbar-button ${activeView === item.id ? 'is-active' : ''}`}
              onClick={() => onViewChange(item.id)}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div className="app-navbar-session">
        <span className="app-navbar-avatar" aria-hidden="true">
          {user?.photoUrl ? <img src={user.photoUrl} alt="" /> : getUserInitials(user)}
        </span>

        <div className="app-navbar-user">
          <span className="app-navbar-email">{user?.email ? user.email : 'Sin usuario'}</span>
          {showProfileBadge && accessProfile && (
            <span className="app-navbar-profile">{profileLabels[accessProfile]}</span>
          )}
        </div>

        {user?.email && canChangeProfile && (
          <button className="app-navbar-switch" type="button" onClick={onChangeProfile} title="Cambiar perfil">
            Perfil
          </button>
        )}

        {user?.email && (
          <button className="app-navbar-logout" type="button" onClick={onLogout}>
            Salir
          </button>
        )}
      </div>
    </div>
  );
}