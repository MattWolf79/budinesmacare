import {
  useEffect,
  useMemo,
  useState
} from 'react';

import {
  matchPath,
  Navigate,
  Outlet,
  useLocation
} from 'react-router-dom';

import {
  Container,
  Box
} from '@mui/material';

import {
  obtenerConfiguracionApp
} from '../api/configuracionApp';

import Navbar
  from '../components/Navbar';

import AdminSidebar
  from '../components/AdminSidebar';

import NewBookingPanel
  from '../components/NewBookingPanel';

import {
  invalidarCacheSucursales
} from '../components/AgendaGrid';

import {
  WorkspaceProfileIdentity
} from '../components/WorkspaceHero';

import {
  obtenerRutasAdministrador
} from '../routes/rutasAplicacion';


const turnosAppLogo =
  '/logo-quieroturnoapp.png';


/*
 * ============================================================
 * LAYOUT ADMINISTRATIVO
 * ============================================================
 *
 * Dashboard es únicamente el layout del portal administrador.
 *
 * Las páginas se renderizan mediante <Outlet />.
 *
 * La navegación pertenece a React Router:
 *
 * - AdminSidebar -> NavLink
 * - RutasAdministrador -> Route
 * - Navigate -> redirecciones declarativas
 *
 * Dashboard conserva solamente el estado compartido
 * y las funciones necesarias para las páginas hijas.
 * ============================================================
 */

