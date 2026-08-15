import { useEffect, useMemo, useState } from "react";
import { useNavigate } from 'react-router-dom';
import { Container, Box } from "@mui/material";
import { supabase } from "../api/supabaseClient";
import { obtenerConfiguracionApp } from "../api/configuracionApp";
import Navbar from "../components/Navbar";
import AdminSidebar from "../components/AdminSidebar";
import { invalidarCacheSucursales } from "../components/AgendaGrid";
import AdminPanel from "../components/AdminPanel";
import ClientsPage from "./admin/ClientsPage";
import BranchesPage from "./admin/BranchesPage";
import BundlesPage from "./admin/BundlesPage";
import SettingsPage from "./admin/SettingsPage";
import EmployeesPage from "./admin/EmployeesPage";
import ServicesPage from "./admin/ServicesPage";
import NewBookingPanel from "../components/NewBookingPanel";
import { WorkspaceProfileIdentity } from "../components/WorkspaceHero";


import AgendaPage from './admin/AgendaPage';
import PedidosPage from './admin/PedidosPage';
import PendientesPage from './admin/PendientesPage';
import CerrarAtencionPage from './admin/CerrarAtencionPage';
import DisponibilidadPage from './admin/DisponibilidadPage';
import { rutasAdministrador } from '../routes/rutasAplicacion';

const turnosAppLogo = '/logo-quieroturnoapp.png';

