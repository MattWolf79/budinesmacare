import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  NavLink,
  useLocation
} from 'react-router-dom';

import {
  obtenerRutasCliente
} from '../routes/rutasAplicacion';


const turnosAppLogo =
  '/logo-quieroturnoapp.png';


export const defaultNavItems = [
  {
    id: 'agenda',
    label: 'Agenda',
    icon: '📅'
  },
  {
    id: 'employees',
    label: 'Empleados',
    icon: '👥'
  },
  {
    id: 'services',
    label: 'Servicios',
    icon: '✨'
  },
  {
    id: 'availability',
    label: 'Disponibilidad',
    icon: '🕒'
  },
  {
    id: 'settings',
    label: 'Configuración',
    icon: '⚙'
  }
];


const getNavbarSubtitle = (
  accessProfile
) => (

  accessProfile ===
  'client'

    ? 'Reservas online'

    : accessProfile ===
      'employee'

      ? 'Agenda laboral'

      : 'Panel comercial'

);


const navbarLogoFrameStyle = {

  display:
    'flex',

  alignItems:
    'center',

  justifyContent:
    'flex-start',

  width:
    '86px',

  minWidth:
    '86px',

  maxWidth:
    '86px',

  height:
    '54px',

  minHeight:
    '54px',

  maxHeight:
    '54px',

  overflow:
    'hidden'

};


const navbarLogoImageStyle = {

  display:
    'block',

  width:
    '86px',

  minWidth:
    0,

  maxWidth:
    '86px',

  height:
    '54px',

  maxHeight:
    '54px',

  objectFit:
    'contain',

  flex:
    '0 0 auto'

};


const getProfileNavItems = (
  accessProfile,
  companySlug
) => {

  if (
    accessProfile ===
    'client'
  ) {

    const rutas =
      obtenerRutasCliente(
        companySlug
      );


    return [

      {
        id:
          'inicio',

        label:
          'Inicio',

        icon:
          '🏠',

        path:
          rutas.inicio
      },

      {
        id:
          'reserva',

        label:
          'Reservar turno',

        icon:
          '📅',

        path:
          rutas.reserva
      },

      {
        id:
          'misTurnos',

        label:
          'Mis turnos',

        icon:
          '📋',

        path:
          rutas.misTurnos
      },

      {
        id:
          'perfil',

        label:
          'Mi cuenta',

        icon:
          '👤',

        path:
          rutas.perfil
      }

    ];
  }


  return [];
};


