export const defaultCompanySlug = 'esteticatopbody';
export const platformAdminPath = 'plataforma';

const ignoredPathSegments = new Set(['', 'index.html']);

export const normalizeCompanySlug = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, '');

export const getCompanySlugFromLocation = (locationValue = window.location) => {
  const [firstSegment = ''] = String(locationValue.pathname || '')
    .split('/')
    .filter((segment) => !ignoredPathSegments.has(segment));

  if (normalizeCompanySlug(firstSegment) === platformAdminPath) {
    return null;
  }

  return normalizeCompanySlug(firstSegment) || null;
};

export const isPlatformAdminLocation = (locationValue = window.location) => {
  const [firstSegment = ''] = String(locationValue.pathname || '')
    .split('/')
    .filter((segment) => !ignoredPathSegments.has(segment));

  return normalizeCompanySlug(firstSegment) === platformAdminPath;
};

export const getCompanyPath = (slug = defaultCompanySlug) => `/${normalizeCompanySlug(slug) || defaultCompanySlug}`;
