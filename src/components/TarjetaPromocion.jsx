const obtenerTextoPrecio = (promocion) => String(promocion?.value || '').trim();

export default function TarjetaPromocion({ promocion, preciosHabilitados = true, onReservar }) {
  const tieneImagen = Boolean(promocion?.imageDataUrl);
  const titulo = String(promocion?.title || '').trim() || 'Promoción';
  const descripcion = String(promocion?.description || '').trim();
  const precioTexto = obtenerTextoPrecio(promocion);
  const usarOverlay = preciosHabilitados && tieneImagen;
  const soloImagen = !preciosHabilitados && tieneImagen;

  return (
    <article
      className={`tarjeta-promocion ${tieneImagen ? 'tiene-imagen' : ''} ${usarOverlay ? 'usa-superposicion' : ''} ${soloImagen ? 'solo-imagen' : ''}`.trim()}
      style={tieneImagen ? { '--imagen-promocion': `url(${promocion.imageDataUrl})` } : undefined}
    >
      {soloImagen ? (
        <div className="tarjeta-promocion-imagen" role="img" aria-label={titulo} />
      ) : (
        <div className="tarjeta-promocion-contenido">
          <div className="tarjeta-promocion-encabezado">
            <strong>{titulo}</strong>
          </div>

          {descripcion && (
            <div className="tarjeta-promocion-campo">
              <span>Detalle</span>
              <p>{descripcion}</p>
            </div>
          )}

          {preciosHabilitados && precioTexto && (
            <div className="tarjeta-promocion-campo tarjeta-promocion-precio">
              <span>Precio</span>
              <p>{precioTexto}</p>
            </div>
          )}
        </div>
      )}

      <button className="client-welcome-action tarjeta-promocion-accion" type="button" onClick={() => onReservar?.(promocion)}>
        Reservar turno
      </button>
    </article>
  );
}
