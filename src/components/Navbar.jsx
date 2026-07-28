import { useLayoutEffect, useRef, useState } from 'react';

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
  logoAlt,
  companyName = '',
  showMenuToggle = false,
  onMenuToggle
}) {

  const companyRef = useRef(null);
  const companyTextRef = useRef(null);
  const [companyMarquee, setCompanyMarquee] = useState({ active: false, distance: 0 });

  useLayoutEffect(() => {
    if (!companyName) {
      setCompanyMarquee({ active: false, distance: 0 });
      return undefined;
    }

    const measure = () => {
      const container = companyRef.current;
      const text = companyTextRef.current;
      if (!container || !text) return;

      const overflow = text.scrollWidth - container.clientWidth;
      setCompanyMarquee(
        overflow > 1
          ? { active: true, distance: text.scrollWidth }
          : { active: false, distance: 0 }
      );
    };

    measure();

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (observer && companyRef.current) observer.observe(companyRef.current);
    window.addEventListener('resize', measure);

    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [companyName]);

  // Velocidad constante (~60px/s) independientemente del largo del nombre.
  const companyMarqueeDuration = Math.max(8, Math.round((companyMarquee.distance + 48) / 60));

  return (
    <div className="app-navbar">
      {showMenuToggle && (
        <button
          className="app-navbar-menu-toggle"
          type="button"
          onClick={onMenuToggle}
          aria-label="Abrir menú"
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      )}

      <div className="app-navbar-brand app-navbar-logo-box">
        <span className="app-navbar-logo-frame" style={navbarLogoFrameStyle}>
          <img className="app-navbar-logo-image" style={navbarLogoImageStyle} src={logoSrc || turnosAppLogo} alt={logoAlt || `QuieroTurnoApp - ${getNavbarSubtitle(accessProfile)}`} />
        </span>
      </div>

      {companyName && (
        <div className="app-navbar-company" title={companyName} ref={companyRef}>
          <div
            className={`app-navbar-company-track${companyMarquee.active ? ' is-marquee' : ''}`}
            style={companyMarquee.active ? { animationDuration: `${companyMarqueeDuration}s` } : undefined}
          >
            <span className="app-navbar-company-text" ref={companyTextRef}>{companyName}</span>
            {companyMarquee.active && (
              <span className="app-navbar-company-text" aria-hidden="true">{companyName}</span>
            )}
          </div>
        </div>
      )}

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
        {user?.id && canChangeProfile && (
          <button className="app-navbar-switch" type="button" onClick={onChangeProfile} title="Cambiar perfil">
            Perfil
          </button>
        )}

        {user?.id && (
          <button className="app-navbar-logout" type="button" onClick={onLogout}>
            Salir
          </button>
        )}
      </div>
    </div>
  );
}