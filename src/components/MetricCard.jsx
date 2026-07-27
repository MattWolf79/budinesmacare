/**
 * Tarjeta de métrica compartida entre Admin y Empleado.
 * La estética vive en la clase `.dashboard-metric-card` (src/index.css);
 * acá solo definimos la estructura. Solo cambia el contenido (props/children)
 * según el perfil.
 */
export default function MetricCard({ label, value, hint, variant, className = '', children }) {
  const classes = ['dashboard-metric-card'];
  if (variant) classes.push(`dashboard-metric-card--${variant}`);
  if (className) classes.push(className);

  return (
    <article className={classes.join(' ')}>
      {label != null && <span>{label}</span>}
      {value != null && <strong>{value}</strong>}
      {hint != null && <small>{hint}</small>}
      {children}
    </article>
  );
}