const getAdminViewFromLocation = () => {

  const hash = window.location.hash.replace(/^#/, '');

  const pathname =
    window.location.pathname.toLowerCase();

  if (pathname.endsWith('/clientes'))
    return 'clients';

  if (pathname.endsWith('/empleados'))
    return 'employees';

  if (pathname.endsWith('/servicios'))
    return 'services';

  if (pathname.endsWith('/sucursales'))
    return 'sucursales';

  if (pathname.endsWith('/configuracion'))
    return 'settings';

  if (pathname.endsWith('/bundles'))
    return 'bundles';

  if (pathname.endsWith('/pedidos'))
    return 'agenda';

  if (pathname.endsWith('/pendientes'))
    return 'pending';

  if (pathname.endsWith('/cerrar-atencion'))
    return 'close-attention';

  if (pathname.endsWith('/disponibilidad'))
    return 'availability';

  if (hash === 'admin-agenda')
    return 'agenda';

  if (hash === 'admin-close-attention')
    return 'close-attention';

  if (
    hash === 'assign-booking' ||
    hash === 'admin-pending'
  )
    return 'pending';

  if (hash === 'admin-employees')
    return 'employees';

  if (hash === 'admin-branches')
    return 'sucursales';

  if (hash === 'admin-bundles')
    return 'bundles';

  if (hash === 'admin-clients')
    return 'clients';

  if (hash === 'admin-services')
    return 'services';

  if (hash === 'admin-settings')
    return 'settings';

  if (hash === 'admin-availability')
    return 'availability';

  return 'agenda';
};

const adminBottomNavItems = [
  { id: 'agenda', label: 'Agenda', icon: '📅' },
  { id: 'availability', label: 'Disponibilidad', icon: '🕒' },
  { id: 'employees', label: 'Empleados', icon: '👥' }
];

function AdminBottomNav({ activeView, onViewChange }) {
  return (
    <nav className="admin-bottom-nav" aria-label="Secciones administrador">
      {adminBottomNavItems.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`admin-bottom-nav-button ${activeView === item.id ? 'is-active' : ''}`}
          onClick={() => onViewChange(item.id)}
        >
          <span className="admin-bottom-nav-icon" aria-hidden="true">{item.icon}</span>
          <span className="admin-bottom-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default function Dashboard({ user, accessProfile, onChangeProfile, onLogout, canChangeProfile = false, companySlug, companyContext, onCompanyContextRefresh }) {

  const [activeView, setActiveView] = useState(getAdminViewFromLocation);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);
  const [newBookingInitial, setNewBookingInitial] = useState(null);
  const [adminDataVersion, setAdminDataVersion] = useState(0);
  const [promotions, setPromotions] = useState([]);
  const configuracionOperativa = companyContext?.configuracion_operativa || {};
  const esModoPedido = configuracionOperativa.modo_operacion === 'pedido' || configuracionOperativa.usa_agenda === false;
  const preciosHabilitados = configuracionOperativa.precios_habilitados !== false;
  const promocionesHabilitadas = configuracionOperativa.promociones_habilitadas !== false;
  const sucursalesHabilitadas = configuracionOperativa.sucursales_habilitadas === true;
  const packsHabilitados = configuracionOperativa.packs_habilitados === true;
  const bundlesHabilitados = packsHabilitados || promocionesHabilitadas;
  const companyName = companyContext?.company_name || companyContext?.name || 'QuieroTurnoApp';
  const navbarLogoSrc = companyContext?.client_logo_data_url || turnosAppLogo;
  const navbarLogoAlt = companyContext?.client_logo_data_url ? `${companyName} - Administrador` : undefined;

  
  useEffect(() => {
    const applyHashView = () => {
      setActiveView(getAdminViewFromLocation());
      setAdminDataVersion((current) => current + 1);
    };

    applyHashView();
    window.addEventListener('hashchange', applyHashView);

    return () => {
      window.removeEventListener('hashchange', applyHashView);
    };
  }, []);

  useEffect(() => {
    // Al abrir el panel admin, refrescamos la configuración (fracción de grilla, flags)
    // para no depender del valor cacheado desde el login.
    onCompanyContextRefresh?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;

    const loadConfiguration = async () => {
      const { data, error } = await obtenerConfiguracionApp(companySlug);

      if (!active || error) return;

      setPromotions(Array.isArray(data?.promotions) ? data.promotions : []);
    };

    loadConfiguration();

    return () => {
      active = false;
    };
  }, [companySlug]);

  useEffect(() => {
    if (!esModoPedido) return;
    if (['pending', 'availability'].includes(activeView)) {
      setActiveView('agenda');
    }
  }, [activeView, esModoPedido]);

  const enabledPromotions = useMemo(() => (
    promocionesHabilitadas
      ? promotions
        .map((promotion, index) => ({ ...promotion, promotionIndex: index, bookingLabel: [promotion?.title || `Banner ${index + 1}`, promotion?.description, promotion?.value].filter(Boolean).join(' · ') }))
        .filter((promotion) => promotion?.enabled !== false && (preciosHabilitados ? (promotion?.title || promotion?.description || promotion?.value || promotion?.imageDataUrl) : promotion?.imageDataUrl))
      : []
  ), [promocionesHabilitadas, preciosHabilitados, promotions]);

  const notifyAdminDataChanged = () => {
    setAdminDataVersion((current) => current + 1);
  };

  const notifyBranchesChanged = () => {
    invalidarCacheSucursales();
    setAdminDataVersion((current) => current + 1);
    onCompanyContextRefresh?.();
  };
const actualizarHashVista = (view) => {

  const mapa = {
    agenda: '#admin-agenda',
    'close-attention': '#admin-close-attention',
    pending: '#admin-pending',
    employees: '#admin-employees',
    sucursales: '#admin-branches',
    bundles: '#admin-bundles',
    clients: '#admin-clients',
    services: '#admin-services',
    settings: '#admin-settings',
    availability: '#admin-availability'
  };

  const nuevoHash = mapa[view];

  if (!nuevoHash) return;

  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${nuevoHash}`
  );
  if (mapaRutasAdministrador[view]) {

  

}
};

 const changeView = (view) => {

  if (view === 'new-booking') {
    setNewBookingInitial(null);
    setIsNewBookingOpen(true);
    setSidebarOpen(false);
    return;
  }

  if (view === 'agenda') {
    setAdminDataVersion((current) => current + 1);
  }

  actualizarHashVista(view);
  if (mapaRutasAdministrador[view]) {

  

}
  setActiveView(view);
  setSidebarOpen(false);


};

  const adminNavGroups = useMemo(() => {
    const gestion = esModoPedido
      ? [
          { id: 'new-booking', label: 'Nuevo pedido', icon: '➕' },
          { id: 'agenda', label: 'Pedidos', icon: '📋' },
          ...(preciosHabilitados ? [{ id: 'close-attention', label: 'Cerrar pedido', icon: '💳' }] : []),
          { id: 'clients', label: 'Clientes', icon: '🙋' },
          { id: 'employees', label: 'Empleados', icon: '👥' }
        ]
      : [
          { id: 'new-booking', label: 'Nueva reserva', icon: '➕' },
          { id: 'agenda', label: 'Calendario', icon: '📅' },
          { id: 'close-attention', label: 'Cerrar atención', icon: '💳' },
          { id: 'pending', label: 'Pendientes de asignar', icon: '📌' },
          { id: 'clients', label: 'Clientes', icon: '🙋' },
          { id: 'employees', label: 'Empleados', icon: '👥' },
          { id: 'availability', label: 'Disponibilidad', icon: '🕒' }
        ];

    if (sucursalesHabilitadas) {
      gestion.push({ id: 'sucursales', label: 'Sucursales', icon: '🏢' });
    }

    if (bundlesHabilitados) {
      gestion.push({ id: 'bundles', label: 'Packs y promos', icon: '🎁' });
    }

    return [
      { label: 'GESTIÓN', items: gestion },
      {
        label: 'CONFIGURACIÓN',
        items: [
          { id: 'services', label: esModoPedido ? 'Productos' : 'Servicios', icon: '✨' },
          { id: 'settings', label: 'Configuración del negocio', icon: '⚙' }
        ]
      }
    ];
  }, [sucursalesHabilitadas, bundlesHabilitados, esModoPedido, preciosHabilitados]);

  const mapaRutasAdministrador = {
  agenda: rutasAdministrador.agenda,
  clients: rutasAdministrador.clientes,
  employees: rutasAdministrador.empleados,
  services: rutasAdministrador.servicios,
  settings: rutasAdministrador.configuracion,
  sucursales: rutasAdministrador.sucursales,
  bundles: rutasAdministrador.bundles,
  pending: rutasAdministrador.pendientes,
  'close-attention': rutasAdministrador.cerrarAtencion,
  availability: rutasAdministrador.disponibilidad
};

  const adminProfileSummary = (
    <WorkspaceProfileIdentity user={user} roleLabel="Administrador" />
  );
  const usarPortalAdministrador = false;
  return (
    <Container maxWidth={false} disableGutters className="dashboard-shell has-admin-sidebar">
      <Navbar
        user={user}
        activeView={activeView}
        accessProfile={accessProfile}
        onViewChange={changeView}
        onChangeProfile={onChangeProfile}
        onLogout={onLogout}
        showAdminNavigation={false}
        showMenuToggle={accessProfile === 'admin'}
        onMenuToggle={() => setSidebarOpen((current) => !current)}
        showProfileBadge
        canChangeProfile={canChangeProfile}
        logoSrc={navbarLogoSrc}
        logoAlt={navbarLogoAlt}
        companyName={companyName}
      />

      <div className="dashboard-body">
        {accessProfile === 'admin' && (
          <AdminSidebar
            groups={adminNavGroups}
            activeView={activeView}
            onViewChange={changeView}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            companyName={companyName}
            logoSrc={navbarLogoSrc}
          />
        )}

        <Box className="dashboard-content">
          {activeView === 'agenda' && !esModoPedido && (
            <div className="agenda-responsive-shell">
              <AgendaPage
  key="agenda"
  user={user}
  refreshKey={adminDataVersion}
  promotions={enabledPromotions}
  adminProfileSummary={adminProfileSummary}
  companySlug={companySlug}
  companyContext={companyContext}
  onRequestNewBooking={(options) => {
    setNewBookingInitial(options);
    setIsNewBookingOpen(true);
  }}
/>
            </div>
          )}
          {activeView === 'agenda' && esModoPedido && (
            <PedidosPage
  key={`pedidos-${adminDataVersion}`}
  user={user}
  companySlug={companySlug}
  adminProfileSummary={adminProfileSummary}
/>
          )}
          {activeView === 'close-attention' && preciosHabilitados && (
            <div className="agenda-responsive-shell close-attention-responsive-shell">
              <CerrarAtencionPage
  key="close-attention"
  user={user}
  refreshKey={adminDataVersion}
  promotions={enabledPromotions}
  adminProfileSummary={adminProfileSummary}
  companySlug={companySlug}
  companyContext={companyContext}
  onCloseAttentionPageClose={() => changeView('agenda')}
  onBookingsChanged={notifyAdminDataChanged}
/>
            </div>
          )}
          {activeView === 'pending' && !esModoPedido && (
            <div className="agenda-responsive-shell">
              <PendientesPage
  key="pending"
  user={user}
  refreshKey={adminDataVersion}
  promotions={enabledPromotions}
  adminProfileSummary={adminProfileSummary}
  companySlug={companySlug}
  companyContext={companyContext}
/>
            </div>
          )}
          {activeView === 'clients' && (
  <ClientsPage
    user={user}
    onDataChanged={notifyAdminDataChanged}
    adminProfileSummary={adminProfileSummary}
    companySlug={companySlug}
    companyContext={companyContext}
  />
)}
{activeView === 'employees' && (
  <EmployeesPage
    user={user}
    onDataChanged={notifyAdminDataChanged}
    adminProfileSummary={adminProfileSummary}
    companySlug={companySlug}
    companyContext={companyContext}
  />
)}
{activeView === 'services' && (
  <ServicesPage
    user={user}
    onDataChanged={notifyAdminDataChanged}
    adminProfileSummary={adminProfileSummary}
    companySlug={companySlug}
    companyContext={companyContext}
  />
)}
          {activeView === 'availability' && !esModoPedido && <DisponibilidadPage
  user={user}
  mode="admin"
  onAvailabilityChanged={notifyAdminDataChanged}
  adminProfileSummary={adminProfileSummary}
  companySlug={companySlug}
  companyContext={companyContext}
/>
}
          {activeView === 'sucursales' && sucursalesHabilitadas && (
  <BranchesPage
    user={user}
    onDataChanged={notifyBranchesChanged}
    adminProfileSummary={adminProfileSummary}
    companySlug={companySlug}
    companyContext={companyContext}
  />
)}
          {activeView === 'bundles' && bundlesHabilitados && (
  <BundlesPage
    user={user}
    onDataChanged={notifyBranchesChanged}
    adminProfileSummary={adminProfileSummary}
    companySlug={companySlug}
    packsHabilitados={packsHabilitados}
    promosHabilitadas={promocionesHabilitadas}
  />
)}

{activeView === 'settings' && (
  <SettingsPage
    user={user}
    adminProfileSummary={adminProfileSummary}
    companySlug={companySlug}
    companyContext={companyContext}
    onCompanyContextRefresh={onCompanyContextRefresh}
  />
)}


          </Box>
      </div>

      {isNewBookingOpen && (
        <NewBookingPanel
          user={user}
          companySlug={companySlug}
          companyContext={companyContext}
          initialDate={newBookingInitial?.date || null}
          initialStartTime={newBookingInitial?.startTime || null}
          branchId={newBookingInitial?.branchId || null}
          onClose={() => setIsNewBookingOpen(false)}
          onBookingCreated={() => {
            setAdminDataVersion((current) => current + 1);
            changeView('agenda');
          }}
        />
      )}
    </Container>
  );
}
