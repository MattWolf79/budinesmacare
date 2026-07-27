export default function AdminSidebar({
  groups = [],
  activeView,
  onViewChange,
  open = false,
  onClose,
  companyName = 'QuieroTurnoApp',
  logoSrc
}) {
  return (
    <>
      <div
        className={`admin-sidebar-overlay ${open ? 'is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`admin-sidebar ${open ? 'is-open' : ''}`} aria-label="Menú administrador">
        <div className="admin-sidebar-brand">
          <span className="admin-sidebar-brand-title">MENÚ</span>
          <button className="admin-sidebar-close" type="button" onClick={onClose} aria-label="Cerrar menú">✕</button>
        </div>

        <nav className="admin-sidebar-nav">
          {groups.map((group) => (
            <div key={group.label || 'main'} className="admin-sidebar-group">
              {group.label && <span className="admin-sidebar-group-label">{group.label}</span>}
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`admin-sidebar-item ${activeView === item.id ? 'is-active' : ''}`}
                  onClick={() => onViewChange(item.id)}
                >
                  <span className="admin-sidebar-item-icon" aria-hidden="true">{item.icon}</span>
                  <span className="admin-sidebar-item-label">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
