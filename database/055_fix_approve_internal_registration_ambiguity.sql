-- Fix ambiguous id reference when approving internal registration requests.
-- Run after 054_employee_registration_generated_username.sql.

begin;

create or replace function public.approve_internal_registration(
  request_id_value uuid,
  employee_id_value uuid default null,
  account_id_value uuid default null,
  session_token_value text default null
)
returns table (
  id uuid,
  role public.app_role,
  username text,
  display_name text,
  photo_url text,
  employee_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  approved_account record;
  request_company_id uuid;
  request_email text;
  admin_account public.internal_accounts%rowtype;
begin
  if not public.is_admin() then
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  select requests.company_id, requests.email
  into request_company_id, request_email
  from public.internal_registration_requests requests
  where requests.id = request_id_value;

  if request_company_id is null then
    raise exception 'La solicitud no tiene empresa asociada.';
  end if;

  if admin_account.id is not null and admin_account.company_id is distinct from request_company_id then
    raise exception 'No podés aprobar solicitudes de otra empresa.';
  end if;

  if employee_id_value is not null and not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.company_id = request_company_id
      and employees.deleted_at is null
  ) then
    raise exception 'El empleado seleccionado no pertenece a esta empresa.';
  end if;

  for approved_account in
    select * from public.approve_internal_registration_legacy(request_id_value, employee_id_value, account_id_value)
  loop
    update public.internal_accounts accounts
    set company_id = request_company_id,
        updated_at = now()
    where accounts.id = approved_account.id;

    if public.is_valid_email(request_email) and approved_account.employee_id is not null then
      update public.employees employees
      set company_id = request_company_id,
          email = lower(trim(request_email)),
          updated_at = now()
      where employees.id = approved_account.employee_id;
    end if;

    return query
    select
      approved_account.id,
      approved_account.role,
      approved_account.username,
      approved_account.display_name,
      approved_account.photo_url,
      approved_account.employee_id;
  end loop;
end;
$$;

revoke execute on function public.approve_internal_registration(uuid, uuid, uuid, text) from public;
grant execute on function public.approve_internal_registration(uuid, uuid, uuid, text) to anon, authenticated;

commit;