import ActivityIcon from './ActivityIcon';

export default function CancelBookingModal({ booking, service, employee, onClose, onConfirm }) {
  if (!booking) return null;

  const startTime = new Date(booking.start_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
  const endTime = new Date(booking.end_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="modal">
      <div className="agenda-modal-card">
        <div className="agenda-modal-header">Cancelar turno</div>

        <div className="agenda-modal-body">
          <div className="agenda-modal-summary">
            <div className="agenda-summary-title"><ActivityIcon service={service} size="small" /> <b>{service?.name}</b></div>
            <div>{employee?.name}</div>
            <div>{startTime} - {endTime}</div>
          </div>

          <div className="agenda-modal-actions">
            <button className="agenda-close-button" onClick={onClose}>
              Cerrar
            </button>

            <button className="agenda-danger-button" onClick={() => onConfirm(booking)}>
              🗑 Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}