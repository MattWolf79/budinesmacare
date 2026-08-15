export const defaultCompanySlug = 'esteticatopbody';

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

export const normalizeCompanySlug = (
  value
) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');

export const getCompanySlugFromLocation = (
  locationValue = window.location
) => {
  const [
    firstSegment = ''
  ] =
    getPathSegments(
      locationValue
    );

  if (
    normalizeCompanySlug(
      firstSegment
    ) === platformAdminPath
  ) {
    return null;
  }

  return (
    normalizeCompanySlug(
      firstSegment
    ) || null
  );
};

export const isPlatformAdminLocation = (
  locationValue = window.location
) => {
  const [
    firstSegment = ''
  ] =
    getPathSegments(
      locationValue
    );

  return (
    normalizeCompanySlug(
      firstSegment
    ) === platformAdminPath
  );
};

export const getCompanyPortalFromLocation = (
  locationValue = window.location
) => {
  const [
    firstSegment = '',
    secondSegment = ''
  ] =
    getPathSegments(
      locationValue
    );

  if (
    !firstSegment ||
    normalizeCompanySlug(
      firstSegment
    ) === platformAdminPath
  ) {
    return null;
  }

  const normalizedPortal =
    normalizeCompanySlug(
      secondSegment
    );

  if (
    normalizedPortal ===
    clientPortalPath
  ) {
    return 'client';
  }

  if (
    normalizedPortal ===
    adminPortalPath
  ) {
    return 'admin';
  }

  if (
    normalizedPortal ===
    employeePortalPath
  ) {
    return 'employee';
  }

  return 'root';
};

export const getCompanyPath = (
  slug = defaultCompanySlug
) =>
  `/${
    normalizeCompanySlug(slug) ||
    defaultCompanySlug
  }`;

export const getClientPortalPath = (
  slug = defaultCompanySlug
) =>
  `${getCompanyPath(slug)}/${clientPortalPath}`;

export const getAdminPortalPath = (
  slug = defaultCompanySlug
) =>
  `${getCompanyPath(slug)}/${adminPortalPath}`;

export const getEmployeePortalPath = (
  slug = defaultCompanySlug
) =>
  `${getCompanyPath(slug)}/${employeePortalPath}`;