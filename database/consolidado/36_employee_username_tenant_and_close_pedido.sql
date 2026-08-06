-- Reafirma el alta de empleados aislada por empresa para evitar sufijos
-- heredados de otras empresas (ej. Turnos vs Pedidos). No cambia el modelo:
-- seguimos en una sola base multi-tenant con company_id/company_slug.

begin;

create or replace function public.create_admin_employee(
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
  service_ids_value text[] default array[]::text[],
  is_admin_value boolean default false,
  account_id_value uuid default null,
  session_token_value text default null,
  email_value text default null,
  company_slug_value text default null
)
returns table (
  id uuid,
  name text,
  first_name text,
  last_name text,
  birth_date date,
  phone text,
  email text,
  address_street text,
  address_number text,
  address_locality text,
  photo_url text,
  code text,
  active boolean,
  deleted_at timestamp without time zone,
  created_at timestamp without time zone,
  updated_at timestamp without time zone,
  internal_username text,
  is_admin boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  admin_account public.internal_accounts%rowtype;
  saved_employee public.employees%rowtype;
  clean_first_name text := nullif(trim(coalesce(first_name_value, '')), '');
  clean_last_name text := nullif(trim(coalesce(last_name_value, '')), '');
  clean_display_name text := trim(concat_ws(' ', nullif(trim(coalesce(first_name_value, '')), ''), nullif(trim(coalesce(last_name_value, '')), '')));
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
  clean_code text := nullif(trim(coalesce(code_value, '')), '');
  base_username text;
  candidate_username text;
  suffix integer := -1;
  service_id_value text;
  welcome_message text;
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null then
    raise exception 'La empresa no está disponible.';
  end if;

  if admin_account.company_id is distinct from target_company_id then
    raise exception 'No podés administrar otra empresa.';
  end if;

  if clean_first_name is null or clean_last_name is null then
    raise exception 'Ingresá nombre y apellido para generar el usuario.';
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'Ingresá un mail válido para el empleado.';
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

  insert into public.employees (
    company_id,
    name,
    first_name,
    last_name,
    birth_date,
    phone,
    email,
    address_street,
    address_number,
    address_locality,
    photo_url,
    code,
    active
  ) values (
    target_company_id,
    candidate_username,
    clean_first_name,
    clean_last_name,
    birth_date_value,
    nullif(trim(coalesce(phone_value, '')), ''),
    clean_email,
    nullif(trim(coalesce(address_street_value, '')), ''),
    nullif(trim(coalesce(address_number_value, '')), ''),
    nullif(trim(coalesce(address_locality_value, '')), ''),
    nullif(photo_url_value, ''),
    clean_code,
    true
  )
  returning * into saved_employee;

  insert into public.internal_accounts (
    company_id,
    role,
    username,
    display_name,
    first_name,
    last_name,
    birth_date,
    phone,
    address_street,
    address_number,
    address_locality,
    photo_url,
    username_normalized,
    password_hash,
    employee_id,
    active,
    must_change_password
  ) values (
    target_company_id,
    case when is_admin_value then 'admin'::public.app_role else 'employee'::public.app_role end,
    candidate_username,
    clean_display_name,
    clean_first_name,
    clean_last_name,
    birth_date_value,
    nullif(trim(coalesce(phone_value, '')), ''),
    nullif(trim(coalesce(address_street_value, '')), ''),
    nullif(trim(coalesce(address_number_value, '')), ''),
    nullif(trim(coalesce(address_locality_value, '')), ''),
    nullif(photo_url_value, ''),
    public.normalize_text(candidate_username),
    extensions.crypt('123456', extensions.gen_salt('bf')),
    saved_employee.id,
    true,
    true
  );

  foreach service_id_value in array coalesce(service_ids_value, array[]::text[]) loop
    insert into public.employee_services (company_id, employee_id, service_id)
    values (target_company_id, saved_employee.id, service_id_value::bigint)
    on conflict do nothing;
  end loop;

  welcome_message := concat_ws(E'\n',
    'Tu acceso interno fue creado.',
    'Usuario: ' || candidate_username,
    'Contraseña inicial: 123456',
    'Al ingresar se te va a pedir cambiar la contraseña.',
    'Este es un mensaje automático, no respondas este mail.'
  );

  perform public.send_resend_email(
    clean_email::text,
    'Tu acceso interno fue creado'::text,
    welcome_message::text,
    'Quiero Turno App - No responder'::text,
    null::text,
    null::text,
    target_company_id::uuid
  );

  return query
  select
    saved_employee.id,
    saved_employee.name,
    saved_employee.first_name,
    saved_employee.last_name,
    saved_employee.birth_date,
    saved_employee.phone,
    saved_employee.email,
    saved_employee.address_street,
    saved_employee.address_number,
    saved_employee.address_locality,
    saved_employee.photo_url,
    saved_employee.code,
    saved_employee.active,
    saved_employee.deleted_at,
    saved_employee.created_at,
    saved_employee.updated_at,
    candidate_username,
    is_admin_value;
end;
$$;

revoke execute on function public.create_admin_employee(text, text, text, date, text, text, text, text, text, text, text[], boolean, uuid, text, text, text) from public;
grant execute on function public.create_admin_employee(text, text, text, date, text, text, text, text, text, text, text[], boolean, uuid, text, text, text) to anon, authenticated;

commit;
