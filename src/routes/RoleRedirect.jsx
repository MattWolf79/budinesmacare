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
  if (!user) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  switch (user.role) {
    case 'admin':
      return (
        <Navigate
          to={getAdminPortalPath(
            companySlug
          )}
          replace
        />
      );

    case 'employee':
      return (
        <Navigate
          to={getEmployeePortalPath(
            companySlug
          )}
          replace
        />
      );

    case 'client':
      return (
        <Navigate
          to={getClientPortalPath(
            companySlug
          )}
          replace
        />
      );

    default:
      return (
        <Navigate
          to="/"
          replace
        />
      );
  }
}