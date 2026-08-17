import {
  useEffect,
  useMemo,
  useState
} from 'react';

import {
  matchPath,
  Outlet,
  useLocation
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


/*
 * ============================================================
 * VISTA ACTIVA SEGÚN LA RUTA
 * ============================================================
 */

const obtenerVistaEmpleado = (
  pathname,
  rutas
) => {

  if (
    matchPath(
      {
        path:
          rutas.clientes,
        end:
          true
      },
      pathname
    )
  ) {

    return 'clients';
  }


  if (
    matchPath(
      {
        path:
          rutas.productos,
        end:
          true
      },
      pathname
    )
  ) {

    return 'products';
  }


  if (
    matchPath(
      {
        path:
          rutas.disponibilidad,
        end:
          true
      },
      pathname
    )
  ) {

    return 'availability';
  }


  if (
    matchPath(
      {
        path:
          rutas.perfil,
        end:
          true
      },
      pathname
    )
  ) {

    return 'profile';
  }


  if (
    matchPath(
      {
        path:
          rutas.cerrarAtencion,
        end:
          true
      },
      pathname
    )
  ) {

    return 'close-attention';
  }


  /*
   * Nueva reserva / nuevo pedido.
   *
   * Estas rutas siguen existiendo como rutas
   * válidas, pero normalmente la apertura desde
   * el menú se hace como popup sobre la vista
   * actual.
   */

  if (
    matchPath(
      {
        path:
          rutas.nuevaReserva,
        end:
          true
      },
      pathname
    ) ||
    matchPath(
      {
        path:
          rutas.nuevoPedido,
        end:
          true
      },
      pathname
    )
  ) {

    return 'new-booking';
  }


  if (
    matchPath(
      {
        path:
          rutas.agenda,
        end:
          true
      },
      pathname
    )
  ) {

    return 'agenda';
  }


  /*
   * Inicio:
   *
   * /:companySlug/empleado
   */

  if (
    matchPath(
      {
        path:
          rutas.inicio,
        end:
          true
      },
      pathname
    )
  ) {

    return 'summary';
  }


  return 'summary';
};


/*
 * ============================================================
 * TEXTOS DEL HERO
 * ============================================================
 */

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


/*
 * ============================================================
 * MENÚ DEL EMPLEADO
 * ============================================================
 */

const crearNavegacionEmpleado = ({
  esModoPedido,
  empleadosPuedenReservar,
  rutas
}) => {

  const base =
    esModoPedido

      ? [

          {
            id:
              'summary',

            label:
              'Resumen',

            mobileLabel:
              'Resumen',

            icon:
              '▦',

            path:
              rutas.inicio
          },

          {
            id:
              'agenda',

            label:
              'Pedidos',

            mobileLabel:
              'Pedidos',

            icon:
              '📋',

            path:
              rutas.agenda
          },

          {
            id:
              'close-attention',

            label:
              'Cerrar pedido',

            mobileLabel:
              'Cerrar',

            icon:
              '💳',

            path:
              rutas.cerrarAtencion
          },

          {
            id:
              'clients',

            label:
              'Clientes',

            mobileLabel:
              'Clientes',

            icon:
              '🙋',

            path:
              rutas.clientes
          },

          {
            id:
              'products',

            label:
              'Productos',

            mobileLabel:
              'Productos',

            icon:
              '✨',

            path:
              rutas.productos
          },

          {
            id:
              'profile',

            label:
              'Mi perfil',

            mobileLabel:
              'Perfil',

            icon:
              '👤',

            path:
              rutas.perfil
          }

        ]

      : [

          {
            id:
              'summary',

            label:
              'Resumen',

            mobileLabel:
              'Resumen',

            icon:
              '▦',

            path:
              rutas.inicio
          },

          {
            id:
              'agenda',

            label:
              'Agenda',

            mobileLabel:
              'Agenda',

            icon:
              '📅',

            path:
              rutas.agenda
          },

          {
            id:
              'close-attention',

            label:
              'Cerrar atención',

            mobileLabel:
              'Cerrar',

            icon:
              '💳',

            path:
              rutas.cerrarAtencion
          },

          {
            id:
              'clients',

            label:
              'Clientes',

            mobileLabel:
              'Clientes',

            icon:
              '🙋',

            path:
              rutas.clientes
          },

          {
            id:
              'profile',

            label:
              'Mi perfil',

            mobileLabel:
              'Perfil',

            icon:
              '👤',

            path:
              rutas.perfil
          },

          {
            id:
              'availability',

            label:
              'Disponibilidad',

            mobileLabel:
              'Horario',

            icon:
              '🕒',

            path:
              rutas.disponibilidad
          }

        ];


  /*
   * Nueva reserva / pedido es una ACCIÓN.
   *
   * No le ponemos path.
   *
   * De esta forma AdminSidebar no navega
   * cuando se pulsa y EmployeeLayout abre
   * el popup sobre la página actual.
   */

  const conNuevaAccion =
    empleadosPuedenReservar

      ? [

          base[0],

          {

            id:
              'new-booking',

            label:
              esModoPedido
                ? 'Nuevo pedido'
                : 'Nueva reserva',

            mobileLabel:
              esModoPedido
                ? 'Pedido'
                : 'Reservar',

            icon:
              '➕'

          },

          ...base.slice(1)

        ]

      : base;


  return {

    items:
      conNuevaAccion,


    gruposSidebar: [

      {

        label:
          'MI ESPACIO',

        items:
          conNuevaAccion.map(
            item => ({

              id:
                item.id,

              label:
                item.label,

              icon:
                item.icon,

              /*
               * IMPORTANTE:
               *
               * Las rutas del Sidebar del empleado
               * son rutas de empleado, no de admin.
               */

              ...(item.path
                ? {
                    path:
                      item.path
                  }
                : {})

            })
          )

      }

    ]

  };
};


/*
 * ============================================================
 * LAYOUT EMPLEADO
 * ============================================================
 */

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


  const [
    sidebarOpen,
    setSidebarOpen
  ] = useState(false);


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


  /*
   * ==========================================================
   * RUTAS
   * ==========================================================
   */

  const rutas =
    useMemo(
      () =>
        obtenerRutasEmpleado(
          companySlug
        ),
      [
        companySlug
      ]
    );


  /*
   * ==========================================================
   * VISTA ACTUAL
   * ==========================================================
   */

  const activeView =
    useMemo(
      () =>
        obtenerVistaEmpleado(
          location.pathname,
          rutas
        ),
      [
        location.pathname,
        rutas
      ]
    );


  /*
   * ==========================================================
   * CONFIGURACIÓN OPERATIVA
   * ==========================================================
   */

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


  /*
   * ==========================================================
   * NAVEGACIÓN
   * ==========================================================
   */

  const navegacion =
    useMemo(
      () =>
        crearNavegacionEmpleado({

          esModoPedido,

          empleadosPuedenReservar,

          rutas

        }),
      [
        esModoPedido,
        empleadosPuedenReservar,
        rutas
      ]
    );


  /*
   * ==========================================================
   * HERO
   * ==========================================================
   */

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


  /*
   * ==========================================================
   * CONFIGURACIÓN DE EMPRESA
   * ==========================================================
   */

  useEffect(() => {

    let activo =
      true;


    const cargarConfiguracion =
      async () => {

        const {
          data,
          error
        } =
          await obtenerConfiguracionApp(
            companySlug
          );


        if (
          !activo ||
          error
        ) {

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

          setWelcomeBackground(
            null
          );

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

      activo =
        false;


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
   * ==========================================================
   * DETECCIÓN DE NUEVA RESERVA / PEDIDO
   * ==========================================================
   *
   * IMPORTANTE:
   *
   * Ya NO utilizamos la URL para abrir el popup.
   *
   * La apertura se controla mediante
   * isNewBookingOpen.
   *
   * Esto permite que el popup aparezca
   * sobre Clientes, Agenda, Perfil, etc.
   * sin cambiar la página de fondo.
   */


  /*
   * ==========================================================
   * ABRIR NUEVA RESERVA / PEDIDO
   * ==========================================================
   */

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


      /*
       * NO hacemos navigate().
       *
       * El popup aparece encima de la vista
       * actual, exactamente como en Admin.
       */

      setIsNewBookingOpen(
        true
      );


      setSidebarOpen(
        false
      );

    };


  /*
   * ==========================================================
   * CERRAR NUEVA RESERVA / PEDIDO
   * ==========================================================
   *
   * Al cerrar:
   *
   * - limpiamos los datos iniciales
   * - cerramos el popup
   * - NO navegamos
   *
   * Por lo tanto, si estábamos en Clientes,
   * volvemos a ver Clientes.
   *
   * Si estábamos en Agenda,
   * volvemos a Agenda.
   */

  const cerrarNuevaReserva =
    () => {

      setNewBookingInitial(
        null
      );


      setIsNewBookingOpen(
        false
      );

    };


  /*
   * ==========================================================
   * HERO DINÁMICO
   * ==========================================================
   */

  const heroTitle =
    esModoPedido &&
    activeView === 'agenda'

      ? 'Pedidos'

      : esModoPedido &&
          activeView ===
            'close-attention'

        ? 'Cerrar pedido'

        : heroCopy.title;


  const heroDescription =
    esModoPedido &&
    activeView === 'agenda'

      ? 'Listado cronológico de pedidos por día.'

      : esModoPedido &&
          activeView ===
            'close-attention'

        ? 'Cerrá pedidos entregados, cargá medios de pago y generá el comprobante.'

        : heroCopy.description;


  /*
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (

    <main
      className="
        role-workspace
        role-workspace-employee
        has-role-sidebar
      "
    >

      <Navbar

        user={
          user
        }

        activeView={
          activeView
        }

        accessProfile="employee"

        /*
         * Las acciones normales ya no pasan por
         * onViewChange.
         *
         * AdminSidebar utiliza NavLink.
         *
         * Lo dejamos disponible por compatibilidad
         * con componentes que eventualmente lo utilicen.
         */

        onViewChange={() => {}}

        onChangeProfile={
          onChangeProfile
        }

        onLogout={
          onLogout
        }

        showNavigation={
          false
        }

        showMenuToggle

        onMenuToggle={() =>
          setSidebarOpen(
            current =>
              !current
          )
        }

        canChangeProfile={
          canChangeProfile
        }

        logoSrc={
          workspaceLogoSrc
        }

        logoAlt={
          workspaceLogoAlt
        }

        companyName={
          companyName
        }

      />


      <div
        className="
          role-workspace-body
        "
      >

        <AdminSidebar

          groups={
            navegacion.gruposSidebar
          }

          activeView={
            activeView
          }

          /*
           * Solamente se utiliza para las acciones
           * sin path, principalmente new-booking.
           *
           * Las rutas normales son NavLink.
           */

          onViewChange={(
            view
          ) => {

            if (
              view ===
              'new-booking'
            ) {

              abrirNuevaReserva();

            }

          }}

          open={
            sidebarOpen
          }

          onClose={() =>
            setSidebarOpen(
              false
            )
          }

          companyName={
            companyName
          }

          logoSrc={
            workspaceLogoSrc
          }

          companySlug={
            companySlug
          }

        />


        <div
          className="
            role-workspace-content
          "
        >

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

                user={
                  user
                }

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

          user={
            user
          }

          companySlug={
            companySlug
          }

          companyContext={
            companyContext
          }

          initialDate={
            newBookingInitial?.date ||
            null
          }

          initialStartTime={
            newBookingInitial?.startTime ||
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

          }}

        />

      )}

    </main>

  );

}