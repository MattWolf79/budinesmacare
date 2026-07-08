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
  canShowDetails = true,
  canViewCustomer = true,
  customerLabel,
  displayLabel,
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
  const agendaLabel = displayLabel || bookingLabel;

  return (
    <div
      className={`agenda-booking-item${compact ? ' agenda-booking-item-compact' : ''}`}
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
        background: service?.color || '#999',
        color: 'white',
        borderRadius: compact ? 8 : 999,
        padding: compact ? (canCancel ? '6px 29px 6px 8px' : '6px 8px') : (canCancel ? '2px 30px 2px 27px' : '2px 8px 2px 27px'),
        fontSize: compact ? 11 : 10,
        marginBottom: 1,
        position: 'relative',
        zIndex: isHovered ? 20 : 1,
        overflow: 'visible',
        minHeight: compact ? 46 : 21,
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
          display: compact ? 'none' : 'inline-flex'
        }}
      >
        <ActivityIcon service={service} size="tiny" variant="agenda" />
      </span>
      <span
        className="agenda-booking-label"
        style={{
          display: compact ? '-webkit-box' : 'block',
          minWidth: 0,
          overflow: 'hidden',
          textAlign: 'center',
          textOverflow: 'ellipsis',
          whiteSpace: compact ? 'normal' : 'nowrap',
          WebkitBoxOrient: compact ? 'vertical' : undefined,
          WebkitLineClamp: compact ? 2 : undefined
        }}
      >
        {agendaLabel}
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
            width: 26,
            height: '100%',
            border: 'none',
            borderRadius: 0,
            padding: 0,
            background: 'rgba(42,42,42,0.78)',
            color: 'white',
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

      {isHovered && canShowDetails && (
        <div className="agenda-detail-popover" style={{ top: popoverPosition.top, left: popoverPosition.left }}>
          <div className="agenda-detail-header">Detalle</div>
          <div className="agenda-detail-body">
            <div className="agenda-detail-title"><ActivityIcon service={service} size="small" /> <b>{service?.name}</b></div>
            {employee?.name && <div>👤 {employee.name}</div>}
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