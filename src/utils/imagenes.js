// Redimensiona y comprime una imagen en el navegador antes de guardarla como dataURL.
// Objetivo: bajar el peso almacenado en base64 (y por ende el egress de cada carga).

const leerArchivoComoDataUrl = (archivo) => new Promise((resolve, reject) => {
  const lector = new FileReader();
  lector.onload = () => resolve(String(lector.result || ''));
  lector.onerror = () => reject(new Error('No se pudo leer la imagen.'));
  lector.readAsDataURL(archivo);
});

const cargarImagen = (fuente) => new Promise((resolve, reject) => {
  const imagen = new Image();
  imagen.onload = () => resolve(imagen);
  imagen.onerror = () => reject(new Error('No se pudo procesar la imagen.'));
  imagen.src = fuente;
});

// Comprime un File a dataURL. Mantiene la relación de aspecto y limita el lado mayor.
// - ladoMaximo: px del lado más largo (default 1280)
// - calidad: 0..1 para JPEG/WebP (default 0.72)
// - conservarTransparencia: si el origen es PNG/WebP con alfa, mantiene PNG (sin pérdida de canal alfa)
export const comprimirImagen = async (archivo, opciones = {}) => {
  const {
    ladoMaximo = 1280,
    calidad = 0.72,
    conservarTransparencia = false
  } = opciones;

  const dataUrlOriginal = await leerArchivoComoDataUrl(archivo);

  // Los SVG no se rasterizan (ya son livianos); se devuelven tal cual.
  if (String(archivo.type || '').includes('svg')) {
    return dataUrlOriginal;
  }

  let imagen;
  try {
    imagen = await cargarImagen(dataUrlOriginal);
  } catch {
    return dataUrlOriginal;
  }

  const anchoOriginal = imagen.naturalWidth || imagen.width;
  const altoOriginal = imagen.naturalHeight || imagen.height;

  if (!anchoOriginal || !altoOriginal) {
    return dataUrlOriginal;
  }

  const escala = Math.min(1, ladoMaximo / Math.max(anchoOriginal, altoOriginal));
  const anchoDestino = Math.max(1, Math.round(anchoOriginal * escala));
  const altoDestino = Math.max(1, Math.round(altoOriginal * escala));

  const lienzo = document.createElement('canvas');
  lienzo.width = anchoDestino;
  lienzo.height = altoDestino;

  const contexto = lienzo.getContext('2d');
  if (!contexto) {
    return dataUrlOriginal;
  }

  contexto.drawImage(imagen, 0, 0, anchoDestino, altoDestino);

  const usarPng = conservarTransparencia
    && (String(archivo.type || '').includes('png') || String(archivo.type || '').includes('webp'));
  const tipoSalida = usarPng ? 'image/png' : 'image/jpeg';
  const dataUrlComprimida = usarPng
    ? lienzo.toDataURL(tipoSalida)
    : lienzo.toDataURL(tipoSalida, calidad);

  // Si por algún motivo la versión comprimida quedó más pesada, se usa la original.
  if (dataUrlComprimida.length >= dataUrlOriginal.length) {
    return dataUrlOriginal;
  }

  return dataUrlComprimida;
};

export default comprimirImagen;
