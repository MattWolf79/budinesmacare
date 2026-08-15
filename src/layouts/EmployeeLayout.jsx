import {
  useEffect,
  useMemo,
  useState
} from 'react';

import {
  Outlet,
  useLocation,
  useNavigate
} from 'react-router-dom';

import Navbar from '../components/Navbar';
import AdminSidebar from '../components/AdminSidebar';
import NewBookingPanel from '../components/NewBookingPanel';

import {
  WorkspaceHero,
  WorkspaceProfileIdentity
} from '../components/WorkspaceHero';

import {
  obtenerConfiguracionApp
} from '../api/configuracionApp';

import {
  obtenerRutasEmpleado
} from '../routes/rutasAplicacion';

const turnosAppLogo =
  '/logo-quieroturnoapp.png';

const obtenerVistaEmpleado =
  (pathname) => {
    const path =
      String(pathname || '')
        .toLowerCase();

    if (
      path.endsWith(
        '/clientes'
      )
    ) {
      return 'clients';
    }

    if (
      path.endsWith(
        '/productos'
      )
    ) {
      return 'products';
    }

    if (
      path.endsWith(
        '/disponibilidad'
      )
    ) {
      return 'availability';
    }

    if (
      path.endsWith(
        '/perfil'
      )
    ) {
      return 'profile';
    }

    if (
      path.endsWith(
        '/cerrar-atencion'
      )
    ) {
      return 'close-attention';
    }

    if (
      path.endsWith(
        '/nueva-reserva'
      ) ||
      path.endsWith(
        '/nuevo-pedido'
      )
    ) {
      return 'new-booking';
    }

    if (
      path.endsWith(
        '/agenda'
      )
    ) {
      return 'agenda';
    }

    return 'summary';
  };

const employeeHeroCopy = {
  summary: {
    eyebrow:
      'Acceso interno',
    title:
      'Mi espacio',
    description:
      'Un vistazo a tu día, próximos turnos y disponibilidad.'
  },

  agenda: {
    eyebrow:
      'Acceso interno',
    title:
      'Mi agenda laboral',
    description:
      'Un panel enfocado en los turnos asignados.'
  },

  'close-attention': {
    eyebrow:
      'Cobro',
    title:
      'Cerrar atención',
    description:
      'Liquidá turnos atendidos, cargá medios de pago y generá el comprobante.'
  },

  'new-booking': {
    eyebrow:
      'Reserva',
    title:
      'Nueva reserva',
    description:
      'Creá un turno para un cliente.'
  },

  clients: {
    eyebrow:
      'Clientes',
    title:
      'Gestión de clientes',
    description:
      'Administrá y organizá tu base de clientes.'
  },

  products: {
    eyebrow:
      'Catálogo',
    title:
      'Productos',
    description:
      'Consultá productos y tipos de producto configurados.'
  },

  profile: {
    eyebrow:
      'Mi perfil',
    title:
      'Mi perfil',
    description:
      'Revisá y actualizá tus datos personales.'
  },

  availability: {
    eyebrow:
      'Agenda disponible',
    title:
      'Disponibilidad',
    description:
      'Configurá los días y horarios en los que atendés.'
  }
};

const crearNavegacionEmpleado =
  ({
    esModoPedido,
    empleadosPuedenReservar
  }) => {
    const base =
      esModoPedido
        ? [
            {
              id: 'summary',
              label: 'Resumen',
              mobileLabel: 'Resumen',
              icon: '▦'
            },
            {
              id: 'agenda',
              label: 'Pedidos',
              mobileLabel: 'Pedidos',
              icon: '📋'
            },
            {
              id: 'close-attention',
              label: 'Cerrar pedido',
              mobileLabel: 'Cerrar',
              icon: '💳'
            },
            {
              id: 'clients',
              label: 'Clientes',
              mobileLabel: 'Clientes',
              icon: '🙋'
            },
            {
              id: 'products',
              label: 'Productos',
              mobileLabel: 'Productos',
              icon: '✨'
            },
            {
              id: 'profile',
              label: 'Mi perfil',
              mobileLabel: 'Perfil',
              icon: '👤'
            }
          ]
        : [
            {
              id: 'summary',
              label: 'Resumen',
              mobileLabel: 'Resumen',
              icon: '▦'
            },
            {
              id: 'agenda',
              label: 'Agenda',
              mobileLabel: 'Agenda',
              icon: '📅'
            },
            {
              id: 'close-attention',
              label: 'Cerrar atención',
              mobileLabel: 'Cerrar',
              icon: '💳'
            },
            {
              id: 'clients',
              label: 'Clientes',
              mobileLabel: 'Clientes',
              icon: '🙋'
            },
            {
              id: 'profile',
              label: 'Mi perfil',
              mobileLabel: 'Perfil',
              icon: '👤'
            },
            {
              id: 'availability',
              label: 'Disponibilidad',
              mobileLabel: 'Horario',
              icon: '🕒'
            }
          ];

    const conNuevaAccion =
      empleadosPuedenReservar
        ? [
            base[0],
            {
              id: 'new-booking',
              label:
                esModoPedido
                  ? 'Nuevo pedido'
                  : 'Nueva reserva',
              mobileLabel:
                esModoPedido
                  ? 'Pedido'
                  : 'Reservar',
              icon: '➕'
            },
            ...base.slice(1)
          ]
        : base;

    return {
      items:
        conNuevaAccion,

      gruposSidebar: [
        {
          label: 'MI ESPACIO',
          items:
            conNuevaAccion.map(
              (item) => ({
                id: item.id,
                label: item.label,
                icon: item.icon
              })
            )
        }
      ]
    };
  };

