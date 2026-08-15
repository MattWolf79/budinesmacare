import { Routes, Route } from 'react-router-dom';

import HomePage from '../pages/client/HomePage';
import ReservaPage from '../pages/client/ReservaPage';
import MisTurnosPage from '../pages/client/MisTurnosPage';
import ProfilePage from '../pages/client/ProfilePage';

export default function RutasCliente(props) {
  return (
    <Routes>
      <Route path="/" element={<HomePage {...props} />} />
      <Route path="/inicio" element={<HomePage {...props} />} />
      <Route path="/reserva" element={<ReservaPage {...props} />} />
      <Route path="/mis-turnos" element={<MisTurnosPage {...props} />} />
      <Route path="/perfil" element={<ProfilePage {...props} />} />
    </Routes>
  );
}