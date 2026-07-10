const parseDateValue = (value) => {
  if (value instanceof Date) return value;

  const normalizedValue = String(value || '').trim();
  const match = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);

  if (match) {
    const [, year, month, day, hours = '00', minutes = '00', seconds = '00'] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds));
  }

  return new Date(value);
};

export const formatDisplayDate = (value, options = {}) => {
  const date = parseDateValue(value);

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options
  }).format(date);
};

export const formatDisplayDateTime = (value) => {
  const date = parseDateValue(value);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  return `${formatDisplayDate(date)} ${time}`;
};