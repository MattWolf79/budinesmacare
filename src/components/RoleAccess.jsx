import { UserPhoto } from './WorkspaceHero';

const turnosAppLogo =
  '/logo-quieroturnoapp.png';

const profileOptions = {
  client: {
    label: 'Cliente',
    eyebrow: 'Acceso cliente',
    icon: '🙋',
    title: 'Mis turnos',
    description:
      'Una vista simple para reservar, revisar próximos turnos y gestionar cancelaciones futuras.',
    actions: [
      'Reservar turnos',
      'Ver mis reservas',
      'Cancelar próximos turnos'
    ]
  },

  employee: {
    label: 'Empleado',
    eyebrow: 'Acceso interno',
    icon: '🧑‍💼',
    title: 'Mi agenda laboral',
    description:
      'Un panel enfocado en los turnos asignados y la disponibilidad propia.',
    actions: [
      'Ver agenda asignada',
      'Consultar disponibilidad',
      'Actualizar horarios'
    ]
  },

  admin: {
    label: 'Administrador',
    eyebrow: 'Gestión completa',
    icon: '🛠️',
    title: 'Administración general',
    description:
      'Mantiene la agenda completa actual con empleados, servicios, disponibilidad y reservas.',
    actions: [
      'Gestionar agenda',
      'Administrar empleados',
      'Configurar servicios'
    ]
  }
};

const profileList = [
  'client',
  'employee',
  'admin'
];

function ProfileCard({
  profileId,
  selectedProfile,
  onSelectProfile,
  user
}) {
  const profile =
    profileOptions[profileId];

  const isSelected =
    selectedProfile === profileId;

  const shouldUseClientPhoto =
    profileId === 'client' &&
    Boolean(user?.photoUrl);

  return (
    <button
      type="button"
      className={`profile-card ${
        isSelected
          ? 'is-selected'
          : ''
      }`}
      onClick={() =>
        onSelectProfile(profileId)
      }
    >
      <span
        className={`profile-card-icon ${
          shouldUseClientPhoto
            ? 'has-photo'
            : ''
        }`}
        aria-hidden="true"
      >
        <UserPhoto
          user={
            profileId === 'client'
              ? user
              : null
          }
          fallback={profile.icon}
        />
      </span>

      <span className="profile-card-eyebrow">
        {profile.eyebrow}
      </span>

      <span className="profile-card-title">
        {profile.label}
      </span>

      <span className="profile-card-copy">
        {profile.description}
      </span>
    </button>
  );
}

export default function RoleAccess({
  user,
  selectedProfile,
  onSelectProfile,
  availableProfiles = profileList,
  canChangeProfile =
    availableProfiles.length > 1,
  onLogout
}) {
  /*
   * Este componente ya no monta routers.
   *
   * La navegación de cada perfil pertenece al router principal
   * y a RutasCliente / RutasEmpleado / Dashboard.
   * RoleAccess solamente permite elegir el perfil cuando todavía
   * no existe uno seleccionado.
   */
  return (
    <main className="profile-select-page">
      <section className="profile-select-panel">
        <img
          className="login-brand-mark"
          src={turnosAppLogo}
          alt="QuieroTurnoApp"
        />

        <p className="login-kicker">
          Tipo de acceso
        </p>

        <h1>
          Elegí cómo querés entrar
        </h1>

        <p className="profile-select-copy">
          Esta capa separa el acceso de
          cliente, empleado y administrador.
        </p>

        <div className="profile-card-grid">
          {availableProfiles.map(
            (profileId) => (
              <ProfileCard
                key={profileId}
                profileId={profileId}
                selectedProfile={
                  selectedProfile
                }
                onSelectProfile={
                  onSelectProfile
                }
                user={user}
              />
            )
          )}
        </div>

        <div className="profile-select-footer">
          <span>
            {user?.email ||
              'Sin usuario'}
          </span>

          <button
            type="button"
            className="app-navbar-logout"
            onClick={onLogout}
          >
            Salir
          </button>
        </div>
      </section>
    </main>
  );
}
