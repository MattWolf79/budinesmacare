const turnosAppLogo = '/logo-quieroturnoapp.png';

export const defaultNavItems = [
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

const navbarLogoFrameStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  width: '86px',
  minWidth: '86px',
  maxWidth: '86px',
  height: '54px',
  minHeight: '54px',
  maxHeight: '54px',
  overflow: 'hidden'
};

const navbarLogoImageStyle = {
  display: 'block',
  width: '86px',
  minWidth: 0,
  maxWidth: '86px',
  height: '54px',
  maxHeight: '54px',
  objectFit: 'contain',
  flex: '0 0 auto'
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
  canChangeProfile = false,
  navItems = defaultNavItems,
  logoSrc = turnosAppLogo,
  logoAlt
}) {

  return (
    <div className="app-navbar">
      <div className="app-navbar-brand app-navbar-logo-box">
        <span className="app-navbar-logo-frame" style={navbarLogoFrameStyle}>
          <img className="app-navbar-logo-image" style={navbarLogoImageStyle} src={logoSrc || turnosAppLogo} alt={logoAlt || `QuieroTurnoApp - ${getNavbarSubtitle(accessProfile)}`} />
        </span>
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