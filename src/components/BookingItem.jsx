import { useState } from 'react';
import ActivityIcon from './ActivityIcon';

const POPOVER_WIDTH = 240;
const POPOVER_GAP = 8;
const POPOVER_MARGIN = 12;

export default function BookingItem({
  booking,
  service,
  employee,
  onCancel,
  canCancel = true,
  isClosed = false,
  canShowDetails = true,
  canViewCustomer = true,
  customerLabel,
  displayLabel,
  employeeLabel,
  compact = false
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });

  const startTime = new Date(booking.start_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const endTime = new Date(booking.end_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const customerDetail = booking.customer_name
    ? `${booking.customer_name}${booking.user_email ? ` · ${booking.user_email}` : ''}`
    : booking.user_email;
  const bookingLabel = employee?.name || service?.name || 'Turno';
  const isPromotionBooking = !booking.service && Boolean(booking.booking_description);
  const promotionTitle = isPromotionBooking
    ? String(booking.booking_description || '').split('·')[0].trim()
    : '';
  const agendaLabel = displayLabel || (isPromotionBooking ? promotionTitle || 'Promo' : bookingLabel);
  const [primaryLabel, secondaryLabel] = String(agendaLabel).split(' / ');

  return (
    <div
      className={`agenda-booking-item${compact ? ' agenda-booking-item-compact' : ''}${isPromotionBooking ? ' agenda-booking-item-promotion' : ''}`}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseEnter={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const hasRightSpace = window.innerWidth - bounds.right >= POPOVER_WIDTH + POPOVER_GAP + POPOVER_MARGIN;
        const rawLeft = hasRightSpace
          ? bounds.right + POPOVER_GAP
          : bounds.left - POPOVER_WIDTH - POPOVER_GAP;
        const maxLeft = window.innerWidth - POPOVER_WIDTH - POPOVER_MARGIN;

        setPopoverPosition({
          top: bounds.top + bounds.height / 2,
          left: Math.max(POPOVER_MARGIN, Math.min(rawLeft, maxLeft))
        });
        setIsHovered(true);
      }}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: isPromotionBooking ? '#e2e8f0' : '#f8fafc',
        color: '#334155',
        border: `1px solid ${isPromotionBooking ? '#94a3b8' : '#cbd5e1'}`,
        borderRadius: 2,
        padding: compact ? (canCancel || isClosed ? '5px 27px 5px 29px' : '5px 8px 5px 29px') : (canCancel || isClosed ? '3px 27px 3px 25px' : '3px 8px 3px 25px'),
        fontSize: compact ? 11 : 10,
        marginBottom: 1,
        position: 'relative',
        zIndex: isHovered ? 20 : 1,
        overflow: 'visible',
        minHeight: compact ? 38 : 34,
        display: 'flex',
        flexDirection: compact ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <span
        className="agenda-booking-icon"
        style={{
          position: 'absolute',
          left: 4,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'inline-flex'
        }}
      >
        <ActivityIcon service={service} size="tiny" variant="agenda" />
      </span>
      <span
        className="agenda-booking-label"
        style={{
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          maxWidth: '100%',
          overflow: 'hidden',
          textAlign: 'center',
          whiteSpace: 'normal',
          lineHeight: 1.08
        }}
      >
        <span className="agenda-booking-label-primary">{primaryLabel}</span>
        {secondaryLabel && <span className="agenda-booking-label-secondary">{secondaryLabel}</span>}
      </span>

      {canCancel && (
        <button
          className="agenda-booking-cancel"
          type="button"
          title="Cancelar turno"
          aria-label="Cancelar turno"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onCancel?.(booking);
          }}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 24,
            height: '100%',
            border: 'none',
            borderRadius: 0,
            padding: 0,
            background: '#cbd5e1',
            color: '#334155',
            cursor: 'pointer',
            lineHeight: 1,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          🗑
        </button>
      )}

      {!canCancel && isClosed && (
        <span
          className="agenda-booking-lock"
          title="Turno cerrado"
          aria-label="Turno cerrado"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 24,
            height: '100%',
            borderRadius: 0,
            background: '#e2e8f0',
            color: '#475569',
            lineHeight: 1,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          🔒
        </span>
      )}

      {isHovered && canShowDetails && (
        <div className="agenda-detail-popover" style={{ top: popoverPosition.top, left: popoverPosition.left }}>
          <div className="agenda-detail-header">Detalle</div>
          <div className="agenda-detail-body">
            <div className="agenda-detail-title"><ActivityIcon service={service} size="small" /> <b>{service?.name}</b></div>
            {booking.booking_description && <div>🏷 {booking.booking_description}</div>}
            {(employeeLabel || employee?.name) && <div>👤 {employeeLabel || employee.name}</div>}
            <div>🧍 {canViewCustomer ? customerDetail : customerLabel || 'Turno reservado'}</div>
            <div className="agenda-detail-time">
              ⏱ {startTime} - {endTime}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}