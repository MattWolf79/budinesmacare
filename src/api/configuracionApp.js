import { supabase } from './supabaseClient';

// La RPC get_app_configuration devuelve un payload pesado (banners, fondo de
// bienvenida y promociones en base64). En un mismo montaje de pantalla suele
// pedirse dos o tres veces (RoleAccess + ClientDashboard/EmployeeDashboard,
// Dashboard + AdminPanel, etc.), duplicando el egress.
//
// Esta caché de corta vida colapsa esas llamadas casi simultáneas en una sola
// petición de red, sin ocultar cambios reales: se invalida al guardar la
// configuración (mismo tab u otra pestaña) y admite forzar una recarga fresca.

const cacheConfiguracion = new Map(); // companySlug -> { promesa, expira }
const TIEMPO_VIDA_MS = 8000;

export function invalidarConfiguracionApp(companySlug) {
  if (companySlug) {
    cacheConfiguracion.delete(companySlug);
  } else {
    cacheConfiguracion.clear();
  }
}

export function obtenerConfiguracionApp(companySlug, { forzar = false } = {}) {
  const ahora = Date.now();
  const entrada = cacheConfiguracion.get(companySlug);

  if (!forzar && entrada && entrada.expira > ahora) {
    return entrada.promesa;
  }

  const promesa = supabase
    .rpc('get_app_configuration', { company_slug_value: companySlug })
    .then((respuesta) => {
      // No cacheamos respuestas con error para permitir un reintento inmediato.
      if (respuesta?.error) cacheConfiguracion.delete(companySlug);
      return respuesta;
    })
    .catch((error) => {
      cacheConfiguracion.delete(companySlug);
      throw error;
    });

  cacheConfiguracion.set(companySlug, { promesa, expira: ahora + TIEMPO_VIDA_MS });
  return promesa;
}

if (typeof window !== 'undefined') {
  window.addEventListener('turnos-app-configuration-saved', () => invalidarConfiguracionApp());
  window.addEventListener('storage', (event) => {
    if (event.key === 'turnos_app_configuration_updated_at') invalidarConfiguracionApp();
  });
}
