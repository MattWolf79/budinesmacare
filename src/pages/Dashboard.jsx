import { useEffect, useMemo, useState } from "react";
import { Container, Box } from "@mui/material";
import { supabase } from "../api/supabaseClient";
import Navbar from "../components/Navbar";
import AdminSidebar from "../components/AdminSidebar";
import AgendaGrid from "../components/AgendaGrid";
import AdminPanel from "../components/AdminPanel";
import AdminSettingsPanel from "../components/AdminSettingsPanel";
import BranchesPanel from "../components/BranchesPanel";
import BundlesPanel from "../components/BundlesPanel";
import ClientsPanel from "../components/ClientsPanel";
import NewBookingPanel from "../components/NewBookingPanel";
import EmployeeAvailabilityPanel from "../components/EmployeeAvailabilityPanel";
import { WorkspaceProfileIdentity } from "../components/WorkspaceHero";

const turnosAppLogo = '/logo-quieroturnoapp.png';

const getAdminViewFromHash = () => {
  const hash = window.location.hash.replace(/^#/, '');

  if (hash === 'admin-agenda') return 'agenda';
  if (hash === 'assign-booking' || hash === 'admin-pending') return 'pending';
  if (hash === 'admin-employees') return 'employees';
  if (hash === 'admin-branches') return 'sucursales';
  if (hash === 'admin-bundles') return 'bundles';

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

  const [activeView, setActiveView] = useState(getAdminViewFromHash);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);
  const [newBookingInitial, setNewBookingInitial] = useState(null);
  const [adminDataVersion, setAdminDataVersion] = useState(0);
  const [promotions, setPromotions] = useState([]);
  const configuracionOperativa = companyContext?.configuracion_operativa || {};
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
      setActiveView(getAdminViewFromHash());
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
      const { data, error } = await supabase.rpc('get_app_configuration', {
        company_slug_value: companySlug
      });

      if (!active || error) return;

      setPromotions(Array.isArray(data?.promotions) ? data.promotions : []);
    };

    loadConfiguration();

    return () => {
      active = false;
    };
  }, [adminDataVersion, companySlug]);

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
    setAdminDataVersion((current) => current + 1);
    onCompanyContextRefresh?.();
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

    setActiveView(view);
    setSidebarOpen(false);
  };

  const adminNavGroups = useMemo(() => {
    const gestion = [
      { id: 'new-booking', label: 'Nueva reserva', icon: '➕' },
      { id: 'agenda', label: 'Calendario', icon: '📅' },
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
          { id: 'services', label: 'Servicios', icon: '✨' },
          { id: 'settings', label: 'Configuración del negocio', icon: '⚙' }
        ]
      }
    ];
  }, [sucursalesHabilitadas, bundlesHabilitados]);

  const adminProfileSummary = (
    <WorkspaceProfileIdentity user={user} roleLabel="Administrador" />
  );

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
          {activeView === 'agenda' && (
            <div className="agenda-responsive-shell">
              <AgendaGrid key={adminDataVersion} user={user} refreshKey={adminDataVersion} promotions={enabledPromotions} adminProfileSummary={adminProfileSummary} companySlug={companySlug} companyContext={companyContext} onRequestNewBooking={(options) => { setNewBookingInitial(options); setIsNewBookingOpen(true); }} />
            </div>
          )}
          {activeView === 'pending' && (
            <div className="agenda-responsive-shell">
              <AgendaGrid key={`pending-${adminDataVersion}`} pendingView user={user} refreshKey={adminDataVersion} promotions={enabledPromotions} adminProfileSummary={adminProfileSummary} companySlug={companySlug} companyContext={companyContext} />
            </div>
          )}
          {activeView === 'clients' && <ClientsPanel user={user} onDataChanged={notifyAdminDataChanged} adminProfileSummary={adminProfileSummary} companySlug={companySlug} companyContext={companyContext} />}
          {activeView === 'employees' && <AdminPanel view="employees" user={user} onDataChanged={notifyAdminDataChanged} adminProfileSummary={adminProfileSummary} companySlug={companySlug} companyContext={companyContext} />}
          {activeView === 'services' && <AdminPanel view="services" user={user} onDataChanged={notifyAdminDataChanged} adminProfileSummary={adminProfileSummary} companySlug={companySlug} companyContext={companyContext} />}
          {activeView === 'availability' && <EmployeeAvailabilityPanel user={user} mode="admin" onAvailabilityChanged={notifyAdminDataChanged} adminProfileSummary={adminProfileSummary} companySlug={companySlug} companyContext={companyContext} />}
          {activeView === 'sucursales' && sucursalesHabilitadas && <BranchesPanel user={user} onDataChanged={notifyBranchesChanged} adminProfileSummary={adminProfileSummary} companySlug={companySlug} companyContext={companyContext} />}
          {activeView === 'bundles' && bundlesHabilitados && <BundlesPanel user={user} onDataChanged={notifyBranchesChanged} adminProfileSummary={adminProfileSummary} companySlug={companySlug} packsHabilitados={packsHabilitados} promosHabilitadas={promocionesHabilitadas} />}
          {activeView === 'settings' && <AdminSettingsPanel user={user} adminProfileSummary={adminProfileSummary} companySlug={companySlug} companyContext={companyContext} />}
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
