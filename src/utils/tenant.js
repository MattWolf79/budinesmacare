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