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


/*
 * ============================================================
 * VISTA ACTIVA SEGÚN LA URL
 * ============================================================
 */

const obtenerVistaEmpleado = (
  pathname
) => {

  const path =
    String(pathname || '')
      .toLowerCase()
      .replace(/\/+$/, '');


  if (
    path.endsWith('/clientes')
  ) {
    return 'clients';
  }


  if (
    path.endsWith('/productos')
  ) {
    return 'products';
  }


  if (
    path.endsWith('/disponibilidad')
  ) {
    return 'availability';
  }


  if (
    path.endsWith('/perfil')
  ) {
    return 'profile';
  }


  if (
    path.endsWith('/cerrar-atencion')
  ) {
    return 'close-attention';
  }


  if (
    path.endsWith('/nueva-reserva') ||
    path.endsWith('/nuevo-pedido')
  ) {
    return 'new-booking';
  }


  if (
    path.endsWith('/agenda')
  ) {
    return 'agenda';
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
  empleadosPuedenReservar
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
              '▦'
          },

          {
            id:
              'agenda',

            label:
              'Pedidos',

            mobileLabel:
              'Pedidos',

            icon:
              '📋'
          },

          {
            id:
              'close-attention',

            label:
              'Cerrar pedido',

            mobileLabel:
              'Cerrar',

            icon:
              '💳'
          },

          {
            id:
              'clients',

            label:
              'Clientes',

            mobileLabel:
              'Clientes',

            icon:
              '🙋'
          },

          {
            id:
              'products',

            label:
              'Productos',

            mobileLabel:
              'Productos',

            icon:
              '✨'
          },

          {
            id:
              'profile',

            label:
              'Mi perfil',

            mobileLabel:
              'Perfil',

            icon:
              '👤'
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
              '▦'
          },

          {
            id:
              'agenda',

            label:
              'Agenda',

            mobileLabel:
              'Agenda',

            icon:
              '📅'
          },

          {
            id:
              'close-attention',

            label:
              'Cerrar atención',

            mobileLabel:
              'Cerrar',

            icon:
              '💳'
          },

          {
            id:
              'clients',

            label:
              'Clientes',

            mobileLabel:
              'Clientes',

            icon:
              '🙋'
          },

          {
            id:
              'profile',

            label:
              'Mi perfil',

            mobileLabel:
              'Perfil',

            icon:
              '👤'
          },

          {
            id:
              'availability',

            label:
              'Disponibilidad',

            mobileLabel:
              'Horario',

            icon:
              '🕒'
          }

        ];


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
            (item) => ({

              id:
                item.id,

              label:
                item.label,

              icon:
                item.icon

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


  const navigate =
    useNavigate();


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
    obtenerVistaEmpleado(
      location.pathname
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
          empleadosPuedenReservar
        }),
      [
        esModoPedido,
        empleadosPuedenReservar
      ]
    );


  /*
   * ==========================================================
   * MAPA ÚNICO DE NAVEGACIÓN
   * ==========================================================
   *
   * Cada opción del menú apunta a UNA ruta.
   *
   * No usamos window.location.
   * No usamos window.history.
   */

  const rutasPorVista =
    useMemo(
      () => ({

        summary:
          rutas.inicio,

        agenda:
          rutas.agenda,

        clients:
          rutas.clientes,

        products:
          rutas.productos,

        availability:
          rutas.disponibilidad,

        profile:
          rutas.perfil,

        'close-attention':
          rutas.cerrarAtencion,

        'new-booking':
          esModoPedido
            ? rutas.nuevoPedido
            : rutas.nuevaReserva

      }),
      [
        rutas,
        esModoPedido
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
   * ==========================================================
   * DETECCIÓN DE NUEVA RESERVA / PEDIDO
   * ==========================================================
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


    const esNuevaOperacion =
      esNuevaReserva ||
      esNuevoPedido;


    if (
      !esNuevaOperacion
    ) {

      setIsNewBookingOpen(
        false
      );

      return;

    }


    if (
      !empleadosPuedenReservar
    ) {

      navigate(
        rutas.agenda,
        {
          replace:
            true
        }
      );

      return;

    }


    setIsNewBookingOpen(
      true
    );

  }, [
    location.pathname,
    empleadosPuedenReservar,
    navigate,
    rutas.agenda
  ]);


  /*
   * ==========================================================
   * NAVEGAR DESDE EL MENÚ
   * ==========================================================
   */

  const navegarA =
    (view) => {

      setSidebarOpen(
        false
      );


      const ruta =
        rutasPorVista[
          view
        ];


      if (
        !ruta
      ) {
        return;
      }


      /*
       * Si ya estamos en esa ruta,
       * no hacemos nada.
       */
      if (
        location.pathname ===
        ruta
      ) {
        return;
      }


      navigate(
        ruta
      );

    };


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


      const ruta =
        esModoPedido
          ? rutas.nuevoPedido
          : rutas.nuevaReserva;


      if (
        location.pathname !==
        ruta
      ) {

        navigate(
          ruta
        );

      } else {

        setIsNewBookingOpen(
          true
        );

      }

    };


  /*
   * ==========================================================
   * CERRAR NUEVA RESERVA / PEDIDO
   * ==========================================================
   */

  const cerrarNuevaReserva =
    () => {

      setNewBookingInitial(
        null
      );


      setIsNewBookingOpen(
        false
      );


      if (
        location.pathname !==
        rutas.agenda
      ) {

        navigate(
          rutas.agenda,
          {
            replace:
              true
          }
        );

      }

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

        onViewChange={
          navegarA
        }

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

          onViewChange={
            navegarA
          }

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


            navigate(
              rutas.agenda
            );

          }}

        />

      )}

    </main>

  );

}