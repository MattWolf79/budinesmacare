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

import {
  WorkspaceHero,
  WorkspaceProfileIdentity
} from '../components/WorkspaceHero';

import {
  obtenerConfiguracionApp
} from '../api/configuracionApp';

import {
  obtenerRutasCliente
} from '../routes/rutasAplicacion';


const turnosAppLogo =
  '/logo-quieroturnoapp.png';


/*
 * ============================================================
 * VISTA ACTUAL DEL CLIENTE
 * ============================================================
 *
 * La vista se determina exclusivamente desde la URL.
 *
 * /empresa/sacarturno
 * /empresa/sacarturno/inicio
 * /empresa/sacarturno/reserva
 * /empresa/sacarturno/mis-turnos
 * /empresa/sacarturno/perfil
 *
 */

const obtenerVistaCliente = (
  pathname
) => {

  const path =
    String(pathname || '')
      .toLowerCase()
      .replace(/\/+$/, '');


  if (
    path.endsWith('/mis-turnos')
  ) {
    return 'mis-turnos';
  }


  if (
    path.endsWith('/perfil')
  ) {
    return 'perfil';
  }


  if (
    path.endsWith('/reserva')
  ) {
    return 'reserve';
  }


  return 'home';
};


/*
 * ============================================================
 * MENÚ CLIENTE
 * ============================================================
 */