export default function Dashboard({

  user,

  accessProfile,

  onChangeProfile,

  onLogout,

  canChangeProfile = false,

  companySlug,

  companyContext,

  onCompanyContextRefresh

}) {

  const location =
    useLocation();


  /*
   * ==========================================================
   * ESTADO DEL SIDEBAR
   * ==========================================================
   */

  const [
    sidebarOpen,
    setSidebarOpen
  ] = useState(false);


  /*
   * ==========================================================
   * NUEVA RESERVA / PEDIDO
   * ==========================================================
   */

  const [
    isNewBookingOpen,
    setIsNewBookingOpen
  ] = useState(false);


  const [
    newBookingInitial,
    setNewBookingInitial
  ] = useState(null);


  /*
   * ==========================================================
   * VERSIÓN DE DATOS ADMINISTRATIVOS
   * ==========================================================
   */

  const [
    adminDataVersion,
    setAdminDataVersion
  ] = useState(0);


  /*
   * ==========================================================
   * PROMOCIONES
   * ==========================================================
   */

  const [
    promotions,
    setPromotions
  ] = useState([]);


  /*
   * ==========================================================
   * REDIRECCIÓN DECLARATIVA
   * ==========================================================
   *
   * Se utiliza solamente cuando una operación finaliza
   * y necesita llevar al administrador a otra ruta.
   *
   * La navegación real la realiza <Navigate />.
   * ==========================================================
   */

  const [
    redirectPath,
    setRedirectPath
  ] = useState(null);


  /*
   * ==========================================================
   * CONFIGURACIÓN OPERATIVA
   * ==========================================================
   */

  const configuracionOperativa =
    companyContext?.configuracion_operativa ||
    {};


  const esModoPedido =
    configuracionOperativa.modo_operacion ===
      'pedido' ||
    configuracionOperativa.usa_agenda ===
      false;


  const preciosHabilitados =
    configuracionOperativa.precios_habilitados !==
    false;


  const promocionesHabilitadas =
    configuracionOperativa.promociones_habilitadas !==
    false;


  const sucursalesHabilitadas =
    configuracionOperativa.sucursales_habilitadas ===
    true;


  const packsHabilitados =
    configuracionOperativa.packs_habilitados ===
    true;


  const bundlesHabilitados =
    packsHabilitados ||
    promocionesHabilitadas;


  /*
   * ==========================================================
   * DATOS DE EMPRESA
   * ==========================================================
   */

  const companyName =
    companyContext?.company_name ||
    companyContext?.name ||
    'QuieroTurnoApp';


  const navbarLogoSrc =
    companyContext?.client_logo_data_url ||
    turnosAppLogo;


  const navbarLogoAlt =
    companyContext?.client_logo_data_url
      ? `${companyName} - Administrador`
      : undefined;


  /*
   * ==========================================================
   * RUTAS ADMINISTRATIVAS
   * ==========================================================
   *
   * obtenerRutasAdministrador() devuelve URLs completas:
   *
   * /empresa/admin
   * /empresa/admin/agenda
   * /empresa/admin/clientes
   *
   * Se utilizan para:
   *
   * - NavLink
   * - matchPath
   * - Navigate
   * ==========================================================
   */

  const rutas =
    useMemo(
      () =>
        obtenerRutasAdministrador(
          companySlug
        ),
      [
        companySlug
      ]
    );


  /*
   * ==========================================================
   * VISTA ACTIVA
   * ==========================================================
   *
   * Esto NO navega.
   *
   * Solamente determina qué elemento del Sidebar debe
   * aparecer como activo según la URL actual.
   * ==========================================================
   */

  const activeView =
    useMemo(
      () => {

        const pathname =
          location.pathname;


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

          return 'clientes';

        }


        if (
          matchPath(
            {
              path:
                rutas.empleados,
              end:
                true
            },
            pathname
          )
        ) {

          return 'empleados';

        }


        if (
          matchPath(
            {
              path:
                rutas.servicios,
              end:
                true
            },
            pathname
          )
        ) {

          return 'servicios';

        }


        if (
          matchPath(
            {
              path:
                rutas.sucursales,
              end:
                true
            },
            pathname
          )
        ) {

          return 'sucursales';

        }


        if (
          matchPath(
            {
              path:
                rutas.configuracion,
              end:
                true
            },
            pathname
          )
        ) {

          return 'configuracion';

        }


        if (
          matchPath(
            {
              path:
                rutas.bundles,
              end:
                true
            },
            pathname
          )
        ) {

          return 'bundles';

        }


        /*
         * En modo pedido, la pantalla de pedidos
         * ocupa visualmente la opción "agenda".
         */

        if (
          matchPath(
            {
              path:
                rutas.pedidos,
              end:
                true
            },
            pathname
          )
        ) {

          return 'agenda';

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


        if (
          matchPath(
            {
              path:
                rutas.pendientes,
              end:
                true
            },
            pathname
          )
        ) {

          return 'pendientes';

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

          return 'cerrarAtencion';

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

          return 'disponibilidad';

        }


        return 'agenda';

      },
      [
        location.pathname,
        rutas
      ]
    );


  /*
   * ==========================================================
   * LIMPIAR REDIRECCIÓN
   * ==========================================================
   */

  useEffect(() => {

    if (
      redirectPath &&
      location.pathname ===
        redirectPath
    ) {

      setRedirectPath(
        null
      );

    }

  }, [
    redirectPath,
    location.pathname
  ]);


  /*
   * ==========================================================
   * CARGAR CONFIGURACIÓN / PROMOCIONES
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


        setPromotions(
          Array.isArray(
            data?.promotions
          )
            ? data.promotions
            : []
        );

      };


    cargarConfiguracion();


    return () => {

      activo =
        false;

    };

  }, [
    companySlug
  ]);


  /*
   * ==========================================================
   * PROMOCIONES DISPONIBLES
   * ==========================================================
   */

  const enabledPromotions =
    useMemo(
      () =>
        promocionesHabilitadas

          ? promotions
              .map(
                (
                  promotion,
                  index
                ) => ({

                  ...promotion,

                  promotionIndex:
                    index,

                  bookingLabel: [

                    promotion?.title ||
                      `Banner ${index + 1}`,

                    promotion?.description,

                    promotion?.value

                  ]
                    .filter(Boolean)
                    .join(' · ')

                })
              )

              .filter(
                promotion =>

                  promotion?.enabled !==
                    false &&

                  (
                    preciosHabilitados

                      ? (
                          promotion?.title ||
                          promotion?.description ||
                          promotion?.value ||
                          promotion?.imageDataUrl
                        )

                      : promotion?.imageDataUrl
                  )
              )

          : [],

      [
        promocionesHabilitadas,
        preciosHabilitados,
        promotions
      ]
    );


  /*
   * ==========================================================
   * CAMBIOS ADMINISTRATIVOS
   * ==========================================================
   */

  const notifyAdminDataChanged =
    () => {

      setAdminDataVersion(
        current =>
          current + 1
      );

    };


  /*
   * ==========================================================
   * CAMBIOS DE SUCURSALES
   * ==========================================================
   */

  const notifyBranchesChanged =
    () => {

      invalidarCacheSucursales();


      setAdminDataVersion(
        current =>
          current + 1
      );


      onCompanyContextRefresh?.();

    };


  /*
   * ==========================================================
   * MENÚ ADMINISTRATIVO
   * ==========================================================
   *
   * Los elementos que tienen "path" son navegados por
   * AdminSidebar mediante NavLink.
   *
   * "new-booking" no tiene path porque abre un panel.
   * ==========================================================
   */

  const adminNavGroups =
    useMemo(
      () => {

        const gestion =
          esModoPedido

            ? [

                {
                  id:
                    'new-booking',

                  label:
                    'Nuevo pedido',

                  icon:
                    '➕'

                },

                {
                  id:
                    'agenda',

                  label:
                    'Pedidos',

                  icon:
                    '📋',

                  path:
                    rutas.agenda

                },

                ...(preciosHabilitados

                  ? [

                      {

                        id:
                          'cerrarAtencion',

                        label:
                          'Cerrar pedido',

                        icon:
                          '💳',

                        path:
                          rutas.cerrarAtencion

                      }

                    ]

                  : []),

                {

                  id:
                    'clientes',

                  label:
                    'Clientes',

                  icon:
                    '🙋',

                  path:
                    rutas.clientes

                },

                {

                  id:
                    'empleados',

                  label:
                    'Empleados',

                  icon:
                    '👥',

                  path:
                    rutas.empleados

                }

              ]

            : [

                {

                  id:
                    'new-booking',

                  label:
                    'Nueva reserva',

                  icon:
                    '➕'

                },

                {

                  id:
                    'agenda',

                  label:
                    'Calendario',

                  icon:
                    '📅',

                  path:
                    rutas.agenda

                },

                {

                  id:
                    'cerrarAtencion',

                  label:
                    'Cerrar atención',

                  icon:
                    '💳',

                  path:
                    rutas.cerrarAtencion

                },

                {

                  id:
                    'pendientes',

                  label:
                    'Pendientes de asignar',

                  icon:
                    '📌',

                  path:
                    rutas.pendientes

                },

                {

                  id:
                    'clientes',

                  label:
                    'Clientes',

                  icon:
                    '🙋',

                  path:
                    rutas.clientes

                },

                {

                  id:
                    'empleados',

                  label:
                    'Empleados',

                  icon:
                    '👥',

                  path:
                    rutas.empleados

                },

                {

                  id:
                    'disponibilidad',

                  label:
                    'Disponibilidad',

                  icon:
                    '🕒',

                  path:
                    rutas.disponibilidad

                }

              ];


        if (
          sucursalesHabilitadas
        ) {

          gestion.push({

            id:
              'sucursales',

            label:
              'Sucursales',

            icon:
              '🏢',

            path:
              rutas.sucursales

          });

        }


        if (
          bundlesHabilitados
        ) {

          gestion.push({

            id:
              'bundles',

            label:
              'Packs y promos',

            icon:
              '🎁',

            path:
              rutas.bundles

          });

        }


        return [

          {

            label:
              'GESTIÓN',

            items:
              gestion

          },

          {

            label:
              'CONFIGURACIÓN',

            items: [

              {

                id:
                  'servicios',

                label:
                  esModoPedido
                    ? 'Productos'
                    : 'Servicios',

                icon:
                  '✨',

                path:
                  rutas.servicios

              },

              {

                id:
                  'configuracion',

                label:
                  'Configuración del negocio',

                icon:
                  '⚙',

                path:
                  rutas.configuracion

              }

            ]

          }

        ];

      },

      [

        sucursalesHabilitadas,

        bundlesHabilitados,

        esModoPedido,

        preciosHabilitados,

        rutas

      ]

    );


  /*
   * ==========================================================
   * IDENTIDAD DEL ADMINISTRADOR
   * ==========================================================
   */

  const adminProfileSummary = (

    <WorkspaceProfileIdentity

      user={
        user
      }

      roleLabel="Administrador"

    />

  );


  /*
   * ==========================================================
   * CONTEXTO DEL OUTLET
   * ==========================================================
   */

  const adminRouteContext = {

    companySlug,

    user,

    companyContext,

    adminProfileSummary,

    refreshKey:
      adminDataVersion,

    promotions:
      enabledPromotions,

    esModoPedido,

    preciosHabilitados,

    sucursalesHabilitadas,

    bundlesHabilitados,

    packsHabilitados,

    promocionesHabilitadas,

    onRequestNewBooking:
      (options = null) => {

        setNewBookingInitial(
          options
        );

        setIsNewBookingOpen(
          true
        );

      },

    onDataChanged:
      notifyAdminDataChanged,

    onBranchesChanged:
      notifyBranchesChanged,

    onBookingsChanged:
      notifyAdminDataChanged,

    onCloseAttentionPageClose:
      () => {

        setAdminDataVersion(
          current =>
            current + 1
        );


        setRedirectPath(
          rutas.agenda
        );

      },

    onCompanyContextRefresh

  };


  /*
   * ==========================================================
   * REDIRECCIÓN DECLARATIVA
   * ==========================================================
   */

  if (
    redirectPath &&
    location.pathname !==
      redirectPath
  ) {

    return (

      <Navigate

        to={
          redirectPath
        }

        replace

      />

    );

  }


  /*
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (

    <>

      <Container

        maxWidth={false}

        disableGutters

        className="
          dashboard-shell
          has-admin-sidebar
        "

      >

        <Navbar

          user={
            user
          }

          activeView={
            activeView
          }

          accessProfile={
            accessProfile
          }

          showNavigation={
            false
          }

          showAdminNavigation={
            false
          }

          onChangeProfile={
            onChangeProfile
          }

          onLogout={
            onLogout
          }

          showMenuToggle={
            accessProfile ===
            'admin'
          }

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
            navbarLogoSrc
          }

          logoAlt={
            navbarLogoAlt
          }

          companyName={
            companyName
          }

        />


        <div
          className="
            dashboard-body
          "
        >

          {accessProfile ===
            'admin' && (

            <AdminSidebar

              groups={
                adminNavGroups
              }

              activeView={
                activeView
              }

              onViewChange={(
                view
              ) => {

                if (
                  view !==
                  'new-booking'
                ) {

                  return;

                }


                setNewBookingInitial(
                  null
                );


                setIsNewBookingOpen(
                  true
                );


                setSidebarOpen(
                  false
                );

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
                navbarLogoSrc
              }

            />

          )}


          <Box
            className="
              dashboard-content
            "
          >

            <Outlet
              context={
                adminRouteContext
              }
            />

          </Box>

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

            onClose={() =>
              setIsNewBookingOpen(
                false
              )
            }

            onBookingCreated={() => {

              setAdminDataVersion(
                current =>
                  current + 1
              );


              setIsNewBookingOpen(
                false
              );


              setRedirectPath(
                rutas.agenda
              );

            }}

          />

        )}

      </Container>

    </>

  );

}