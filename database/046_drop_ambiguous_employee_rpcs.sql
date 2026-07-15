-- Drop legacy overloaded employee RPC signatures that confuse PostgREST named-argument resolution.
-- Run after 045_tenant_admin_employee_management.sql.

begin;

drop function if exists public.create_admin_employee(
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  boolean,
  uuid,
  text,
  text
);

drop function if exists public.update_admin_employee(
  uuid,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  text[],
  uuid,
  text,
  text
);

grant execute on function public.create_admin_employee(text, text, text, date, text, text, text, text, text, text, text[], boolean, uuid, text, text, text) to anon, authenticated;
grant execute on function public.update_admin_employee(uuid, text, text, text, date, text, text, text, text, text, text, boolean, boolean, text[], uuid, text, text, text) to anon, authenticated;

commit;
