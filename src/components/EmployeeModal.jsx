import ActivityIcon from './ActivityIcon';

export default function EmployeeModal({
  employees,
  rangeLabel,
  selectedService,
  onClose,
  onReserve,
  emptyMessage = 'No hay empleados disponibles para ese horario.',
  isLoading = false,
  summaryExtra = '',
  fallbackActionLabel = '',
  onFallbackReserve,
  fallbackDisabled = false
}) {
  return (
    <div className="modal">
      <div className="agenda-modal-card employee-reservation-modal">
        <div className="agenda-modal-header">Seleccionar empleado</div>

        <div className="agenda-modal-body">
          {isLoading ? (
            <div className="agenda-empty-state">
              Buscando empleados disponibles...
            </div>
          ) : employees.length === 0 ? (
            <div className="agenda-empty-state">
              {emptyMessage}
            </div>
          ) : (
            <div className="agenda-option-grid">
              {employees.map(employee => (
                <button className="agenda-option-button" key={employee.id} onClick={() => onReserve(employee)}>
                  👤 {employee.name}
                </button>
              ))}
            </div>
          )}

          <div className="agenda-modal-summary">
            <span className="agenda-summary-title"><ActivityIcon service={selectedService} size="small" /> {selectedService.name}</span><br />
            {rangeLabel}
            {summaryExtra && <span className="client-request-promotion">{summaryExtra}</span>}
          </div>

          <div className="agenda-modal-actions client-request-actions">
            <button className="client-welcome-action client-request-secondary" type="button" onClick={onClose}>Cerrar</button>
            {fallbackActionLabel && (
              <button className="client-welcome-action client-request-submit" type="button" onClick={onFallbackReserve} disabled={fallbackDisabled}>
                {fallbackActionLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}