import ActivityIcon from './ActivityIcon';

export default function ServiceModal({ services, rangeLabel, onClose, onSelectService }) {
  const activeServices = services.filter((service) => service.active !== false);

  return (
    <div className="modal">
      <div className="agenda-modal-card">
        <div className="agenda-modal-header">Seleccionar actividad</div>

        <div className="agenda-modal-body">
          <div className="agenda-option-grid">
            {activeServices.map(service => (
              <button className="agenda-option-button" key={service.id} onClick={() => onSelectService(service)}>
                <ActivityIcon service={service} size="small" /> {service.name}
              </button>
            ))}
          </div>

          <div className="agenda-modal-summary">
            {rangeLabel}
          </div>

          <button className="agenda-close-button agenda-close-button-single" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}