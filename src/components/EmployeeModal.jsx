import ActivityIcon from './ActivityIcon';

const capitalizeNamePart = (value) => {
  const cleanValue = String(value || '').trim();
  if (!cleanValue) return '';
  return `${cleanValue[0].toUpperCase()}${cleanValue.slice(1)}`;
};

const formatEmployeeShortName = (employee) => {
  const firstName = String(employee?.first_name || '').trim();
  const lastName = String(employee?.last_name || '').trim();

  if (firstName && lastName) return `${capitalizeNamePart(firstName)} ${lastName[0].toUpperCase()}`;
  if (firstName) return capitalizeNamePart(firstName);

  const nameParts = String(employee?.name || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (nameParts.length >= 2) return `${capitalizeNamePart(nameParts[0])} ${nameParts[1][0].toUpperCase()}`;
  return capitalizeNamePart(nameParts[0]) || 'Empleado';
};

const getEmployeeInitials = (employee) => {
  const label = formatEmployeeShortName(employee);
  const parts = label.split(' ').filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return String(parts[0]?.[0] || 'E').toUpperCase();
};

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
              {employees.map(employee => {
                const employeeLabel = formatEmployeeShortName(employee);

                return (
                  <button className="agenda-option-button employee-reservation-option" key={employee.id} onClick={() => onReserve(employee)}>
                    <span className="employee-reservation-avatar" aria-hidden="true">
                      {employee.photo_url ? <img src={employee.photo_url} alt="" /> : getEmployeeInitials(employee)}
                    </span>
                    <span>{employeeLabel}</span>
                  </button>
                );
              })}
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