const crearNavegacionCliente = (
  esModoPedido
) => {

  const etiquetaReserva =
    esModoPedido
      ? 'Hacer Pedido'
      : 'Nueva Reserva';


  const etiquetaHistorial =
    esModoPedido
      ? 'Mis pedidos'
      : 'Mis turnos';


  const items = [

    {
      id:
        'home',

      label:
        'Inicio',

      icon:
        '⌂'
    },

    {
      id:
        'reserve',

      label:
        etiquetaReserva,

      icon:
        esModoPedido
          ? '🛒'
          : '📅'
    },

    {
      id:
        'mis-turnos',

      label:
        etiquetaHistorial,

      icon:
        '📋'
    },

    {
      id:
        'perfil',

      label:
        'Perfil',

      icon:
        '👤'
    }

  ];


  return {

    items,


    gruposSidebar: [

      {
        label:
          'MI CUENTA',

        items:
          items.map(
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
 * TEXTOS DEL HERO
 * ============================================================
 */

const crearTextoHeroCliente =
  (esModoPedido) => ({

    home: {

      eyebrow:
        'Bienvenida',

      title:
        '',

      description:
        esModoPedido

          ? 'Descubrí promos, combos y productos, y armá tu pedido en minutos.'

          : 'Descubrí promos, packs y servicios, y reservá cuando quieras.'

    },


    reserve: {

      eyebrow:
        esModoPedido
          ? 'Pedido'
          : 'Reserva',

      title:
        esModoPedido
          ? 'Hacer pedido'
          : 'Reservar turno',

      description:
        esModoPedido

          ? 'Elegí productos, cantidades y detalles para enviar tu pedido.'

          : 'Seleccioná un horario disponible en la grilla para crear tu turno.'

    },


    'mis-turnos': {

      eyebrow:
        esModoPedido
          ? 'Mis pedidos'
          : 'Mis turnos',

      title:
        esModoPedido
          ? 'Mis pedidos'
          : 'Mis turnos',

      description:
        esModoPedido

          ? 'Revisá tus pedidos activos y tu historial.'

          : 'Revisá tus turnos activos y tu historial.'

    },


    perfil: {

      eyebrow:
        'Perfil',

      title:
        'Mi perfil',

      description:
        'Revisá y actualizá tus datos personales.'

    }

  });


/*
 * ============================================================
 * LAYOUT CLIENTE
 * ============================================================
 */

export default function ClientLayout({

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
    selectedPromotion,
    setSelectedPromotion
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
    businessHoursText,
    setBusinessHoursText
  ] = useState('');


  const [
    welcomeBackground,
    setWelcomeBackground
  ] = useState(null);


  /*
   * ==========================================================
   * VISTA ACTIVA
   * ==========================================================
   */

  const activeView =
    obtenerVistaCliente(
      location.pathname
    );


  /*
   * ==========================================================
   * RUTAS DEL CLIENTE
   * ==========================================================
   */

  const rutas =
    useMemo(
      () =>
        obtenerRutasCliente(
          companySlug
        ),
      [
        companySlug
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


  /*
   * ==========================================================
   * MENÚ
   * ==========================================================
   */

  const navegacion =
    useMemo(
      () =>
        crearNavegacionCliente(
          esModoPedido
        ),
      [
        esModoPedido
      ]
    );


  /*
   * ==========================================================
   * HERO
   * ==========================================================
   */

  const textosHero =
    useMemo(
      () =>
        crearTextoHeroCliente(
          esModoPedido
        ),
      [
        esModoPedido
      ]
    );


  const heroCopy =
    textosHero[
      activeView
    ] ||
    textosHero.home;


  /*
   * ==========================================================
   * LOGO
   * ==========================================================
   */

  const workspaceLogoSrc =
    companyContext?.client_logo_data_url ||
    turnosAppLogo;


  const workspaceLogoAlt =
    companyContext?.client_logo_data_url
      ? `${companyName} - Cliente`
      : undefined;


  /*
   * ==========================================================
   * BACKGROUND
   * ==========================================================
   */

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
   * CONFIGURACIÓN DE LA EMPRESA
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


        setBusinessHoursText(

          String(
            data?.business_hours_text ||
              ''
          ).trim()

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
              '',

            fileName:
              data.welcome_background_file_name ||
              '',

            mimeType:
              data.welcome_background_mime_type ||
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
   * NAVEGACIÓN
   * ==========================================================
   *
   * IMPORTANTE:
   *
   * Las rutas son generadas por obtenerRutasCliente()
   * y son absolutas:
   *
   * /empresa/sacarturno/inicio
   * /empresa/sacarturno/reserva
   * etc.
   *
   * No usamos window.location.
   * No usamos window.history.
   */

  const navegarA =
    (view) => {

      const mapaRutas = {

        home:
          rutas.inicio,

        reserve:
          rutas.reserva,

        'mis-turnos':
          rutas.misTurnos,

        perfil:
          rutas.perfil

      };


      const ruta =
        mapaRutas[
          view
        ];


      if (
        !ruta
      ) {
        return;
      }


      setSelectedPromotion(
        null
      );


      setSidebarOpen(
        false
      );


      /*
       * Evitamos una navegación innecesaria
       * si ya estamos exactamente en esa ruta.
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
   * RESERVAR PROMOCIÓN
   * ==========================================================
   */

  const reservarPromocion =
    (promotion) => {

      setSelectedPromotion(
        promotion
      );


      setSidebarOpen(
        false
      );


      if (
        location.pathname !==
        rutas.reserva
      ) {

        navigate(
          rutas.reserva
        );

      }

    };


  /*
   * ==========================================================
   * RESERVAR TURNO
   * ==========================================================
   */

  const reservarTurno =
    () => {

      setSelectedPromotion(
        null
      );


      setSidebarOpen(
        false
      );


      if (
        location.pathname !==
        rutas.reserva
      ) {

        navigate(
          rutas.reserva
        );

      }

    };


  /*
   * ==========================================================
   * FINALIZAR REPROGRAMACIÓN
   * ==========================================================
   */

  const finalizarReprogramacion =
    () => {

      setSelectedPromotion(
        null
      );


      if (
        location.pathname !==
        rutas.reserva
      ) {

        navigate(
          rutas.reserva
        );

      }

    };


  /*
   * ==========================================================
   * TÍTULO DEL HERO
   * ==========================================================
   */

  const heroTitle =
    activeView === 'home'

      ? (

          <span
            className="
              client-welcome-name
            "
          >
            {companyName}
          </span>

        )

      : (

          heroCopy.title ||
          companyName

        );


  /*
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (

    <main
      className="
        role-workspace
        role-workspace-client
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

        accessProfile="client"

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
            (current) =>
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

          backgroundImageSrc={
            welcomeBackgroundUrl ||
            undefined
          }

        />


        <div
          className="
            role-workspace-content
          "
        >

          <WorkspaceHero

            className={`
              ${
                activeView === 'home'
                  ? 'client-welcome-hero'
                  : 'client-reserve-hero'
              }

              ${
                welcomeBackgroundUrl
                  ? 'has-custom-background'
                  : ''
              }

            `.trim()}

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
              heroCopy.description
            }

            identity={

              <WorkspaceProfileIdentity

                user={
                  user
                }

                roleLabel="Cliente"

                photoFallback="🙋"

              />

            }

          >

            {activeView === 'home' &&

              businessHoursText && (

                <p
                  className="
                    client-business-hours-text
                  "
                >
                  {
                    businessHoursText
                  }
                </p>

              )

            }

          </WorkspaceHero>


          <Outlet

            context={{

              selectedPromotion,

              onReservePromotion:
                reservarPromocion,

              onReserveTurn:
                reservarTurno,

              onRescheduleDone:
                finalizarReprogramacion

            }}

          />

        </div>

      </div>

    </main>

  );

}