import { Routes, Route } from "react-router-dom";

import ClientsPanel from "../components/ClientsPanel";
import BranchesPanel from "../components/BranchesPanel";
import BundlesPanel from "../components/BundlesPanel";
import AdminSettingsPanel from "../components/AdminSettingsPanel";

export default function AdminRoutes() {

  return (
    <Routes>

      <Route
        path="/"
        element={<AgendaGrid />}
      />

      <Route
        path="/clientes"
        element={<ClientsPanel />}
      />

      <Route
        path="/sucursales"
        element={<BranchesPanel />}
      />

      <Route
        path="/bundles"
        element={<BundlesPanel />}
      />

      <Route
        path="/settings"
        element={<AdminSettingsPanel />}
      />

    </Routes>
  );
}