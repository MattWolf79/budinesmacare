-- Regenerate employee usernames when admin edits first name or last name.
-- Run after 055_fix_approve_internal_registration_ambiguity.sql.

begin;

create or replace function public.update_admin_employee(
  employee_id_value uuid,
  name_value text,
  first_name_value text default null,
  last_name_value text default null,
  birth_date_value date default null,
  phone_value text default null,
  address_street_value text default null,
  address_number_value text default null,
  address_locality_value text default null,
  photo_url_value text default null,
  code_value text default null,
  active_value boolean default true,
  is_admin_value boolean default false,
  service_ids_value text[] default array[]::text[],
  account_id_value uuid default null,
  session_token_value text default null,
  email_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  admin_account public.internal_accounts%rowtype;
  updated_employee jsonb;
  saved_employee public.employees%rowtype;
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
  clean_first_name text := nullif(trim(coalesce(first_name_value, '')), '');
  clean_last_name text := nullif(trim(coalesce(last_name_value, '')), '');
  base_username text;
  candidate_username text;
  suffix integer := -1;
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null then
    raise exception 'La empresa no está disponible.';
  end if;

  if admin_account.company_id is distinct from target_company_id then
    raise exception 'No podés administrar otra empresa.';
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'Ingresá un mail válido para el empleado.';
  end if;

  if clean_first_name is null or clean_last_name is null then
    raise exception 'Ingresá nombre y apellido para generar el usuario.';
  end if;

  if not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.company_id = target_company_id
      and employees.deleted_at is null
  ) then
    raise exception 'El empleado no pertenece a esta empresa.';
  end if;

  base_username := regexp_replace(
    substring(public.normalize_text(clean_first_name) from 1 for 1) || public.normalize_text(clean_last_name),
    '[^a-z0-9]+',
    '',
    'g'
  );

  if length(base_username) < 3 then
    raise exception 'No se pudo generar un usuario valido con ese nombre y apellido.';
  end if;

  candidate_username := base_username;

  while exists (
    select 1
    from public.internal_accounts accounts
    where accounts.company_id = target_company_id
      and accounts.employee_id is distinct from employee_id_value
      and accounts.username_normalized = public.normalize_text(candidate_username)
  ) or exists (
    select 1
    from public.internal_registration_requests requests
    where requests.company_id = target_company_id
      and requests.status = 'pending'
      and requests.employee_id is distinct from employee_id_value
      and requests.username_normalized = public.normalize_text(candidate_username)
  ) or exists (
    select 1
    from public.employees employees
    where employees.company_id = target_company_id
      and employees.id <> employee_id_value
      and public.normalize_text(employees.name) = public.normalize_text(candidate_username)
  ) loop
    suffix := suffix + 1;
    candidate_username := base_username || lpad(suffix::text, 2, '0');
  end loop;

  updated_employee := public.update_admin_employee_legacy(
    employee_id_value,
    candidate_username,
    clean_first_name,
    clean_last_name,
    birth_date_value,
    phone_value,
    address_street_value,
    address_number_value,
    address_locality_value,
    photo_url_value,
    code_value,
    active_value,
    is_admin_value,
    service_ids_value,
    account_id_value
  );

  update public.employees employees
  set name = candidate_username,
      email = clean_email,
      company_id = target_company_id,
      updated_at = now()
  where employees.id = employee_id_value
  returning * into saved_employee;

  update public.internal_accounts accounts
  set username = candidate_username,
      username_normalized = public.normalize_text(candidate_username),
      company_id = target_company_id,
      updated_at = now()
  where accounts.employee_id = employee_id_value;

  update public.employee_services relations
  set company_id = target_company_id
  where relations.employee_id = employee_id_value;

  return to_jsonb(saved_employee) || jsonb_build_object(
    'is_admin', is_admin_value,
    'internal_username', coalesce(updated_employee ->> 'internal_username', candidate_username)
  );
end;
$$;

revoke execute on function public.update_admin_employee(uuid, text, text, text, date, text, text, text, text, text, text, boolean, boolean, text[], uuid, text, text, text) from public;
grant execute on function public.update_admin_employee(uuid, text, text, text, date, text, text, text, text, text, text, boolean, boolean, text[], uuid, text, text, text) to anon, authenticated;

commit;