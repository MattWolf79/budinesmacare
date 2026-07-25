import ActivityIcon from './ActivityIcon';

export default function ServiceModal({ services, rangeLabel, startLabel = '', slotMinutes = 30, onClose, onSelectService, branchSelector = null }) {
  const activeServices = services.filter((service) => service.active !== false);

  const durationLabelFor = (service) => {
    const raw = Number(service?.default_duration);
    if (service?.isPromotion || !(raw > 0)) return '';
    const slots = Math.max(1, Math.ceil(raw / slotMinutes));
    return `${slots * slotMinutes} min`;
  };

  return (
    <div className="modal">
      <div className="agenda-modal-card service-select-modal">
        <div className="agenda-modal-header">Servicios</div>

        <div className="agenda-modal-body">
          {branchSelector}
          {activeServices.length === 0 ? (
            <div className="agenda-empty-state">
              No hay servicios disponibles para reservar en esta sucursal.
            </div>
          ) : (
            <div className="agenda-option-grid">
              {activeServices.map(service => {
                const durationLabel = durationLabelFor(service);
                return (
                  <button className="agenda-option-button client-modal-option-button service-option-button" key={service.id ?? service.promotionKey ?? service.name} onClick={() => onSelectService(service)}>
                    <span className="service-option-main"><ActivityIcon service={service} size="small" /> <span>{service.name}</span></span>
                    {durationLabel && <span className="service-option-duration">{durationLabel}</span>}
                  </button>
                );
              })}
            </div>
          )}

          <div className="agenda-modal-summary">
            {startLabel || rangeLabel}
          </div>

          <button className="agenda-close-button agenda-close-button-single client-welcome-action client-request-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}