const getUserLabel = (user) =>
  user?.displayName || user?.email || user?.username || 'Sin usuario';

const getUserInitials = (user) => {
  const label = user?.displayName || user?.email || user?.username || 'U';
  const parts = String(label).trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return String(parts[0]?.[0] || 'U').toUpperCase();
};

export function UserPhoto({ user, fallback }) {
  if (user?.photoUrl) {
    return <img src={user.photoUrl} alt="" />;
  }

  return fallback;
}

export function WorkspaceProfilePhoto({ user, fallback, className = '' }) {
  return (
    <span
      className={`role-workspace-icon role-workspace-profile-photo ${user?.photoUrl ? 'has-photo' : ''} ${className}`.trim()}
      aria-hidden="true"
    >
      <UserPhoto user={user} fallback={fallback} />
    </span>
  );
}

export function WorkspaceProfileIdentity({ user, roleLabel, photoFallback }) {
  return (
    <div className="workspace-profile-panel">
      <div className="workspace-profile-summary">
        <span className="workspace-profile-name">{getUserLabel(user)}</span>
        <span className="workspace-profile-role">{roleLabel}</span>
      </div>
      <WorkspaceProfilePhoto user={user} fallback={photoFallback ?? getUserInitials(user)} />
    </div>
  );
}

export function WorkspaceHero({
  eyebrow,
  title,
  description,
  identity,
  className = '',
  style,
  children,
}) {
  return (
    <section className={`role-workspace-hero ${className}`.trim()} style={style}>
      <div>
        {eyebrow && <p className="admin-kicker">{eyebrow}</p>}
        {title && <h1>{title}</h1>}
        {description && <p>{description}</p>}
        {children}
      </div>
      {identity}
    </section>
  );
}

export default WorkspaceHero;
