-- Admin-created employees get internal access with a default password.
-- Run after 006_delete_admin_employee.sql on existing databases.

begin;

alter table public.employees
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists birth_date date,
  add column if not exists phone text,
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_locality text,
  add column if not exists photo_url text,
  add column if not exists deleted_at timestamp without time zone,
  add column if not exists created_at timestamp without time zone not null default now(),
  add column if not exists updated_at timestamp without time zone not null default now();

alter table public.internal_accounts
  add column if not exists username text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists birth_date date,
  add column if not exists phone text,
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_locality text,
  add column if not exists photo_url text,
  add column if not exists must_change_password boolean not null default false;

update public.internal_accounts
set username = coalesce(nullif(trim(username), ''), display_name),
    username_normalized = public.normalize_text(coalesce(nullif(trim(username), ''), display_name)),
    first_name = coalesce(first_name, split_part(display_name, ' ', 1)),
    last_name = coalesce(last_name, nullif(trim(substr(display_name, length(split_part(display_name, ' ', 1)) + 1)), ''))
where username is null or trim(username) = '';

alter table public.internal_accounts
  alter column username set not null;

alter table public.internal_accounts
  drop constraint if exists internal_accounts_username_chk;

alter table public.internal_accounts
  add constraint internal_accounts_username_chk check (username_normalized = public.normalize_text(username));

alter table public.internal_accounts
  drop constraint if exists internal_accounts_username_not_blank_chk;

alter table public.internal_accounts
  add constraint internal_accounts_username_not_blank_chk check (length(trim(username)) >= 3);

drop function if exists public.verify_internal_login(public.app_role, text, text);
drop function if exists public.change_internal_password(uuid, text, text);
drop function if exists public.create_admin_employee(text, text, text, date, text, text, text, text, text, text, text[]);

