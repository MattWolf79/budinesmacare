import { useEffect, useMemo, useState } from "react";
import { Container, Box } from "@mui/material";
import { supabase } from "../api/supabaseClient";
import Navbar from "../components/Navbar";
import AgendaGrid from "../components/AgendaGrid";
import AdminPanel from "../components/AdminPanel";
import AdminSettingsPanel from "../components/AdminSettingsPanel";
import EmployeeAvailabilityPanel from "../components/EmployeeAvailabilityPanel";

const getAdminViewFromHash = () => {
  const hash = window.location.hash.replace(/^#/, '');

  if (hash === 'admin-agenda' || hash === 'assign-booking') return 'agenda';
  if (hash === 'admin-employees') return 'employees';

  return 'agenda';
};

export default function Dashboard({ user, accessProfile, onChangeProfile, onLogout, canChangeProfile = false }) {

  const [activeView, setActiveView] = useState(getAdminViewFromHash);
  const [adminDataVersion, setAdminDataVersion] = useState(0);
  const [promotions, setPromotions] = useState([]);

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
    let active = true;

    const loadConfiguration = async () => {
      const { data, error } = await supabase.rpc('get_app_configuration');

      if (!active || error) return;

      setPromotions(Array.isArray(data?.promotions) ? data.promotions : []);
    };

    loadConfiguration();

    return () => {
      active = false;
    };
  }, [adminDataVersion]);

  const enabledPromotions = useMemo(() => (
    promotions.filter((promotion) => promotion?.enabled !== false && (promotion?.title || promotion?.description || promotion?.value))
  ), [promotions]);

  const notifyAdminDataChanged = () => {
    setAdminDataVersion((current) => current + 1);
  };

  const changeView = (view) => {
    if (view === 'agenda') {
      setAdminDataVersion((current) => current + 1);
    }

    setActiveView(view);
  };

  return (
    <Container maxWidth={false} disableGutters className="dashboard-shell">
      <Navbar
        user={user}
        activeView={activeView}
        accessProfile={accessProfile}
        onViewChange={changeView}
        onChangeProfile={onChangeProfile}
        onLogout={onLogout}
        showAdminNavigation={accessProfile === 'admin'}
        showProfileBadge={accessProfile !== 'client'}
        canChangeProfile={canChangeProfile}
      />

      <Box className="dashboard-content">
        {activeView === 'agenda' && (
          <div className="agenda-responsive-shell">
            <AgendaGrid key={adminDataVersion} user={user} refreshKey={adminDataVersion} promotions={enabledPromotions} />
          </div>
        )}
        {activeView === 'employees' && <AdminPanel view="employees" user={user} onDataChanged={notifyAdminDataChanged} />}
        {activeView === 'services' && <AdminPanel view="services" user={user} onDataChanged={notifyAdminDataChanged} />}
        {activeView === 'availability' && <EmployeeAvailabilityPanel user={user} mode="admin" onAvailabilityChanged={notifyAdminDataChanged} />}
        {activeView === 'settings' && <AdminSettingsPanel user={user} />}
      </Box>
    </Container>
  );
}
