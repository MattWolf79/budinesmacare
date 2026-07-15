export const defaultCompanySlug = 'esteticatopbody';
export const platformAdminPath = 'plataforma';
export const clientPortalPath = 'sacarturno';
export const internalPortalPath = 'admin';

const ignoredPathSegments = new Set(['', 'index.html']);

const getPathSegments = (locationValue = window.location) => String(locationValue.pathname || '')
  .split('/')
  .filter((segment) => !ignoredPathSegments.has(segment));

export const normalizeCompanySlug = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, '');

export const getCompanySlugFromLocation = (locationValue = window.location) => {
  const [firstSegment = ''] = getPathSegments(locationValue);

  if (normalizeCompanySlug(firstSegment) === platformAdminPath) {
    return null;
  }

  return normalizeCompanySlug(firstSegment) || null;
};

export const isPlatformAdminLocation = (locationValue = window.location) => {
  const [firstSegment = ''] = getPathSegments(locationValue);

  return normalizeCompanySlug(firstSegment) === platformAdminPath;
};

export const getCompanyPortalFromLocation = (locationValue = window.location) => {
  const [firstSegment = '', secondSegment = ''] = getPathSegments(locationValue);

  if (!firstSegment || normalizeCompanySlug(firstSegment) === platformAdminPath) {
    return null;
  }

  const normalizedPortal = normalizeCompanySlug(secondSegment);

  if (normalizedPortal === clientPortalPath) return 'client';
  if (normalizedPortal === internalPortalPath) return 'internal';

  return 'root';
};

export const getCompanyPath = (slug = defaultCompanySlug) => `/${normalizeCompanySlug(slug) || defaultCompanySlug}`;
export const getClientPortalPath = (slug = defaultCompanySlug) => `${getCompanyPath(slug)}/${clientPortalPath}`;
export const getInternalPortalPath = (slug = defaultCompanySlug) => `${getCompanyPath(slug)}/${internalPortalPath}`;
