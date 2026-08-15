import { Navigate } from 'react-router-dom';

import {
  getAdminPortalPath,
  getClientPortalPath,
  getEmployeePortalPath
} from '../utils/tenant';

export default function RoleRedirect({
  user,
  companySlug
}) {
  if (!user || !companySlug) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  let targetPath = null;

  switch (user.role) {
    case 'admin':
      targetPath =
        getAdminPortalPath(companySlug);
      break;

    case 'employee':
      targetPath =
        getEmployeePortalPath(companySlug);
      break;

    case 'client':
      targetPath =
        getClientPortalPath(companySlug);
      break;

    default:
      targetPath = `/${companySlug}`;
      break;
  }

  if (!targetPath) {
    return (
      <Navigate
        to={`/${companySlug}`}
        replace
      />
    );
  }

  return (
    <Navigate
      to={targetPath}
      replace
    />
  );
}