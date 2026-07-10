export const formatDisplayDate = (value, options = {}) => {
  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options
  }).format(date);
};

export const formatDisplayDateTime = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  return `${formatDisplayDate(date)} ${time}`;
};