export default function EmployeeLayout({
  user,
  onChangeProfile,
  canChangeProfile,
  onLogout,
  companySlug,
  companyContext
}) {
  const location =
    useLocation();

  const navigate =
    useNavigate();

  const [sidebarOpen, setSidebarOpen] =
    useState(false);

  const [
    isNewBookingOpen,
    setIsNewBookingOpen
  ] = useState(false);

  const [
    newBookingInitial,
    setNewBookingInitial
  ] = useState(null);

  const [
    companyName,
    setCompanyName
  ] = useState(
    companyContext?.company_name ||
      companyContext?.name ||
      'QuieroTurnoApp'
  );

  const [
    welcomeBackground,
    setWelcomeBackground
  ] = useState(null);

  const activeView =
    obtenerVistaEmpleado(
      location.pathname
    );

  const rutas =
    useMemo(
      () =>
        obtenerRutasEmpleado(
          companySlug
        ),
      [companySlug]
    );

  const configuracionOperativa =
    companyContext
      ?.configuracion_operativa ||
    {};

  const esModoPedido =
    configuracionOperativa.modo_operacion ===
      'pedido' ||
    configuracionOperativa.usa_agenda ===
      false;

  const empleadosPuedenReservar =
    configuracionOperativa.empleados_pueden_reservar !==
    false;

  const navegacion =
    useMemo(
      () =>
        crearNavegacionEmpleado({
          esModoPedido,
          empleadosPuedenReservar
        }),
      [
        esModoPedido,
        empleadosPuedenReservar
      ]
    );

  const heroCopy =
    employeeHeroCopy[
      activeView
    ] ||
    employeeHeroCopy.summary;

  const workspaceLogoSrc =
    companyContext?.client_logo_data_url ||
    turnosAppLogo;

  const workspaceLogoAlt =
    companyContext?.client_logo_data_url
      ? `${companyName} - Empleado`
      : undefined;

  const welcomeBackgroundUrl =
    welcomeBackground?.dataUrl ||
    welcomeBackground?.publicUrl ||
    '';

  const welcomeBackgroundStyle =
    welcomeBackgroundUrl
      ? {
          '--welcome-background-image':
            `url("${welcomeBackgroundUrl}")`
        }
      : undefined;

  useEffect(() => {
    let activo = true;

    const cargarConfiguracion =
      async () => {
        const {
          data,
          error
        } =
          await obtenerConfiguracionApp(
            companySlug
          );

        if (!activo || error) {
          return;
        }

        setCompanyName(
          String(
            data?.company_name ||
              companyContext?.company_name ||
              'QuieroTurnoApp'
          ).trim() ||
            'QuieroTurnoApp'
        );

        if (
          data?.welcome_background_data_url ||
          data?.welcome_background_public_url
        ) {
          setWelcomeBackground({
            dataUrl:
              data.welcome_background_data_url ||
              '',
            publicUrl:
              data.welcome_background_public_url ||
              ''
          });
        } else {
          setWelcomeBackground(null);
        }
      };

    cargarConfiguracion();

    const actualizarConfiguracion =
      () => {
        cargarConfiguracion();
      };

    window.addEventListener(
      'turnos-app-configuration-saved',
      actualizarConfiguracion
    );

    return () => {
      activo = false;

      window.removeEventListener(
        'turnos-app-configuration-saved',
        actualizarConfiguracion
      );
    };
  }, [
    companySlug,
    companyContext?.company_name
  ]);

  /*
   * Si entramos directamente a:
   *
   * /empleado/nueva-reserva
   * /empleado/nuevo-pedido
   *
   * abrimos el panel.
   */
  useEffect(() => {
    const esNuevaReserva =
      location.pathname.endsWith(
        '/nueva-reserva'
      );

    const esNuevoPedido =
      location.pathname.endsWith(
        '/nuevo-pedido'
      );

    if (
      esNuevaReserva ||
      esNuevoPedido
    ) {
      if (
        !empleadosPuedenReservar
      ) {
        navigate(
          rutas.agenda,
          { replace: true }
        );
        return;
      }

      setIsNewBookingOpen(true);
      return;
    }

    setIsNewBookingOpen(false);
  }, [
    location.pathname,
    empleadosPuedenReservar,
    navigate,
    rutas.agenda
  ]);

  const navegarA =
    (view) => {
      setSidebarOpen(false);

      if (
        view === 'summary'
      ) {
        navigate(
          rutas.inicio
        );
        return;
      }

      if (
        view === 'agenda'
      ) {
        navigate(
          rutas.agenda
        );
        return;
      }

      if (
        view === 'clients'
      ) {
        navigate(
          rutas.clientes
        );
        return;
      }

      if (
        view === 'products'
      ) {
        navigate(
          rutas.productos
        );
        return;
      }

      if (
        view === 'availability'
      ) {
        navigate(
          rutas.disponibilidad
        );
        return;
      }

      if (
        view === 'profile'
      ) {
        navigate(
          rutas.perfil
        );
        return;
      }

      if (
        view === 'close-attention'
      ) {
        navigate(
          rutas.cerrarAtencion
        );
        return;
      }

      if (
        view === 'new-booking'
      ) {
        setNewBookingInitial(null);

        navigate(
          esModoPedido
            ? rutas.nuevoPedido
            : rutas.nuevaReserva
        );

        return;
      }
    };

  const abrirNuevaReserva =
    (options = null) => {
      if (
        !empleadosPuedenReservar
      ) {
        return;
      }

      setNewBookingInitial(
        options
      );

      navigate(
        esModoPedido
          ? rutas.nuevoPedido
          : rutas.nuevaReserva
      );
    };

  const cerrarNuevaReserva =
    () => {
      setNewBookingInitial(
        null
      );

      setIsNewBookingOpen(
        false
      );

      navigate(
        rutas.agenda,
        {
          replace: true
        }
      );
    };

  const heroTitle =
    esModoPedido &&
    activeView === 'agenda'
      ? 'Pedidos'
      : esModoPedido &&
          activeView ===
            'close-attention'
        ? 'Cerrar pedido'
        : esModoPedido &&
            activeView ===
              'new-booking'
          ? 'Nuevo pedido'
          : heroCopy.title;

  const heroDescription =
    esModoPedido &&
    activeView === 'agenda'
      ? 'Listado cronológico de pedidos por día.'
      : esModoPedido &&
          activeView ===
            'close-attention'
        ? 'Cerrá pedidos entregados, cargá medios de pago y generá el comprobante.'
        : esModoPedido &&
            activeView ===
              'new-booking'
          ? 'Creá un pedido para un cliente.'
          : heroCopy.description;

  return (
    <main className="role-workspace role-workspace-employee has-role-sidebar">
      <Navbar
        user={user}
        activeView={activeView}
        accessProfile="employee"
        onViewChange={navegarA}
        onChangeProfile={
          onChangeProfile
        }
        onLogout={onLogout}
        showNavigation={false}
        showMenuToggle
        onMenuToggle={() =>
          setSidebarOpen(
            (current) => !current
          )
        }
        canChangeProfile={
          canChangeProfile
        }
        logoSrc={workspaceLogoSrc}
        logoAlt={workspaceLogoAlt}
        companyName={companyName}
      />

      <div className="role-workspace-body">
        <AdminSidebar
          groups={
            navegacion.gruposSidebar
          }
          activeView={activeView}
          onViewChange={navegarA}
          open={sidebarOpen}
          onClose={() =>
            setSidebarOpen(false)
          }
          companyName={companyName}
          logoSrc={workspaceLogoSrc}
        />

        <div className="role-workspace-content">
          <WorkspaceHero
            className={
              welcomeBackgroundUrl
                ? 'employee-welcome-hero has-custom-background'
                : ''
            }
            style={
              welcomeBackgroundUrl
                ? welcomeBackgroundStyle
                : undefined
            }
            eyebrow={
              heroCopy.eyebrow
            }
            title={
              heroTitle
            }
            description={
              heroDescription
            }
            identity={
              <WorkspaceProfileIdentity
                user={user}
                roleLabel="Empleado"
                photoFallback="🧑‍💼"
              />
            }
          />

          <Outlet
            context={{
              onRequestNewBooking:
                abrirNuevaReserva
            }}
          />
        </div>
      </div>

      {isNewBookingOpen && (
        <NewBookingPanel
          user={user}
          companySlug={companySlug}
          companyContext={
            companyContext
          }
          initialDate={
            newBookingInitial?.date ||
            null
          }
          initialStartTime={
            newBookingInitial
              ?.startTime ||
            null
          }
          branchId={
            newBookingInitial?.branchId ||
            null
          }
          onClose={
            cerrarNuevaReserva
          }
          onBookingCreated={() => {
            window.dispatchEvent(
              new Event(
                'turnos-app-configuration-saved'
              )
            );

            setNewBookingInitial(
              null
            );

            setIsNewBookingOpen(
              false
            );

            navigate(
              rutas.agenda
            );
          }}
        />
      )}
    </main>
  );
}