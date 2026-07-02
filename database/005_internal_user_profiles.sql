-- Add internal usernames, personal profile fields and profile photos.
-- Run after 004_employee_availability_dates.sql on existing databases.

begin;

alter table public.employees
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists birth_date date,
  add column if not exists phone text,
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_locality text,
  add column if not exists photo_url text;

alter table public.internal_accounts
  add column if not exists username text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists birth_date date,
  add column if not exists phone text,
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_locality text,
  add column if not exists photo_url text;

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

alter table public.internal_registration_requests
  add column if not exists username text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists birth_date date,
  add column if not exists phone text,
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_locality text,
  add column if not exists photo_url text;

update public.internal_registration_requests
set username = coalesce(nullif(trim(username), ''), display_name),
    username_normalized = public.normalize_text(coalesce(nullif(trim(username), ''), display_name)),
    first_name = coalesce(first_name, split_part(display_name, ' ', 1)),
    last_name = coalesce(last_name, nullif(trim(substr(display_name, length(split_part(display_name, ' ', 1)) + 1)), ''))
where username is null or trim(username) = '';

alter table public.internal_registration_requests
  alter column username set not null;

alter table public.internal_registration_requests
  drop constraint if exists internal_registration_requests_username_chk;

alter table public.internal_registration_requests
  add constraint internal_registration_requests_username_chk check (username_normalized = public.normalize_text(username));

alter table public.internal_registration_requests
  drop constraint if exists internal_registration_requests_username_not_blank_chk;

alter table public.internal_registration_requests
  add constraint internal_registration_requests_username_not_blank_chk check (length(trim(username)) >= 3);

drop index if exists public.internal_accounts_role_username_uidx;
create unique index if not exists internal_accounts_username_uidx
  on public.internal_accounts(username_normalized);

create index if not exists internal_registration_requests_pending_username_idx
  on public.internal_registration_requests(username_normalized)
  where status = 'pending';

drop function if exists public.request_internal_registration(public.app_role, text, text, uuid);
drop function if exists public.request_internal_registration(public.app_role, text, text, text, date, text, text, text, text, text, text, uuid);
drop function if exists public.register_internal_account(public.app_role, text, text, uuid);
drop function if exists public.verify_internal_login(public.app_role, text, text);
drop function if exists public.list_internal_registration_requests(text);
drop function if exists public.approve_internal_registration(uuid, uuid);

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
  employee_id_value uuid default null
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
  clean_username text := trim(coalesce(username_value, ''));
  clean_first_name text := trim(coalesce(first_name_value, ''));
  clean_last_name text := trim(coalesce(last_name_value, ''));
  clean_display_name text := trim(concat_ws(' ', nullif(trim(coalesce(first_name_value, '')), ''), nullif(trim(coalesce(last_name_value, '')), '')));
  clean_password text := trim(coalesce(password_value, ''));
