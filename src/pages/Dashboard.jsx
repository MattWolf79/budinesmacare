import { useState } from "react";
import { Container, Box } from "@mui/material";
import Navbar from "../components/Navbar";
import AgendaGrid from "../components/AgendaGrid";
import AdminPanel from "../components/AdminPanel";
import EmployeeAvailabilityPanel from "../components/EmployeeAvailabilityPanel";

export default function Dashboard({ user, accessProfile, onChangeProfile, onLogout, canChangeProfile = false }) {

  const [activeView, setActiveView] = useState('agenda');
  const [adminDataVersion, setAdminDataVersion] = useState(0);

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
    <Container maxWidth="xl">
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

      <Box sx={{ mt: 3 }}>
        {activeView === 'agenda' && (
          <div className="agenda-responsive-shell">
            <AgendaGrid key={adminDataVersion} user={user} refreshKey={adminDataVersion} />
          </div>
        )}
        {activeView === 'employees' && <AdminPanel view="employees" onDataChanged={notifyAdminDataChanged} />}
        {activeView === 'services' && <AdminPanel view="services" onDataChanged={notifyAdminDataChanged} />}
        {activeView === 'availability' && <EmployeeAvailabilityPanel user={user} mode="admin" onAvailabilityChanged={notifyAdminDataChanged} />}
      </Box>
    </Container>
  );
}
