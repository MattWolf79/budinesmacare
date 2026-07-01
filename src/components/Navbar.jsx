const defaultNavItems = [
  { id: 'agenda', label: 'Agenda', icon: '📅' },
  { id: 'employees', label: 'Empleados', icon: '👥' },
  { id: 'services', label: 'Actividades', icon: '✨' },
  { id: 'blocks', label: 'Bloqueos', icon: '⛔' }
];

const profileLabels = {
  admin: 'Administrador',
  client: 'Cliente',
  employee: 'Empleado'
};

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
        <span className="app-navbar-mark">T</span>
        <div>
          <div className="app-navbar-title">Turnos App</div>
          <div className="app-navbar-subtitle">Agenda y administración</div>
        </div>
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