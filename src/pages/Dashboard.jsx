import {
  useEffect,
  useMemo,
  useState
} from 'react';

import {
  matchPath,
  Navigate,
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

import RutasAdministrador
  from '../routes/RutasAdministrador';

import AdminLayout
  from '../layouts/AdminLayout';

import {
  obtenerRutasAdministrador
} from '../routes/rutasAplicacion';


const turnosAppLogo =
  '/logo-quieroturnoapp.png';


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
    adminDataVersion,
    setAdminDataVersion
  ] = useState(0);


  const [
    promotions,
    setPromotions
  ] = useState([]);


  /*
   * Redirección declarativa.
   *
   * Dashboard NO utiliza navigate().
   *
   * Esta variable solamente se utiliza para
   * operaciones que terminan y necesitan
   * llevar al usuario a otra página:
   *
   * - creación de reserva/pedido
   * - cierre de atención
   *
   * La navegación real la realiza React Router
   * mediante <Navigate />.
   */

  const [
    redirectPath,
    setRedirectPath
  ] = useState(null);


  /*
   * Configuración operativa.
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
   * Datos de empresa.
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
   * Rutas administrativas.
   *
   * Estas rutas son la única fuente
   * utilizada por los componentes de
   * navegación administrativa.
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
   * Vista activa.
   *
   * Esto NO navega.
   *
   * Solamente determina qué opción debe
   * mostrarse activa cuando estamos dentro
   * del Dashboard administrativo.
   *
   * La navegación real la hacen:
   *
   * - AdminSidebar -> NavLink
   * - React Router
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
         * En modo pedido la página de pedidos
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
   * Limpia la redirección declarativa
   * cuando React Router ya llegó a
   * la URL solicitada.
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
   * Cargar promociones.
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
   * Promociones disponibles.
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
   * Cambios administrativos.
   */

  const notifyAdminDataChanged =
    () => {

      setAdminDataVersion(
        current =>
          current + 1
      );

    };


  /*
   * Cambios de sucursales.
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
   * Menú administrativo.
   *
   * Las páginas tienen path.
   *
   * AdminSidebar utiliza NavLink
   * directamente para esos elementos.
   *
   * El único elemento sin path es
   * new-booking, porque abre un panel.
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


  const adminProfileSummary = (

    <WorkspaceProfileIdentity

      user={
        user
      }

      roleLabel="
        Administrador
      "

    />

  );


  /*
   * Navegación declarativa.
   *
   * Dashboard no utiliza navigate().
   *
   * Si una operación terminó y necesita
   * llevar al usuario a Agenda, se establece
   * redirectPath y el <Navigate /> de abajo
   * realiza la navegación.
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


  return (

    <AdminLayout>

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

          /*
           * La navegación administrativa
           * pertenece a AdminSidebar.
           *
           * Navbar queda únicamente con
           * funciones de sesión/perfil.
           */

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

              /*
               * Este callback solamente maneja
               * acciones que NO son rutas.
               *
               * Actualmente:
               * new-booking.
               *
               * Los demás elementos son NavLink
               * y no pasan por este callback.
               */

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

            <RutasAdministrador

              companySlug={
                companySlug
              }

              user={
                user
              }

              companyContext={
                companyContext
              }

              adminProfileSummary={
                adminProfileSummary
              }

              refreshKey={
                adminDataVersion
              }

              promotions={
                enabledPromotions
              }

              esModoPedido={
                esModoPedido
              }

              preciosHabilitados={
                preciosHabilitados
              }

              sucursalesHabilitadas={
                sucursalesHabilitadas
              }

              bundlesHabilitados={
                bundlesHabilitados
              }

              packsHabilitados={
                packsHabilitados
              }

              promocionesHabilitadas={
                promocionesHabilitadas
              }

              onRequestNewBooking={(
                options = null
              ) => {

                setNewBookingInitial(
                  options
                );


                setIsNewBookingOpen(
                  true
                );

              }}

              onDataChanged={
                notifyAdminDataChanged
              }

              onBranchesChanged={
                notifyBranchesChanged
              }

              onBookingsChanged={
                notifyAdminDataChanged
              }

              /*
               * Cerrar atención termina una
               * operación y vuelve a Agenda.
               *
               * Sigue siendo navegación
               * declarativa.
               */

              onCloseAttentionPageClose={() => {

                setAdminDataVersion(
                  current =>
                    current + 1
                );


                setRedirectPath(
                  rutas.agenda
                );

              }}

              onCompanyContextRefresh={
                onCompanyContextRefresh
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

    </AdminLayout>

  );

}