create or replace function public.verify_internal_login(
  account_role public.app_role,
  username_value text,
  password_value text
)
returns table (
  id uuid,
  role public.app_role,
  username text,
  display_name text,
  first_name text,
  last_name text,
  photo_url text,
  employee_id uuid,
  must_change_password boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
begin
  select *
  into account_record
  from public.internal_accounts
  where internal_accounts.role = account_role
    and internal_accounts.username_normalized = public.normalize_text(username_value)
    and internal_accounts.active = true
  limit 1;

  if account_record.id is null or account_record.password_hash <> extensions.crypt(trim(coalesce(password_value, '')), account_record.password_hash) then
    raise exception 'Nombre o contraseña invalidos.';
  end if;

  update public.internal_accounts
  set last_login_at = now(), updated_at = now()
  where internal_accounts.id = account_record.id;

  return query
  select
    account_record.id,
    account_record.role,
    account_record.username,
    account_record.display_name,
    account_record.first_name,
    account_record.last_name,
    account_record.photo_url,
    account_record.employee_id,
    account_record.must_change_password;
end;
$$;

create or replace function public.change_internal_password(
  account_id_value uuid,
  current_password_value text,
  new_password_value text
)
returns table (
  id uuid,
  role public.app_role,
  username text,
  display_name text,
  first_name text,
  last_name text,
  photo_url text,
  employee_id uuid,
  must_change_password boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  clean_new_password text := trim(coalesce(new_password_value, ''));
begin
  select *
  into account_record
  from public.internal_accounts
  where internal_accounts.id = account_id_value
    and internal_accounts.active = true
  limit 1;

  if account_record.id is null or account_record.password_hash <> extensions.crypt(trim(coalesce(current_password_value, '')), account_record.password_hash) then
    raise exception 'La contraseña actual es invalida.';
  end if;

  if length(clean_new_password) < 6 or clean_new_password !~ '^[A-Za-z0-9]+$' then
    raise exception 'La nueva contraseña debe ser alfanumerica y tener al menos 6 caracteres.';
  end if;

  if account_record.password_hash = extensions.crypt(clean_new_password, account_record.password_hash) then
    raise exception 'La nueva contraseña debe ser distinta a la actual.';
  end if;

  update public.internal_accounts
  set password_hash = extensions.crypt(clean_new_password, extensions.gen_salt('bf')),
      must_change_password = false,
      updated_at = now()
  where internal_accounts.id = account_record.id
  returning * into account_record;

  return query
  select
    account_record.id,
    account_record.role,
    account_record.username,
    account_record.display_name,
    account_record.first_name,
    account_record.last_name,
    account_record.photo_url,
    account_record.employee_id,
    account_record.must_change_password;
end;
$$;

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
  service_ids_value text[] default array[]::text[]
)
returns table (
  id uuid,
  name text,
  first_name text,
  last_name text,
  birth_date date,
  phone text,
  address_street text,
  address_number text,
  address_locality text,
  photo_url text,
  code text,
  active boolean,
  deleted_at timestamp without time zone,
  created_at timestamp without time zone,
  updated_at timestamp without time zone,
  internal_username text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_first_name text := nullif(trim(coalesce(first_name_value, '')), '');
  clean_last_name text := nullif(trim(coalesce(last_name_value, '')), '');
  clean_display_name text := trim(concat_ws(' ', nullif(trim(coalesce(first_name_value, '')), ''), nullif(trim(coalesce(last_name_value, '')), '')));
  clean_code text := nullif(trim(coalesce(code_value, '')), '');
  saved_employee public.employees%rowtype;
  base_username text;
  candidate_username text;
  suffix integer := -1;
  service_id_value text;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede crear empleados.';
  end if;

  if clean_first_name is null or clean_last_name is null then
    raise exception 'Ingresá nombre y apellido para generar el usuario.';
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

  while exists (select 1 from public.internal_accounts accounts where accounts.username_normalized = public.normalize_text(candidate_username))
    or exists (select 1 from public.internal_registration_requests requests where requests.status = 'pending' and requests.username_normalized = public.normalize_text(candidate_username))
    or exists (select 1 from public.employees employees where public.normalize_text(employees.name) = public.normalize_text(candidate_username)) loop
    suffix := suffix + 1;
    candidate_username := base_username || lpad(suffix::text, 2, '0');
  end loop;

  insert into public.employees (
    name,
    first_name,
    last_name,
    birth_date,
    phone,
    address_street,
    address_number,
    address_locality,
    photo_url,
    code,
    active
  )
  values (
    candidate_username,
    clean_first_name,
    clean_last_name,
    birth_date_value,
    nullif(trim(coalesce(phone_value, '')), ''),
    nullif(trim(coalesce(address_street_value, '')), ''),
    nullif(trim(coalesce(address_number_value, '')), ''),
    nullif(trim(coalesce(address_locality_value, '')), ''),
    nullif(photo_url_value, ''),
    clean_code,
    true
  )
  returning * into saved_employee;

  insert into public.internal_accounts (
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
  )
  values (
    'employee'::public.app_role,
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
    insert into public.employee_services (employee_id, service_id)
    values (saved_employee.id, service_id_value::integer)
    on conflict do nothing;
  end loop;

  return query
  select
    saved_employee.id,
    saved_employee.name,
    saved_employee.first_name,
    saved_employee.last_name,
    saved_employee.birth_date,
    saved_employee.phone,
    saved_employee.address_street,
    saved_employee.address_number,
    saved_employee.address_locality,
    saved_employee.photo_url,
    saved_employee.code,
    saved_employee.active,
    saved_employee.deleted_at,
    saved_employee.created_at,
    saved_employee.updated_at,
    candidate_username;
end;
$$;

grant execute on function public.verify_internal_login(public.app_role, text, text) to anon, authenticated;
grant execute on function public.change_internal_password(uuid, text, text) to anon, authenticated;
grant execute on function public.create_admin_employee(text, text, text, date, text, text, text, text, text, text, text[]) to authenticated;

commit;