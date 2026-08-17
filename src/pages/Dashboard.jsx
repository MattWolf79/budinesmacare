import {
  useEffect,
  useMemo,
  useState
} from 'react';

import {
  matchPath,
  useLocation,
  useNavigate
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
    adminDataVersion,
    setAdminDataVersion
  ] = useState(0);


  const [
    promotions,
    setPromotions
  ] = useState([]);


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
   * Generamos las rutas administrativas
   * una sola vez por empresa.
   *
   * Estas rutas son las que utiliza
   * React Router realmente.
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
   * Vista activa del menú.
   *
   * IMPORTANTE:
   *
   * Ya no analizamos manualmente
   * location.pathname con endsWith().
   *
   * Usamos matchPath de React Router.
   *
   * Esto hace que la URL sea la fuente
   * real de la navegación.
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
              end: true
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
              end: true
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
              end: true
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
              end: true
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
              end: true
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
              end: true
            },
            pathname
          )
        ) {
          return 'bundles';
        }


        /*
         * Pedidos utiliza la misma opción
         * visual "agenda".
         */

        if (
          matchPath(
            {
              path:
                rutas.pedidos,
              end: true
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
              end: true
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
              end: true
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
              end: true
            },
            pathname
          )
        ) {
          return 'disponibilidad';
        }


        /*
         * Agenda es el estado visual
         * predeterminado.
         */

        return 'agenda';

      },
      [
        location.pathname,
        rutas
      ]
    );


  /*
   * Cargar promociones.
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
      activo = false;
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
                (
                  promotion
                ) =>
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
   * Navegación administrativa.
   *
   * Toda navegación pasa por navigate().
   *
   * Nunca usamos window.location.
   * Nunca usamos window.history.
   */

  const navegarA =
    (view) => {

      /*
       * Nuevo turno / pedido:
       * abre panel, no cambia URL.
       */

      if (
        view ===
        'new-booking'
      ) {

        setNewBookingInitial(
          null
        );

        setIsNewBookingOpen(
          true
        );

        setSidebarOpen(
          false
        );

        return;
      }


      const ruta =
        {
          agenda:
            rutas.agenda,

          clientes:
            rutas.clientes,

          empleados:
            rutas.empleados,

          servicios:
            rutas.servicios,

          sucursales:
            rutas.sucursales,

          bundles:
            rutas.bundles,

          configuracion:
            rutas.configuracion,

          pedidos:
            rutas.pedidos,

          pendientes:
            rutas.pendientes,

          cerrarAtencion:
            rutas.cerrarAtencion,

          disponibilidad:
            rutas.disponibilidad

        }[view];


      if (!ruta) {
        return;
      }


      /*
       * Al volver a agenda queremos que
       * los componentes puedan refrescar.
       */

      if (
        view ===
        'agenda'
      ) {

        setAdminDataVersion(
          current =>
            current + 1
        );
      }


      setSidebarOpen(
        false
      );


      /*
       * Evitamos navegación innecesaria.
       */

      if (
        location.pathname !==
        ruta
      ) {

        navigate(
          ruta
        );
      }
    };


  /*
   * Menú administrativo.
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
                    '📋'
                },

                ...(preciosHabilitados
                  ? [
                      {
                        id:
                          'cerrarAtencion',

                        label:
                          'Cerrar pedido',

                        icon:
                          '💳'
                      }
                    ]
                  : []),

                {
                  id:
                    'clientes',

                  label:
                    'Clientes',

                  icon:
                    '🙋'
                },

                {
                  id:
                    'empleados',

                  label:
                    'Empleados',

                  icon:
                    '👥'
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
                    '📅'
                },

                {
                  id:
                    'cerrarAtencion',

                  label:
                    'Cerrar atención',

                  icon:
                    '💳'
                },

                {
                  id:
                    'pendientes',

                  label:
                    'Pendientes de asignar',

                  icon:
                    '📌'
                },

                {
                  id:
                    'clientes',

                  label:
                    'Clientes',

                  icon:
                    '🙋'
                },

                {
                  id:
                    'empleados',

                  label:
                    'Empleados',

                  icon:
                    '👥'
                },

                {
                  id:
                    'disponibilidad',

                  label:
                    'Disponibilidad',

                  icon:
                    '🕒'
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
              '🏢'
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
              '🎁'
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
                  '✨'
              },

              {
                id:
                  'configuracion',

                label:
                  'Configuración del negocio',

                icon:
                  '⚙'
              }

            ]
          }
        ];

      },

      [
        sucursalesHabilitadas,
        bundlesHabilitados,
        esModoPedido,
        preciosHabilitados
      ]
    );


  const adminProfileSummary = (
    <WorkspaceProfileIdentity
      user={user}
      roleLabel="Administrador"
    />
  );


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

          onViewChange={
            navegarA
          }

          onChangeProfile={
            onChangeProfile
          }

          onLogout={
            onLogout
          }

          showAdminNavigation={
            false
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

          showProfileBadge

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

              onCloseAttentionPageClose={() =>
                navegarA(
                  'agenda'
                )
              }

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

              navegarA(
                'agenda'
              );

            }}

          />

        )}

      </Container>
    </AdminLayout>
  );
}