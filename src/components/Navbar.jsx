const turnosAppLogo = '/logo-quieroturnoapp.png';

const defaultNavItems = [
  { id: 'agenda', label: 'Agenda', icon: '📅' },
  { id: 'employees', label: 'Empleados', icon: '👥' },
  { id: 'services', label: 'Servicios', icon: '✨' },
  { id: 'availability', label: 'Disponibilidad', icon: '🕒' },
  { id: 'settings', label: 'Configuración', icon: '⚙' }
];

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
  canChangeProfile = false,
  navItems = defaultNavItems
}) {

  return (
    <div className="app-navbar">
      <div className="app-navbar-brand">
        <img className="app-navbar-logo" src={turnosAppLogo} alt={`QuieroTurnoApp - ${getNavbarSubtitle(accessProfile)}`} />
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