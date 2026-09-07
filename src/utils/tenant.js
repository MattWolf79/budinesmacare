export const defaultCompanySlug = 'budinesmacare';

export const clientPortalPath = 'pedidos';
export const adminPortalPath = 'admin';

export const normalizeCompanySlug = (
  value
) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');

export const getCompanySlugFromLocation = () => defaultCompanySlug;

export const getClientPortalPath = () =>
  `/${clientPortalPath}`;

export const getAdminPortalPath = () =>
  `/${adminPortalPath}`;