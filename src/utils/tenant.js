export const platformAdminPath = 'plataforma';

export const clientPortalPath = 'sacarturno';
export const adminPortalPath = 'admin';
export const employeePortalPath = 'empleado';

const ignoredPathSegments = new Set([
  '',
  'index.html'
]);

const getPathSegments = (
  locationValue = window.location
) =>
  String(
    locationValue.pathname || ''
  )
    .split('/')
    .filter(
      (segment) =>
        !ignoredPathSegments.has(segment)
    );

/*
 * ============================================================
 * NORMALIZACIÓN
 * ============================================================
 *
 * El slug de una empresa debe representar solamente el
 * identificador de la empresa.
 *
 * Ejemplos:
 *
 * esteticatopbody
 * /esteticatopbody
 * esteticatopbody/
 * /esteticatopbody/
 *
 * Todos terminan normalizados como:
 *
 * esteticatopbody
 */

export const normalizeCompanySlug = (
  value
) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9-]/g, '');

/*
 * ============================================================
 * SLUG DE EMPRESA
 * ============================================================
 */

export const getCompanySlugFromLocation = (
  locationValue = window.location
) => {
  const [
    firstSegment = ''
  ] = getPathSegments(
    locationValue
  );

  const slug =
    normalizeCompanySlug(
      firstSegment
    );

  if (
    !slug ||
    slug === platformAdminPath
  ) {
    return null;
  }

  return slug;
};

/*
 * ============================================================
 * ADMINISTRADOR DE PLATAFORMA
 * ============================================================
 */

export const isPlatformAdminLocation = (
  locationValue = window.location
) => {
  const [
    firstSegment = ''
  ] = getPathSegments(
    locationValue
  );

  return (
    normalizeCompanySlug(
      firstSegment
    ) === platformAdminPath
  );
};

/*
 * ============================================================
 * PORTAL DE LA EMPRESA
 * ============================================================
 *
 * Ejemplos:
 *
 * /esteticatopbody
 *       -> root
 *
 * /esteticatopbody/admin
 *       -> admin
 *
 * /esteticatopbody/sacarturno
 *       -> client
 *
 * /esteticatopbody/empleado
 *       -> employee
 *
 * Las rutas posteriores al portal no cambian esta detección:
 *
 * /esteticatopbody/admin/agenda
 * /esteticatopbody/admin/clientes
 * /esteticatopbody/admin/configuracion
 *
 * Todas siguen perteneciendo al portal:
 *
 * admin
 */

export const getCompanyPortalFromLocation = (
  locationValue = window.location
) => {
  const [
    firstSegment = '',
    secondSegment = ''
  ] = getPathSegments(
    locationValue
  );

  const companySlug =
    normalizeCompanySlug(
      firstSegment
    );

  if (
    !companySlug ||
    companySlug === platformAdminPath
  ) {
    return null;
  }

  const portal =
    normalizeCompanySlug(
      secondSegment
    );

  if (
    portal === clientPortalPath
  ) {
    return 'client';
  }

  if (
    portal === adminPortalPath
  ) {
    return 'admin';
  }

  if (
    portal === employeePortalPath
  ) {
    return 'employee';
  }

  return 'root';
};

/*
 * ============================================================
 * RUTA BASE DE EMPRESA
 * ============================================================
 */

export const getCompanyPath = (
  companySlug
) => {
  const slug =
    normalizeCompanySlug(
      companySlug
    );

  if (!slug) {
    return null;
  }

  return `/${slug}`;
};

/*
 * ============================================================
 * PORTAL CLIENTE
 * ============================================================
 */

export const getClientPortalPath = (
  companySlug
) => {
  const base =
    getCompanyPath(
      companySlug
    );

  if (!base) {
    return null;
  }

  return `${base}/${clientPortalPath}`;
};

/*
 * ============================================================
 * PORTAL ADMINISTRADOR
 * ============================================================
 */

export const getAdminPortalPath = (
  companySlug
) => {
  const base =
    getCompanyPath(
      companySlug
    );

  if (!base) {
    return null;
  }

  return `${base}/${adminPortalPath}`;
};

/*
 * ============================================================
 * PORTAL EMPLEADO
 * ============================================================
 */

export const getEmployeePortalPath = (
  companySlug
) => {
  const base =
    getCompanyPath(
      companySlug
    );

  if (!base) {
    return null;
  }

  return `${base}/${employeePortalPath}`;
};