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
import NewBookingPanel from "../components/NewBookingPanel";
import EmployeeAvailabilityPanel from "../components/EmployeeAvailabilityPanel";

const turnosAppLogo = '/logo-quieroturnoapp.png';

const getAdminViewFromHash = () => {
  const hash = window.location.hash.replace(/^#/, '');

  if (hash === 'admin-agenda' || hash === 'assign-booking') return 'agenda';
  if (hash === 'admin-employees') return 'employees';
  if (hash === 'admin-branches') return 'sucursales';
  if (hash === 'admin-bundles') return 'bundles';

  return 'agenda';
};

const getUserInitials = (user) => {
  const label = user?.displayName || user?.email || user?.username || 'U';
  const parts = String(label).trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return String(parts[0]?.[0] || 'U').toUpperCase();
};

const getUserLabel = (user) => user?.displayName || user?.email || user?.username || 'Sin usuario';

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
    <div className="workspace-profile-panel admin-profile-panel">
      <div className="workspace-profile-summary">
        <span className="workspace-profile-name">{getUserLabel(user)}</span>
        <span className="workspace-profile-role">Administrador</span>
      </div>
      <span className={`role-workspace-icon role-workspace-profile-photo ${user?.photoUrl ? 'has-photo' : ''}`} aria-hidden="true">
        {user?.photoUrl ? <img src={user.photoUrl} alt="" /> : getUserInitials(user)}
      </span>
    </div>
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
              <AgendaGrid key={adminDataVersion} user={user} refreshKey={adminDataVersion} promotions={enabledPromotions} adminProfileSummary={adminProfileSummary} companySlug={companySlug} companyContext={companyContext} />
            </div>
          )}
          {activeView === 'employees' && <AdminPanel view="employees" user={user} onDataChanged={notifyAdminDataChanged} adminProfileSummary={adminProfileSummary} companySlug={companySlug} companyContext={companyContext} />}
          {activeView === 'services' && <AdminPanel view="services" user={user} onDataChanged={notifyAdminDataChanged} adminProfileSummary={adminProfileSummary} companySlug={companySlug} companyContext={companyContext} />}
          {activeView === 'availability' && <EmployeeAvailabilityPanel user={user} mode="admin" onAvailabilityChanged={notifyAdminDataChanged} adminProfileSummary={adminProfileSummary} companySlug={companySlug} companyContext={companyContext} />}
          {activeView === 'sucursales' && sucursalesHabilitadas && <BranchesPanel user={user} onDataChanged={notifyBranchesChanged} adminProfileSummary={adminProfileSummary} companySlug={companySlug} companyContext={companyContext} />}
          {activeView === 'bundles' && bundlesHabilitados && <BundlesPanel user={user} onDataChanged={notifyBranchesChanged} adminProfileSummary={adminProfileSummary} companySlug={companySlug} packsHabilitados={packsHabilitados} promosHabilitadas={promocionesHabilitadas} />}
          {activeView === 'settings' && <AdminSettingsPanel user={user} adminProfileSummary={adminProfileSummary} companySlug={companySlug} companyContext={companyContext} />}
        </Box>
      </div>

      {accessProfile === 'admin' && (
        <AdminBottomNav activeView={activeView} onViewChange={changeView} />
      )}

      {isNewBookingOpen && (
        <NewBookingPanel
          user={user}
          companySlug={companySlug}
          companyContext={companyContext}
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
