import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Container, Box } from '@mui/material';

import { obtenerConfiguracionApp } from '../../api/configuracionApp';

import Navbar from '../../components/Navbar';
import AdminSidebar from '../../components/AdminSidebar';
import NewBookingPanel from '../../components/NewBookingPanel';
import { invalidarCacheSucursales } from '../../components/AgendaGrid';
import { WorkspaceProfileIdentity } from '../../components/WorkspaceHero';

import RutasAdministrador from '../../routes/RutasAdministrador';
import AdminLayout from '../../layouts/AdminLayout';
import { obtenerRutasAdministrador } from '../../routes/rutasAplicacion';

const turnosAppLogo =
  '/logo-quieroturnoapp.png';

const obtenerVistaAdministrador = (
  pathname
) => {
  const path =
    String(pathname || '').toLowerCase();

  if (path.endsWith('/clientes')) {
    return 'clientes';
  }

  if (path.endsWith('/empleados')) {
    return 'empleados';
  }

  if (path.endsWith('/servicios')) {
    return 'servicios';
  }

  if (path.endsWith('/sucursales')) {
    return 'sucursales';
  }

  if (path.endsWith('/configuracion')) {
    return 'configuracion';
  }

  if (path.endsWith('/bundles')) {
    return 'bundles';
  }

  if (path.endsWith('/pedidos')) {
    return 'agenda';
  }

  if (path.endsWith('/pendientes')) {
    return 'pendientes';
  }

  if (path.endsWith('/cerrar-atencion')) {
    return 'cerrarAtencion';
  }

  if (path.endsWith('/disponibilidad')) {
    return 'disponibilidad';
  }

  return 'agenda';
};

export default function AdministradorPage({
  user,
  accessProfile,
  onChangeProfile,
  onLogout,
  canChangeProfile = false,
  companySlug,
  companyContext,
  onCompanyContextRefresh
}) {
  const location = useLocation();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] =
    useState(false);

  const [isNewBookingOpen, setIsNewBookingOpen] =
    useState(false);

  const [newBookingInitial, setNewBookingInitial] =
    useState(null);

  const [adminDataVersion, setAdminDataVersion] =
    useState(0);

  const [promotions, setPromotions] =
    useState([]);

  const configuracionOperativa =
    companyContext?.configuracion_operativa ||
    {};

  const esModoPedido =
    configuracionOperativa.modo_operacion ===
      'pedido' ||
    configuracionOperativa.usa_agenda === false;

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

  const activeView =
    obtenerVistaAdministrador(
      location.pathname
    );

  const rutas = useMemo(
    () =>
      obtenerRutasAdministrador(
        companySlug
      ),
    [companySlug]
  );

  /*
   * Carga de promociones/configuración.
   *
   * IMPORTANTE:
   * No refrescamos companyContext al montar
   * el administrador.
   *
   * Esto evita el loop que teníamos
   * anteriormente.
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

        if (!activo || error) {
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
  }, [companySlug]);

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
                      `Banner ${
                        index + 1
                      }`,

                    promotion?.description,

                    promotion?.value
                  ]
                    .filter(Boolean)
                    .join(' · ')
                })
              )
              .filter(
                (promotion) =>
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

  const notifyAdminDataChanged =
    () => {
      setAdminDataVersion(
        (current) =>
          current + 1
      );
    };

  const notifyBranchesChanged =
    () => {
      invalidarCacheSucursales();

      setAdminDataVersion(
        (current) =>
          current + 1
      );

      onCompanyContextRefresh?.();
    };

  /*
   * Toda la navegación administrativa
   * pasa por react-router-dom.
   */
  const navegarA = (
    view
  ) => {
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

    const ruta = {
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

    if (
      view ===
      'agenda'
    ) {
      setAdminDataVersion(
        (current) =>
          current + 1
      );
    }

    setSidebarOpen(
      false
    );

    navigate(ruta);
  };

  const adminNavGroups =
    useMemo(() => {
      const gestion =
        esModoPedido
          ? [
              {
                id:
                  'new-booking',
                label:
                  'Nuevo pedido',
                icon: '➕'
              },

              {
                id:
                  'agenda',
                label:
                  'Pedidos',
                icon: '📋'
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
                icon: '🙋'
              },

              {
                id:
                  'empleados',
                label:
                  'Empleados',
                icon: '👥'
              }
            ]
          : [
              {
                id:
                  'new-booking',
                label:
                  'Nueva reserva',
                icon: '➕'
              },

              {
                id:
                  'agenda',
                label:
                  'Calendario',
                icon: '📅'
              },

              {
                id:
                  'cerrarAtencion',
                label:
                  'Cerrar atención',
                icon: '💳'
              },

              {
                id:
                  'pendientes',
                label:
                  'Pendientes de asignar',
                icon: '📌'
              },

              {
                id:
                  'clientes',
                label:
                  'Clientes',
                icon: '🙋'
              },

              {
                id:
                  'empleados',
                label:
                  'Empleados',
                icon: '👥'
              },

              {
                id:
                  'disponibilidad',
                label:
                  'Disponibilidad',
                icon: '🕒'
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
    }, [
      sucursalesHabilitadas,
      bundlesHabilitados,
      esModoPedido,
      preciosHabilitados
    ]);

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
        className="dashboard-shell has-admin-sidebar"
      >
        <Navbar
          user={user}
          activeView={activeView}
          accessProfile={accessProfile}
          onViewChange={
            navegarA
          }
          onChangeProfile={
            onChangeProfile
          }
          onLogout={onLogout}
          showAdminNavigation={
            false
          }
          showMenuToggle={
            accessProfile ===
            'admin'
          }
          onMenuToggle={() =>
            setSidebarOpen(
              (current) =>
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

        <div className="dashboard-body">
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

          <Box className="dashboard-content">
            <RutasAdministrador
              companySlug={
                companySlug
              }
              user={user}
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
            user={user}
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
                (current) =>
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