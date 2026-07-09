const normalizeText = (value) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const getIconType = (service) => {
  const name = normalizeText(service?.name);

  if (name.includes('masaj')) return 'massage';
  if (name.includes('depil')) return 'depilation';
  if (name.includes('una') || name.includes('nail')) return 'nails';
  if (name.includes('peluq') || name.includes('hair')) return 'hair';
  return 'sparkle';
};

const getDisplayEmoji = (service) => {
  const icon = String(service?.icon || '').trim();
  if (icon === 'whatsapp' || icon === 'telegram') return null;
  return icon || null;
};

const iconPaths = {
  massage: (
    <>
      <path d="M7 14.5c2.4-3.4 4.6-5.2 6.7-5.2 1.1 0 1.9.7 1.9 1.7 0 .7-.4 1.3-1 1.6l-2.1 1.1" />
      <path d="M5.3 11.8 8 6.6c.4-.8 1.3-1.1 2.1-.7.7.4 1 1.2.7 1.9l-1.4 3" />
      <path d="M8.6 9.2 10.7 5c.4-.8 1.3-1.1 2.1-.7.7.4 1 1.2.7 1.9l-1.8 3.6" />
      <path d="M11.7 9.8 13 7.2c.4-.8 1.3-1.1 2-.7.8.4 1 1.3.7 2l-.7 1.4" />
      <path d="M5.4 12.1c-1 .8-1.5 1.9-1.2 3.1.5 2.2 2.4 3.6 5.1 3.6h2.1c2.2 0 4.3-1.1 5.5-2.9l1.7-2.6" />
    </>
  ),
  depilation: (
    <>
      <path d="M12 3.2c.8 2.4-.4 3.7-1.7 5.1-1.2 1.2-2.4 2.6-2.4 4.7 0 2.6 1.9 4.6 4.1 4.6s4.1-2 4.1-4.6c0-2.7-2.1-4.4-4.1-9.8Z" />
      <path d="M12.3 17.4c-1.3-.7-1.9-1.7-1.9-2.9 0-1.3.8-2.2 2.1-3.3.1 1.8 1.8 2.6 1.8 4 0 1-.7 1.8-2 2.2Z" />
    </>
  ),
  nails: (
    <>
      <path d="M6.5 16.7 16.7 6.5l.8.8L7.3 17.5l-2.6.8.8-2.6Z" />
      <path d="M14.8 4.7 17.3 2.2l2.5 2.5-2.5 2.5Z" />
      <path d="M5 10.1c2.7.2 4.9 2.3 5.1 5" />
      <path d="M3.6 13.2c1.6.1 2.9 1.4 3.1 3" />
    </>
  ),
  hair: (
    <>
      <path d="M6.2 6.2 17.8 17.8" />
      <path d="M17.8 6.2 6.2 17.8" />
      <circle cx="5.2" cy="5.2" r="2.2" />
      <circle cx="5.2" cy="18.8" r="2.2" />
      <path d="M9.8 12h4.4" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.5 13.9 9l5.6 2-5.6 2L12 18.5 10.1 13l-5.6-2 5.6-2Z" />
      <path d="M18 4.5v3" />
      <path d="M16.5 6h3" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M4.2 19.8 5.3 16.2a7.2 7.2 0 1 1 2.7 2.6Z" />
      <path d="M8.7 8.7c.2-.5.4-.6.8-.6h.5c.2 0 .4.1.5.4l.7 1.6c.1.3.1.5-.1.7l-.4.5c.6 1 1.4 1.8 2.5 2.4l.5-.5c.2-.2.4-.3.7-.1l1.6.7c.3.1.4.3.4.6v.5c0 .4-.2.7-.6.8-.6.2-1.4.1-2.2-.2-2.6-.9-4.6-2.9-5.5-5.5-.3-.8-.3-1.6-.1-2.2Z" />
    </>
  ),
  telegram: (
    <>
      <path d="M20 5.2 17.1 19c-.2.9-.8 1.1-1.5.7l-4.2-3.1-2 1.9c-.2.2-.4.4-.9.4l.3-4.3L16.7 7.5c.3-.3-.1-.5-.5-.2l-9.7 6.1-4.2-1.3c-.9-.3-.9-.9.2-1.3l16.3-6.3c.8-.3 1.4.2 1.2.7Z" />
    </>
  )
};

export default function ActivityIcon({ service, size = 'medium', variant = 'activity' }) {
  const customIcon = String(service?.icon || '').trim();
  const iconType = iconPaths[customIcon] ? customIcon : getIconType(service);
  const displayEmoji = getDisplayEmoji(service);
  const classes = [
    'activity-icon',
    `activity-icon-${size}`,
    `activity-icon-${variant}`,
    displayEmoji ? 'activity-icon-emoji' : ''
  ].filter(Boolean).join(' ');

  return (
    <span
      className={classes}
      style={{ '--activity-color': service?.color || '#3fc9d5' }}
      aria-hidden="true"
    >
      {displayEmoji ? (
        <span className="activity-icon-glyph">{displayEmoji}</span>
      ) : (
        <svg viewBox="0 0 24 24" focusable="false">
          {iconPaths[iconType]}
        </svg>
      )}
    </span>
  );
}
