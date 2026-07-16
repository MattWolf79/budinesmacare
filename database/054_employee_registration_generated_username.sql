-- Generate internal registration usernames from first-name initial + last name.
-- Run after 053_tenant_branded_email_notifications.sql.

begin;

create or replace function public.request_internal_registration(
  account_role public.app_role,
  username_value text,
  first_name_value text,
  last_name_value text,
  birth_date_value date,
  phone_value text,
  password_value text,
  address_street_value text default null,
  address_number_value text default null,
  address_locality_value text default null,
  photo_url_value text default null,
  employee_id_value uuid default null,
  email_value text default null,
  company_slug_value text default null
)
returns table (
  id uuid,
  role public.app_role,
  username text,
  display_name text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  clean_username text;
  clean_first_name text := trim(coalesce(first_name_value, ''));
  clean_last_name text := trim(coalesce(last_name_value, ''));
  clean_display_name text := trim(concat_ws(' ', nullif(trim(coalesce(first_name_value, '')), ''), nullif(trim(coalesce(last_name_value, '')), '')));
  clean_password text := trim(coalesce(password_value, ''));
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
  base_username text;
  candidate_username text;
  suffix integer := -1;
begin
  if target_company_id is null then
    raise exception 'La empresa no está disponible.';
  end if;

  if account_role not in ('admin'::public.app_role, 'employee'::public.app_role) then
    raise exception 'Rol interno invalido.';
  end if;

  if length(clean_first_name) < 2 or length(clean_last_name) < 2 then
    raise exception 'Ingresá nombre y apellido.';
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
      and accounts.username_normalized = public.normalize_text(candidate_username)
  ) or exists (
    select 1
    from public.internal_registration_requests requests
    where requests.company_id = target_company_id
      and requests.status = 'pending'
      and requests.username_normalized = public.normalize_text(candidate_username)
  ) or exists (
    select 1
    from public.employees employees
    where employees.company_id = target_company_id
      and public.normalize_text(employees.name) = public.normalize_text(candidate_username)
  ) loop
    suffix := suffix + 1;
    candidate_username := base_username || lpad(suffix::text, 2, '0');
  end loop;

  clean_username := candidate_username;

  if birth_date_value is null or birth_date_value > current_date then
    raise exception 'La fecha de nacimiento es invalida.';
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'Ingresá un mail válido.';
  end if;

  if length(clean_password) < 6 or clean_password !~ '^[A-Za-z0-9]+$' then
    raise exception 'La contraseña debe ser alfanumerica y tener al menos 6 caracteres.';
  end if;

  if employee_id_value is not null and not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.company_id = target_company_id
      and employees.deleted_at is null
  ) then
    raise exception 'El empleado seleccionado no pertenece a esta empresa.';
  end if;

  return query
  insert into public.internal_registration_requests (
    company_id,
    role,
    username,
    display_name,
    first_name,
    last_name,
    birth_date,
    phone,
    email,
    address_street,
    address_number,
    address_locality,
    photo_url,
    username_normalized,
    password_hash,
    employee_id
  ) values (
    target_company_id,
    account_role,
    clean_username,
    clean_display_name,
    clean_first_name,
    clean_last_name,
    birth_date_value,
    nullif(trim(coalesce(phone_value, '')), ''),
    clean_email,
    nullif(trim(coalesce(address_street_value, '')), ''),
    nullif(trim(coalesce(address_number_value, '')), ''),
    nullif(trim(coalesce(address_locality_value, '')), ''),
    nullif(photo_url_value, ''),
    public.normalize_text(clean_username),
    extensions.crypt(clean_password, extensions.gen_salt('bf')),
    employee_id_value
  )
  returning
    internal_registration_requests.id,
    internal_registration_requests.role,
    internal_registration_requests.username,
    internal_registration_requests.display_name,
    internal_registration_requests.status;
end;
$$;

revoke execute on function public.request_internal_registration(public.app_role, text, text, text, date, text, text, text, text, text, text, uuid, text, text) from public;
grant execute on function public.request_internal_registration(public.app_role, text, text, text, date, text, text, text, text, text, text, uuid, text, text) to anon, authenticated;

commit;