begin
  if account_role not in ('admin'::public.app_role, 'employee'::public.app_role) then
    raise exception 'Rol interno invalido.';
  end if;

  if length(clean_username) < 3 or clean_username !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'El usuario debe tener al menos 3 caracteres y solo puede usar letras, numeros, punto, guion o guion bajo.';
  end if;

  if length(clean_first_name) < 2 or length(clean_last_name) < 2 then
    raise exception 'Ingresá nombre y apellido.';
  end if;

  if birth_date_value is null or birth_date_value > current_date then
    raise exception 'La fecha de nacimiento es invalida.';
  end if;

  if length(clean_password) < 6 or clean_password !~ '^[A-Za-z0-9]+$' then
    raise exception 'La contraseña debe ser alfanumerica y tener al menos 6 caracteres.';
  end if;

  if exists (select 1 from public.internal_accounts accounts where accounts.username_normalized = public.normalize_text(clean_username)) then
    raise exception 'Ya existe una cuenta interna con ese usuario.';
  end if;

  if exists (select 1 from public.internal_registration_requests requests where requests.status = 'pending' and requests.username_normalized = public.normalize_text(clean_username)) then
    raise exception 'Ya existe una solicitud pendiente con ese usuario.';
  end if;

  return query
  insert into public.internal_registration_requests (
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
    employee_id
  )
  values (
    account_role,
    clean_username,
    clean_display_name,
    clean_first_name,
    clean_last_name,
    birth_date_value,
    nullif(trim(coalesce(phone_value, '')), ''),
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
  employee_id uuid
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
    raise exception 'Usuario o contraseña invalidos.';
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
    account_record.employee_id;
end;
$$;

create or replace function public.list_internal_registration_requests(status_value text default null)
returns table (
  id uuid,
  role public.app_role,
  username text,
  display_name text,
  first_name text,
  last_name text,
  birth_date date,
  phone text,
  address_street text,
  address_number text,
  address_locality text,
  photo_url text,
  employee_id uuid,
  status text,
  created_at timestamp without time zone,
  reviewed_at timestamp without time zone
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver solicitudes de acceso.';
  end if;

  return query
  select
    requests.id,
    requests.role,
    requests.username,
    requests.display_name,
    requests.first_name,
    requests.last_name,
    requests.birth_date,
    requests.phone,
    requests.address_street,
    requests.address_number,
    requests.address_locality,
    requests.photo_url,
    requests.employee_id,
    requests.status,
    requests.created_at,
    requests.reviewed_at
  from public.internal_registration_requests requests
  where status_value is null or requests.status = status_value
  order by
    case requests.status when 'pending' then 0 when 'approved' then 1 else 2 end,
    requests.created_at desc;
end;
$$;

create or replace function public.approve_internal_registration(
  request_id_value uuid,
  employee_id_value uuid default null
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
  request_record public.internal_registration_requests%rowtype;
  target_employee_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede aprobar solicitudes de acceso.';
  end if;

  select *
  into request_record
  from public.internal_registration_requests
  where internal_registration_requests.id = request_id_value
  for update;

  if request_record.id is null then
    raise exception 'La solicitud no existe.';
  end if;

  if request_record.status <> 'pending' then
    raise exception 'La solicitud ya fue revisada.';
  end if;

  target_employee_id := coalesce(employee_id_value, request_record.employee_id);

  if request_record.role = 'employee'::public.app_role and target_employee_id is null then
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
      active
    )
    values (
      request_record.display_name,
      request_record.first_name,
      request_record.last_name,
      request_record.birth_date,
      request_record.phone,
      request_record.address_street,
      request_record.address_number,
      request_record.address_locality,
      request_record.photo_url,
      true
    )
    returning employees.id into target_employee_id;
  end if;

  if exists (
    select 1
    from public.internal_accounts accounts
    where accounts.username_normalized = request_record.username_normalized
  ) then
    raise exception 'Ya existe una cuenta interna con ese usuario.';
  end if;

  return query
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
    employee_id
  )
  values (
    request_record.role,
    request_record.username,
    request_record.display_name,
    request_record.first_name,
    request_record.last_name,
    request_record.birth_date,
    request_record.phone,
    request_record.address_street,
    request_record.address_number,
    request_record.address_locality,
    request_record.photo_url,
    request_record.username_normalized,
    request_record.password_hash,
    target_employee_id
  )
  returning
    internal_accounts.id,
    internal_accounts.role,
    internal_accounts.username,
    internal_accounts.display_name,
    internal_accounts.photo_url,
    internal_accounts.employee_id;

  update public.internal_registration_requests
  set status = 'approved',
      employee_id = target_employee_id,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where internal_registration_requests.id = request_record.id;
end;
$$;

grant execute on function public.verify_internal_login(public.app_role, text, text) to anon, authenticated;
grant execute on function public.request_internal_registration(public.app_role, text, text, text, date, text, text, text, text, text, text, uuid) to anon, authenticated;
grant execute on function public.list_internal_registration_requests(text) to authenticated;
grant execute on function public.approve_internal_registration(uuid, uuid) to authenticated;

commit;