export default function Navbar({

  user,

  activeView,

  accessProfile,

  onViewChange,

  onChangeProfile,

  onLogout,

  showNavigation,

  canChangeProfile = false,

  navItems,

  logoSrc =
    turnosAppLogo,

  logoAlt,

  companyName = '',

  showMenuToggle = false,

  onMenuToggle

}) {

  const location =
    useLocation();


  const companySlug =
    'budinesmacare';


  /*
   * Para cliente y empleado la navegación
   * se muestra automáticamente.
   *
   * Para administrador queda controlada
   * explícitamente por Dashboard.
   */

  const shouldShowNavigation =
    typeof showNavigation ===
    'boolean'

      ? showNavigation

      : accessProfile !==
        'admin';


  const resolvedNavItems =
    useMemo(
      () => {

        if (
          Array.isArray(
            navItems
          ) &&
          navItems.length
        ) {

          return navItems.map(
            item => ({
              ...item
            })
          );
        }


        return getProfileNavItems(
          accessProfile,
          companySlug
        );

      },
      [
        navItems,
        accessProfile,
        companySlug
      ]
    );


  const companyRef =
    useRef(null);


  const companyTextRef =
    useRef(null);


  const [
    companyMarquee,
    setCompanyMarquee
  ] = useState({

    active:
      false,

    distance:
      0

  });


  useLayoutEffect(() => {

    if (
      !companyName
    ) {

      setCompanyMarquee({

        active:
          false,

        distance:
          0

      });

      return undefined;
    }


    const measure =
      () => {

        const container =
          companyRef.current;

        const text =
          companyTextRef.current;


        if (
          !container ||
          !text
        ) {

          return;
        }


        const overflow =
          text.scrollWidth -
          container.clientWidth;


        setCompanyMarquee(

          overflow > 1

            ? {

                active:
                  true,

                distance:
                  text.scrollWidth

              }

            : {

                active:
                  false,

                distance:
                  0

              }

        );
      };


    measure();


    const observer =
      typeof ResizeObserver !==
      'undefined'

        ? new ResizeObserver(
            measure
          )

        : null;


    if (
      observer &&
      companyRef.current
    ) {

      observer.observe(
        companyRef.current
      );
    }


    window.addEventListener(
      'resize',
      measure
    );


    return () => {

      if (
        observer
      ) {

        observer.disconnect();
      }


      window.removeEventListener(
        'resize',
        measure
      );

    };

  }, [
    companyName
  ]);


  const companyMarqueeDuration =
    Math.max(
      8,
      Math.round(
        (
          companyMarquee.distance +
          48
        ) / 60
      )
    );


  return (

    <div
      className="
        app-navbar
      "
    >

      {showMenuToggle && (

        <button

          className="
            app-navbar-menu-toggle
          "

          type="button"

          onClick={
            onMenuToggle
          }

          aria-label="
            Abrir menú
          "

        >

          <span
            aria-hidden="true"
          />

          <span
            aria-hidden="true"
          />

          <span
            aria-hidden="true"
          />

        </button>

      )}


      <div
        className="
          app-navbar-brand
          app-navbar-logo-box
        "
      >

        <span

          className="
            app-navbar-logo-frame
          "

          style={
            navbarLogoFrameStyle
          }

        >

          <img

            className="
              app-navbar-logo-image
            "

            style={
              navbarLogoImageStyle
            }

            src={
              logoSrc ||
              turnosAppLogo
            }

            alt={
              logoAlt ||
              `QuieroTurnoApp - ${getNavbarSubtitle(
                accessProfile
              )}`
            }

          />

        </span>

      </div>


      {companyName && (

        <div

          className="
            app-navbar-company
          "

          title={
            companyName
          }

          ref={
            companyRef
          }

        >

          <div

            className={`
              app-navbar-company-track
              ${
                companyMarquee.active
                  ? 'is-marquee'
                  : ''
              }
            `}

            style={
              companyMarquee.active

                ? {
                    animationDuration:
                      `${companyMarqueeDuration}s`
                  }

                : undefined
            }

          >

            <span

              className="
                app-navbar-company-text
              "

              ref={
                companyTextRef
              }

            >

              {
                companyName
              }

            </span>


            {companyMarquee.active && (

              <span

                className="
                  app-navbar-company-text
                "

                aria-hidden="true"

              >

                {
                  companyName
                }

              </span>

            )}

          </div>

        </div>

      )}


      {shouldShowNavigation && (

        <nav

          className="
            app-navbar-menu
          "

          aria-label="
            Secciones
          "

        >

          {resolvedNavItems.map(
            item => {

              /*
               * Los elementos con path son
               * navegación real de React Router.
               *
               * Los elementos sin path quedan
               * como acciones compatibles.
               */

              if (
                item?.path
              ) {

                return (

                  <NavLink

                    key={
                      item.id
                    }

                    to={
                      item.path
                    }

                    end

                    className={({
                      isActive
                    }) =>
                      `
                        app-navbar-button
                        ${
                          isActive
                            ? 'is-active'
                            : ''
                        }
                      `
                    }

                    style={{
                      textDecoration:
                        'none',

                      color:
                        'inherit'
                    }}

                    onClick={() => {

                      setTimeout(() => {

                        onViewChange?.(
                          item.id
                        );

                      }, 0);

                    }}

                  >

                    <span
                      aria-hidden="true"
                    >
                      {
                        item.icon
                      }
                    </span>

                    {
                      item.label
                    }

                  </NavLink>

                );
              }


              return (

                <button

                  key={
                    item.id
                  }

                  type="button"

                  className={`
                    app-navbar-button
                    ${
                      activeView ===
                      item.id
                        ? 'is-active'
                        : ''
                    }
                  `}

                  onClick={() =>
                    onViewChange?.(
                      item.id
                    )
                  }

                >

                  <span
                    aria-hidden="true"
                  >
                    {
                      item.icon
                    }
                  </span>

                  {
                    item.label
                  }

                </button>

              );

            }
          )}

        </nav>

      )}


      <div
        className="
          app-navbar-session
        "
      >

        {user?.id &&
          canChangeProfile && (

          <button

            className="
              app-navbar-switch
            "

            type="button"

            onClick={
              onChangeProfile
            }

            title="
              Cambiar perfil
            "

          >

            Perfil

          </button>

        )}


        {onLogout && (

          <button

            className="
              app-navbar-logout
            "

            type="button"

            onClick={
              onLogout
            }

          >

            Salir

          </button>

        )}

      </div>

    </div>

  );
}
