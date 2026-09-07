import {
  Navigate,
  Route,
  Routes
} from 'react-router-dom';

import {
  CompanyApp
} from '../App';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<CompanyApp />} />
      <Route path="/pedidos/*" element={<CompanyApp />} />
      <Route path="/admin/*" element={<CompanyApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
