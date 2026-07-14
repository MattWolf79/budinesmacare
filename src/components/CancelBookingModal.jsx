import ActivityIcon from './ActivityIcon';
import { formatDisplayDate } from '../utils/dateFormat';

const capitalizeNamePart = (value) => {
  const cleanValue = String(value || '').trim();
  if (!cleanValue) return '';
  return `${cleanValue[0].toUpperCase()}${cleanValue.slice(1)}`;
};

const formatPersonShortName = (person) => {
  const firstName = String(person?.first_name || '').trim();
  const lastName = String(person?.last_name || '').trim();

  if (firstName && lastName) return `${capitalizeNamePart(firstName)} ${lastName[0].toUpperCase()}`;
  if (firstName) return capitalizeNamePart(firstName);

  const nameParts = String(person?.name || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (nameParts.length >= 2) return `${capitalizeNamePart(nameParts[0])} ${nameParts[1][0].toUpperCase()}`;
  return capitalizeNamePart(nameParts[0]) || 'Empleado pendiente';
};

const getCustomerDetails = (booking) => ({
  name: booking.customer_name || booking.user_email || 'Cliente sin datos',
  email: booking.customer_name ? booking.user_email || '' : ''
});

const formatActivityName = (value) => {
  const cleanValue = String(value || '').trim();
  if (!cleanValue) return 'Servicio';

  return cleanValue
    .split(/\s+/)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(' ');
};

const getActivityLabel = (booking, service) => {
  if (service?.name) return formatActivityName(service.name);
  if (booking.booking_description) return formatActivityName(String(booking.booking_description).split('·')[0]);
  return 'Servicio';
};

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
  const bookingDate = formatDisplayDate(booking.start_at);
  const employeeLabel = formatPersonShortName(employee);
  const customerDetails = getCustomerDetails(booking);
  const activityLabel = getActivityLabel(booking, service);
  const activityService = service || {
    name: activityLabel,
    icon: '✨',
    color: '#3fc9d5'
  };

  return (
    <div className="modal">
      <div className="agenda-modal-card">
        <div className="agenda-modal-header cancel-booking-header"><span aria-hidden="true">X</span> Cancelar turno</div>

        <div className="agenda-modal-body">
          <div className="agenda-modal-summary">
            <div className="agenda-summary-title cancel-booking-activity"><ActivityIcon service={activityService} size="small" /> <b>{activityLabel}</b></div>
            <div><b>Cliente:</b> {customerDetails.name}</div>
            {customerDetails.email && <div><b>Mail:</b> {customerDetails.email}</div>}
            <div>{bookingDate}</div>
            <div>{startTime} - {endTime}</div>
            <div><b>Empleado:</b> {employeeLabel}</div>
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