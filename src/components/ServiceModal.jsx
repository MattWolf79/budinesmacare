import ActivityIcon from './ActivityIcon';

export default function ServiceModal({ services, rangeLabel, onClose, onSelectService }) {
  const activeServices = services.filter((service) => service.active !== false);

  return (
    <div className="modal">
      <div className="agenda-modal-card service-select-modal">
        <div className="agenda-modal-header">Servicios</div>

        <div className="agenda-modal-body">
          {activeServices.length === 0 ? (
            <div className="agenda-empty-state">
              No hay servicios disponibles para reservar.
            </div>
          ) : (
            <div className="agenda-option-grid">
              {activeServices.map(service => (
                <button className="agenda-option-button client-modal-option-button" key={service.id ?? service.promotionKey ?? service.name} onClick={() => onSelectService(service)}>
                  <ActivityIcon service={service} size="small" /> <span>{service.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="agenda-modal-summary">
            {rangeLabel}
          </div>

          <button className="agenda-close-button agenda-close-button-single client-welcome-action client-request-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}