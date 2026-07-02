import { useEffect, useState } from 'react';
import EmployeeDashboard from './EmployeeDashboard';
import ClientDashboard from './ClientDashboard';
import Navbar from './Navbar';
import { supabase } from '../api/supabaseClient';

const profileOptions = {
  client: {
    label: 'Cliente',
    eyebrow: 'Acceso cliente',
    icon: '🙋',
    title: 'Mis turnos',
    description: 'Una vista simple para reservar, revisar próximos turnos y gestionar cancelaciones futuras.',
    actions: ['Reservar turnos', 'Ver mis reservas', 'Cancelar próximos turnos']
  },
  employee: {
    label: 'Empleado',
    eyebrow: 'Acceso interno',
    icon: '🧑‍💼',
    title: 'Mi agenda laboral',
    description: 'Un panel enfocado en los turnos asignados y la disponibilidad propia.',
    actions: ['Ver agenda asignada', 'Consultar disponibilidad', 'Actualizar horarios']
  },
  admin: {
    label: 'Administrador',
    eyebrow: 'Gestión completa',
    icon: '🛠️',
    title: 'Administración general',
    description: 'Mantiene la agenda completa actual con empleados, actividades, disponibilidad y reservas.',
    actions: ['Gestionar agenda', 'Administrar empleados', 'Configurar actividades']
  }
};

const profileList = ['client', 'employee', 'admin'];

const employeeNavItems = [
  { id: 'summary', label: 'Resumen', icon: '▦' },
  { id: 'agenda', label: 'Agenda', icon: '📅' },
  { id: 'availability', label: 'Disponibilidad', icon: '🕒' }
];

function ProfileCard({ profileId, selectedProfile, onSelectProfile }) {
  const profile = profileOptions[profileId];
  const isSelected = selectedProfile === profileId;

  return (
    <button
      type="button"
      className={`profile-card ${isSelected ? 'is-selected' : ''}`}
      onClick={() => onSelectProfile(profileId)}
    >
      <span className="profile-card-icon" aria-hidden="true">{profile.icon}</span>
      <span className="profile-card-eyebrow">{profile.eyebrow}</span>
      <span className="profile-card-title">{profile.label}</span>
      <span className="profile-card-copy">{profile.description}</span>
    </button>
  );
}

function ServiceColorLegend() {
  const [services, setServices] = useState([]);

  useEffect(() => {
    let active = true;

    const timeoutId = window.setTimeout(async () => {
      const { data, error } = await supabase
        .from('services')
        .select('id, name, color, active')
        .order('id', { ascending: true });

      if (!active) return;

      if (!error) {
        setServices((data || []).filter((service) => service.active !== false));
      }
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (!services.length) {
    return null;
  }

  return (
    <div className="service-color-legend" aria-label="Referencias de colores de actividades">
      {services.map((service) => (
        <span className="service-color-item" key={service.id}>
          <span className="service-color-swatch" style={{ background: service.color || '#94a3b8' }} aria-hidden="true" />
          {service.name}
        </span>
      ))}
    </div>
  );
}

function RoleWorkspace({ selectedProfile, user, onChangeProfile, onLogout, canChangeProfile }) {
  const [employeeActiveView, setEmployeeActiveView] = useState('summary');
  const profile = profileOptions[selectedProfile];

  return (
    <main className="role-workspace">
      {selectedProfile === 'employee' ? (
        <Navbar
          user={user}
          activeView={employeeActiveView}
          accessProfile={selectedProfile}
          onViewChange={setEmployeeActiveView}
          onChangeProfile={onChangeProfile}
          onLogout={onLogout}
          showNavigation
          showProfileBadge
          canChangeProfile={canChangeProfile}
          navItems={employeeNavItems}
        />
      ) : (
        <section className="role-workspace-topbar">
          <div className="role-workspace-brand">
            <span className="app-navbar-mark">T</span>
            <div>
              <div className="app-navbar-title">Turnos App</div>
              <div className="app-navbar-subtitle">{profile.label}</div>
            </div>
          </div>

          <div className="role-workspace-session">
            <span>{user?.email || 'Sin usuario'}</span>
            {canChangeProfile && (
              <button type="button" className="app-navbar-switch" onClick={onChangeProfile}>Cambiar perfil</button>
            )}
            <button type="button" className="app-navbar-logout" onClick={onLogout}>Salir</button>
          </div>
        </section>
      )}

      <section className="role-workspace-hero">
        <div>
          <p className="admin-kicker">{profile.eyebrow}</p>
          <h1>{profile.title}</h1>
          <p>{profile.description}</p>
          {selectedProfile === 'client' && <ServiceColorLegend />}
        </div>
        <span className="role-workspace-icon" aria-hidden="true">{profile.icon}</span>
      </section>

      {selectedProfile === 'client' ? (
        <ClientDashboard user={user} />
      ) : selectedProfile === 'employee' ? (
        <EmployeeDashboard user={user} activeView={employeeActiveView} />
      ) : (
        <section className="role-action-grid" aria-label="Acciones previstas">
          {profile.actions.map((action) => (
            <article className="role-action-card" key={action}>
              <span aria-hidden="true">✓</span>
              <strong>{action}</strong>
              <p>Diseño preparado para conectar permisos, datos y acciones en la próxima etapa.</p>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

export default function RoleAccess({
  children,
  user,
  selectedProfile,
  onSelectProfile,
  onChangeProfile,
  availableProfiles = profileList,
  canChangeProfile = availableProfiles.length > 1,
  onLogout
}) {
  if (children) {
    return children;
  }

  if (selectedProfile) {
    return (
      <RoleWorkspace
        selectedProfile={selectedProfile}
        user={user}
        onChangeProfile={onChangeProfile}
        canChangeProfile={canChangeProfile}
        onLogout={onLogout}
      />
    );
  }

  return (
    <main className="profile-select-page">
      <section className="profile-select-panel">
        <div className="login-brand-mark">T</div>
        <p className="login-kicker">Tipo de acceso</p>
        <h1>Elegí cómo querés entrar</h1>
        <p className="profile-select-copy">
          Esta capa deja separado el diseño de cliente, empleado y administrador. Por ahora el administrador conserva el panel completo actual.
        </p>

        <div className="profile-card-grid">
          {availableProfiles.map((profileId) => (
            <ProfileCard
              key={profileId}
              profileId={profileId}
              selectedProfile={selectedProfile}
              onSelectProfile={onSelectProfile}
            />
          ))}
        </div>

        <div className="profile-select-footer">
          <span>{user?.email || 'Sin usuario'}</span>
          <button type="button" className="app-navbar-logout" onClick={onLogout}>Salir</button>
        </div>
      </section>
    </main>
  );
}