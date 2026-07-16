-- Regenerate a free username when approving an internal registration request.
-- Run after 057_email_welcome_background_public_url.sql.

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
  request_record public.internal_registration_requests%rowtype;
  admin_account public.internal_accounts%rowtype;
  base_username text;
  candidate_username text;
  suffix integer := -1;
begin
  if not public.is_admin() then
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  select *
  into request_record
  from public.internal_registration_requests requests
  where requests.id = request_id_value
  for update;

  if request_record.id is null then
    raise exception 'La solicitud no existe.';
  end if;

  if request_record.status <> 'pending' then
    raise exception 'La solicitud ya fue revisada.';
  end if;

  if request_record.company_id is null then
    raise exception 'La solicitud no tiene empresa asociada.';
  end if;

  if admin_account.id is not null and admin_account.company_id is distinct from request_record.company_id then
    raise exception 'No podés aprobar solicitudes de otra empresa.';
  end if;

  if employee_id_value is not null and not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.company_id = request_record.company_id
      and employees.deleted_at is null
  ) then
    raise exception 'El empleado seleccionado no pertenece a esta empresa.';
  end if;

  base_username := regexp_replace(
    substring(public.normalize_text(coalesce(request_record.first_name, '')) from 1 for 1) || public.normalize_text(coalesce(request_record.last_name, '')),
    '[^a-z0-9]+',
    '',
    'g'
  );

  if length(coalesce(base_username, '')) < 3 then
    base_username := regexp_replace(public.normalize_text(coalesce(request_record.username, 'usuario')), '[^a-z0-9]+', '', 'g');
  end if;

  if length(coalesce(base_username, '')) < 3 then
    base_username := 'usuario';
  end if;

  candidate_username := coalesce(nullif(trim(request_record.username), ''), base_username);

  while exists (
    select 1
    from public.internal_accounts accounts
    where accounts.username_normalized = public.normalize_text(candidate_username)
  ) or exists (
    select 1
    from public.internal_registration_requests requests
    where requests.company_id = request_record.company_id
      and requests.id <> request_record.id
      and requests.status = 'pending'
      and requests.username_normalized = public.normalize_text(candidate_username)
  ) or exists (
    select 1
    from public.employees employees
    where employees.company_id = request_record.company_id
      and employees.deleted_at is null
      and public.normalize_text(employees.name) = public.normalize_text(candidate_username)
      and (employee_id_value is null or employees.id <> employee_id_value)
  ) loop
    suffix := suffix + 1;
    candidate_username := base_username || lpad(suffix::text, 2, '0');
  end loop;

  if public.normalize_text(candidate_username) <> request_record.username_normalized then
    update public.internal_registration_requests requests
    set username = candidate_username,
        username_normalized = public.normalize_text(candidate_username)
    where requests.id = request_record.id;
  end if;

  for approved_account in
    select * from public.approve_internal_registration_legacy(request_id_value, employee_id_value, account_id_value)
  loop
    update public.internal_accounts accounts
    set company_id = request_record.company_id,
        updated_at = now()
    where accounts.id = approved_account.id;

    if public.is_valid_email(request_record.email) and approved_account.employee_id is not null then
      update public.employees employees
      set company_id = request_record.company_id,
          email = lower(trim(request_record.email)),
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
