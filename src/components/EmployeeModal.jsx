import ActivityIcon from './ActivityIcon';

export default function EmployeeModal({ employees, rangeLabel, selectedService, onClose, onReserve }) {
  return (
    <div className="modal">
      <div className="agenda-modal-card">
        <div className="agenda-modal-header">Seleccionar empleado</div>

        <div className="agenda-modal-body">
          {employees.length === 0 ? (
            <div className="agenda-empty-state">
              No hay empleados disponibles para ese horario.
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
          </div>

          <button className="agenda-close-button agenda-close-button-single" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}