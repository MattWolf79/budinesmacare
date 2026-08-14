export default function RoleRedirect({ user }) {

  if (!user) {
    return "/";
  }

  switch (user.role) {

    case "admin":
      return "/admin";

    case "employee":
      return "/employee";

    case "client":
      return "/client";

    default:
      return "/";
  }
}