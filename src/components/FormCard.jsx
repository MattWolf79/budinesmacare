export default function FormCard({
  title,
  isOpen = true,
  onToggle,
  toggleLabel,
  className = '',
  headerClassName = '',
  bodyClassName = '',
  children,
  ...formProps
}) {
  const isCollapsible = typeof onToggle === 'function';
  const cardClassName = ['agenda-modal-card admin-form-card form-card', className].filter(Boolean).join(' ');
  const headerClassNames = ['agenda-modal-header form-card-header', headerClassName].filter(Boolean).join(' ');
  const bodyClassNames = [
    'agenda-modal-body admin-form-grid form-card-body',
    bodyClassName,
    isCollapsible ? (isOpen ? 'is-open' : 'is-collapsed') : ''
  ].filter(Boolean).join(' ');

  return (
    <form className={cardClassName} {...formProps}>
      <div className={headerClassNames}>
        <span>{title}</span>
        {isCollapsible && (
          <button
            className="availability-form-toggle admin-collapsible-form-toggle form-card-toggle"
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-label={toggleLabel}
          >
            &gt;
          </button>
        )}
      </div>
      <div className={bodyClassNames}>
        {children}
      </div>
    </form>
  );
}