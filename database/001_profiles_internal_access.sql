-- Profiles, internal access and row-level security foundation for Turnos App.
-- Target: Supabase / PostgreSQL.
-- Run from Supabase SQL Editor. Review the BOOTSTRAP section before enabling strict admin use.

begin;

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- -----------------------------------------------------------------------------
-- Shared types and helpers
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'client', 'employee');
  end if;
end $$;

create or replace function public.normalize_text(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    lower(
      translate(
        trim(coalesce(value, '')),
        'áàäâãéèëêíìïîóòöôõúùüûñÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑ',
        'aaaaaeeeeiiiiooooouuuunAAAAAEEEEIIIIOOOOOUUUUN'
      )
    ),
    '\s+',
    ' ',
    'g'
  )
$$;

-- -----------------------------------------------------------------------------
-- Profiles for Supabase Auth users
-- Google clients enter through auth.users. By default they become clients.
-- Admin/employee can also be linked later to Supabase Auth if desired.
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  role public.app_role not null default 'client',
  display_name text,
  email text,
  employee_id uuid references public.employees(id) on delete set null,
  active boolean not null default true,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  constraint profiles_employee_role_link_chk check (
    (role = 'employee' and employee_id is not null)
    or (role <> 'employee')
  )
);

create index if not exists profiles_user_id_idx on public.profiles(user_id);
create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_employee_id_idx on public.profiles(employee_id);

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where user_id = auth.uid()
  limit 1
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin'::public.app_role, false)
$$;

create or replace function public.is_employee_for(employee_id_value uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and role = 'employee'::public.app_role
      and employee_id = employee_id_value
  )
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, role, display_name, email)
  values (
    new.id,
    'client'::public.app_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (user_id) do update
  set email = excluded.email,
      display_name = coalesce(public.profiles.display_name, excluded.display_name),
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Backfill profiles for existing Google/Supabase Auth users.
insert into public.profiles (user_id, role, display_name, email)
select
  users.id,
  'client'::public.app_role,
  coalesce(users.raw_user_meta_data ->> 'full_name', users.raw_user_meta_data ->> 'name', split_part(users.email, '@', 1)),
  users.email
from auth.users users
where not exists (
  select 1 from public.profiles profiles where profiles.user_id = users.id
);

-- BOOTSTRAP ADMIN EXAMPLE:
-- After your Google account exists in auth.users, run this once with your email.
-- update public.profiles
-- set role = 'admin', updated_at = now()
-- where email = 'tu-email@gmail.com';

-- -----------------------------------------------------------------------------
-- Internal accounts for Employee/Admin login UI
-- These are not exposed directly to the browser. Use RPC/Edge Functions later.
-- Passwords are stored as pgcrypto hashes, never as plain text.
-- -----------------------------------------------------------------------------

alter table public.employees
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists birth_date date,
  add column if not exists phone text,
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_locality text,
  add column if not exists photo_url text;

create table if not exists public.internal_accounts (
  id uuid primary key default gen_random_uuid(),
  role public.app_role not null,
  username text not null,
  display_name text not null,
  first_name text,
  last_name text,
  birth_date date,
  phone text,
  address_street text,
  address_number text,
  address_locality text,
  photo_url text,
  username_normalized text not null,
  password_hash text not null,
  employee_id uuid references public.employees(id) on delete set null,
  active boolean not null default true,
  last_login_at timestamp without time zone,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  constraint internal_accounts_role_chk check (role in ('admin'::public.app_role, 'employee'::public.app_role)),
  constraint internal_accounts_username_chk check (username_normalized = public.normalize_text(username)),
  constraint internal_accounts_username_not_blank_chk check (length(trim(username)) >= 3),
  constraint internal_accounts_password_hash_chk check (length(password_hash) > 20),
  constraint internal_accounts_employee_link_chk check (
    (role = 'employee' and employee_id is not null)
    or (role = 'admin')
  )
);

create unique index if not exists internal_accounts_username_uidx
  on public.internal_accounts(username_normalized);
create index if not exists internal_accounts_employee_id_idx
  on public.internal_accounts(employee_id);

create table if not exists public.internal_registration_requests (
  id uuid primary key default gen_random_uuid(),
  role public.app_role not null,
  username text not null,
  display_name text not null,
  first_name text,
  last_name text,
  birth_date date,
  phone text,
  address_street text,
  address_number text,
  address_locality text,
  photo_url text,
  username_normalized text not null,
  password_hash text not null,
  employee_id uuid references public.employees(id) on delete set null,
  status text not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamp without time zone,
  created_at timestamp without time zone not null default now(),
  constraint internal_registration_requests_role_chk check (role in ('admin'::public.app_role, 'employee'::public.app_role)),
  constraint internal_registration_requests_status_chk check (status in ('pending', 'approved', 'rejected')),
  constraint internal_registration_requests_username_chk check (username_normalized = public.normalize_text(username)),
  constraint internal_registration_requests_username_not_blank_chk check (length(trim(username)) >= 3),
  constraint internal_registration_requests_password_hash_chk check (length(password_hash) > 20)
);

create index if not exists internal_registration_requests_status_idx
  on public.internal_registration_requests(status, role);
create index if not exists internal_registration_requests_pending_username_idx
  on public.internal_registration_requests(username_normalized)
  where status = 'pending';
create index if not exists internal_registration_requests_employee_id_idx
  on public.internal_registration_requests(employee_id);

drop function if exists public.request_internal_registration(public.app_role, text, text, uuid);
drop function if exists public.request_internal_registration(public.app_role, text, text, text, date, text, text, text, text, text, text, uuid);
drop function if exists public.register_internal_account(public.app_role, text, text, uuid);
drop function if exists public.register_internal_account(public.app_role, text, text, text, text, date, text, text, text, text, text, uuid);
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

create or replace function public.register_internal_account(
  account_role public.app_role,
  username_value text,
  first_name_value text,
  last_name_value text,
  password_value text,
  birth_date_value date default null,
  phone_value text default null,
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
  photo_url text,
  employee_id uuid
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
  if not public.is_admin() then
    raise exception 'Solo un administrador puede crear accesos internos.';
  end if;

  if account_role not in ('admin'::public.app_role, 'employee'::public.app_role) then
    raise exception 'Rol interno invalido.';
  end if;

  if length(clean_username) < 3 or clean_username !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'El usuario debe tener al menos 3 caracteres y solo puede usar letras, numeros, punto, guion o guion bajo.';
  end if;

  if length(clean_first_name) < 2 or length(clean_last_name) < 2 then
    raise exception 'Ingresá nombre y apellido.';
  end if;

  if length(clean_password) < 6 or clean_password !~ '^[A-Za-z0-9]+$' then
    raise exception 'La contraseña debe ser alfanumerica y tener al menos 6 caracteres.';
  end if;

  if account_role = 'employee'::public.app_role and employee_id_value is null then
    raise exception 'El acceso de empleado debe vincularse a un empleado existente.';
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
    internal_accounts.id,
    internal_accounts.role,
    internal_accounts.username,
    internal_accounts.display_name,
    internal_accounts.photo_url,
    internal_accounts.employee_id;
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

create or replace function public.reject_internal_registration(request_id_value uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede rechazar solicitudes de acceso.';
  end if;

  update public.internal_registration_requests
  set status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where internal_registration_requests.id = request_id_value
    and internal_registration_requests.status = 'pending';

  if not found then
    raise exception 'La solicitud no existe o ya fue revisada.';
  end if;
end;
$$;

revoke all on public.internal_accounts from anon, authenticated;
revoke all on public.internal_registration_requests from anon, authenticated;
grant execute on function public.register_internal_account(public.app_role, text, text, text, text, date, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.list_internal_registration_requests(text) to authenticated;
grant execute on function public.approve_internal_registration(uuid, uuid) to authenticated;
grant execute on function public.reject_internal_registration(uuid) to authenticated;
grant execute on function public.verify_internal_login(public.app_role, text, text) to anon, authenticated;
grant execute on function public.request_internal_registration(public.app_role, text, text, text, date, text, text, text, text, text, text, uuid) to anon, authenticated;

-- NOTE: public self-registration should call request_internal_registration.
-- register_internal_account creates an active internal account and is restricted by default.

-- -----------------------------------------------------------------------------
-- Hardening current scheduling tables
-- Keeps local timestamp semantics: timestamp without time zone.
-- -----------------------------------------------------------------------------

alter table public.bookings
  add column if not exists created_at timestamp without time zone not null default now();

alter table public.bookings
  add column if not exists updated_at timestamp without time zone not null default now();

alter table public.bookings
  add column if not exists customer_name text;

alter table public.bookings
  alter column user_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_valid_range_chk') then
    alter table public.bookings
      add constraint bookings_valid_range_chk check (end_at > start_at) not valid;
  end if;
end $$;

alter table public.bookings validate constraint bookings_valid_range_chk;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_status_chk') then
    alter table public.bookings
      add constraint bookings_status_chk check (status in ('reserved', 'confirmed', 'cancelled')) not valid;
  end if;
end $$;

alter table public.bookings validate constraint bookings_status_chk;

alter table public.services
  add column if not exists name_normalized text;

create or replace function public.set_service_name_normalized()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name_normalized := public.normalize_text(new.name);
  return new;
end;
$$;

drop trigger if exists set_service_name_normalized_before_write on public.services;
create trigger set_service_name_normalized_before_write
before insert or update of name on public.services
for each row execute function public.set_service_name_normalized();

update public.services
set name_normalized = public.normalize_text(name)
where name_normalized is null or name_normalized <> public.normalize_text(name);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'services_name_normalized_chk') then
    alter table public.services
      add constraint services_name_normalized_chk check (name_normalized = public.normalize_text(name)) not valid;
  end if;
end $$;

alter table public.services validate constraint services_name_normalized_chk;

create unique index if not exists services_name_normalized_uidx
  on public.services(name_normalized);

create unique index if not exists employees_code_uidx
  on public.employees(code)
  where code is not null and trim(code) <> '';

create unique index if not exists employee_services_employee_service_uidx
  on public.employee_services(employee_id, service_id);

create index if not exists bookings_employee_range_idx
  on public.bookings(employee_id, start_at, end_at);
create index if not exists bookings_user_idx
  on public.bookings(user_id);
create index if not exists bookings_status_idx
  on public.bookings(status);
create index if not exists employee_services_service_idx
  on public.employee_services(service_id);

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.bookings to authenticated;
grant insert, update, delete on public.bookings to authenticated;
grant select on public.services to authenticated;
grant insert, update, delete on public.services to authenticated;
grant select on public.employees to authenticated;
grant insert, update, delete on public.employees to authenticated;
grant select on public.employee_services to authenticated;
grant insert, delete on public.employee_services to authenticated;

-- These constraints fail if existing overlapping data already exists.
-- If they fail, clean conflicting rows and rerun this block.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_employee_no_active_overlap_excl'
  ) then
    alter table public.bookings
      add constraint bookings_employee_no_active_overlap_excl
      exclude using gist (
        employee_id with =,
        tsrange(start_at, end_at, '[)') with &&
      )
      where (status in ('reserved', 'confirmed'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_user_no_active_overlap_excl'
  ) then
    alter table public.bookings
      add constraint bookings_user_no_active_overlap_excl
      exclude using gist (
        user_id with =,
        tsrange(start_at, end_at, '[)') with &&
      )
      where (user_id is not null and status in ('reserved', 'confirmed'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_customer_email_no_active_overlap_excl'
  ) then
    alter table public.bookings
      add constraint bookings_customer_email_no_active_overlap_excl
      exclude using gist (
        (public.normalize_text(user_email)) with =,
        tsrange(start_at, end_at, '[)') with &&
      )
      where (user_email is not null and trim(user_email) <> '' and status in ('reserved', 'confirmed'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- RLS policies
-- Current frontend still reads broad agenda data. These policies preserve that
-- while restricting writes to admins or own future bookings.
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.internal_accounts enable row level security;
alter table public.internal_registration_requests enable row level security;
alter table public.bookings enable row level security;
alter table public.services enable row level security;
alter table public.employees enable row level security;
alter table public.employee_services enable row level security;

-- Profiles

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own_basic_or_admin" on public.profiles;
create policy "profiles_update_own_basic_or_admin"
on public.profiles for update
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (
  public.is_admin()
  or (
    user_id = auth.uid()
    and role = (select role from public.profiles p where p.user_id = auth.uid())
  )
);

drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert"
on public.profiles for insert
to authenticated
with check (public.is_admin());

-- Internal accounts: no direct table access from browser roles.
drop policy if exists "internal_accounts_no_direct_select" on public.internal_accounts;
create policy "internal_accounts_no_direct_select"
on public.internal_accounts for select
to anon, authenticated
using (false);

drop policy if exists "internal_registration_requests_no_direct_select" on public.internal_registration_requests;
create policy "internal_registration_requests_no_direct_select"
on public.internal_registration_requests for select
to anon, authenticated
using (false);

-- Services

drop policy if exists "services_authenticated_read" on public.services;
create policy "services_authenticated_read"
on public.services for select
to authenticated
using (true);

drop policy if exists "services_admin_insert" on public.services;
create policy "services_admin_insert"
on public.services for insert
to authenticated
with check (public.is_admin());

drop policy if exists "services_admin_update" on public.services;
create policy "services_admin_update"
on public.services for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "services_admin_delete" on public.services;
create policy "services_admin_delete"
on public.services for delete
to authenticated
using (public.is_admin());

-- Employees

drop policy if exists "employees_authenticated_read" on public.employees;
create policy "employees_authenticated_read"
on public.employees for select
to authenticated
using (true);

drop policy if exists "employees_admin_insert" on public.employees;
create policy "employees_admin_insert"
on public.employees for insert
to authenticated
with check (public.is_admin());

drop policy if exists "employees_admin_update" on public.employees;
create policy "employees_admin_update"
on public.employees for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "employees_admin_delete" on public.employees;
create policy "employees_admin_delete"
on public.employees for delete
to authenticated
using (public.is_admin());

-- Employee-services relation

drop policy if exists "employee_services_authenticated_read" on public.employee_services;
create policy "employee_services_authenticated_read"
on public.employee_services for select
to authenticated
using (true);

drop policy if exists "employee_services_admin_insert" on public.employee_services;
create policy "employee_services_admin_insert"
on public.employee_services for insert
to authenticated
with check (public.is_admin());

drop policy if exists "employee_services_admin_delete" on public.employee_services;
create policy "employee_services_admin_delete"
on public.employee_services for delete
to authenticated
using (public.is_admin());

-- Bookings

drop policy if exists "bookings_authenticated_read" on public.bookings;
create policy "bookings_authenticated_read"
on public.bookings for select
to authenticated
using (true);

drop policy if exists "bookings_clients_insert_own_or_admin" on public.bookings;
create policy "bookings_clients_insert_own_or_admin"
on public.bookings for insert
to authenticated
with check (
  public.is_admin()
  or public.is_employee_for(employee_id)
  or user_id = auth.uid()
);

drop policy if exists "bookings_update_own_future_or_admin" on public.bookings;
create policy "bookings_update_own_future_or_admin"
on public.bookings for update
to authenticated
using (
  public.is_admin()
  or public.is_employee_for(employee_id)
  or (user_id = auth.uid() and start_at > localtimestamp)
)
with check (
  public.is_admin()
  or public.is_employee_for(employee_id)
  or user_id = auth.uid()
);

drop policy if exists "bookings_delete_own_future_or_admin" on public.bookings;
create policy "bookings_delete_own_future_or_admin"
on public.bookings for delete
to authenticated
using (
  public.is_admin()
  or public.is_employee_for(employee_id)
  or (user_id = auth.uid() and start_at > localtimestamp)
);

-- -----------------------------------------------------------------------------
-- Employee recurring availability
-- Positive weekly schedule: 0 Sunday, 1 Monday, ..., 6 Saturday.
-- -----------------------------------------------------------------------------

create table if not exists public.employee_availability (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  available_date date not null,
  weekday smallint not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  active boolean not null default true,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  constraint employee_availability_weekday_chk check (weekday between 0 and 6),
  constraint employee_availability_valid_range_chk check (end_time > start_time)
);

alter table public.employee_availability
  add column if not exists available_date date;

update public.employee_availability
set available_date = current_date + (((weekday::int - extract(dow from current_date)::int + 7) % 7)::int)
where available_date is null;

alter table public.employee_availability
  alter column available_date set not null;

create index if not exists employee_availability_employee_date_idx
  on public.employee_availability(employee_id, available_date, start_time, end_time);

drop index if exists employee_availability_employee_weekday_idx;

alter table public.employee_availability
  drop constraint if exists employee_availability_no_overlap_excl;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employee_availability_no_overlap_excl') then
    alter table public.employee_availability
      add constraint employee_availability_no_overlap_excl
      exclude using gist (
        employee_id with =,
        available_date with =,
        int4range(
          ((extract(hour from start_time)::int * 60) + extract(minute from start_time)::int),
          ((extract(hour from end_time)::int * 60) + extract(minute from end_time)::int),
          '[)'
        ) with &&
      )
      where (active = true);
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists employee_availability_set_updated_at on public.employee_availability;
create trigger employee_availability_set_updated_at
before update on public.employee_availability
for each row execute function public.set_updated_at();

drop function if exists public.list_internal_employee_availability(uuid);
drop function if exists public.create_internal_employee_availability(uuid, smallint, time without time zone, time without time zone, boolean);
drop function if exists public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean);
drop function if exists public.update_internal_employee_availability(uuid, text, smallint, time without time zone, time without time zone, boolean);
drop function if exists public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean);
drop function if exists public.delete_internal_employee_availability(uuid, text);

create or replace function public.list_internal_employee_availability(account_id_value uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  availability_payload jsonb;
begin
  select *
  into account_record
  from public.internal_accounts
  where internal_accounts.id = account_id_value
    and internal_accounts.role = 'employee'::public.app_role
    and internal_accounts.active = true
  limit 1;

  if account_record.id is null or account_record.employee_id is null then
    raise exception 'La cuenta interna no esta vinculada a un empleado activo.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(ordered_availability) order by ordered_availability.available_date, ordered_availability.start_time), '[]'::jsonb)
  into availability_payload
  from (
    select availability.*
    from public.employee_availability availability
    where availability.employee_id = account_record.employee_id
    order by availability.available_date asc, availability.start_time asc
  ) ordered_availability;

  return availability_payload;
end;
$$;

create or replace function public.create_internal_employee_availability(
  account_id_value uuid,
  available_date_value date,
  start_time_value time without time zone,
  end_time_value time without time zone,
  active_value boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  saved_availability public.employee_availability%rowtype;
begin
  select *
  into account_record
  from public.internal_accounts
  where internal_accounts.id = account_id_value
    and internal_accounts.role = 'employee'::public.app_role
    and internal_accounts.active = true
  limit 1;

  if account_record.id is null or account_record.employee_id is null then
    raise exception 'La cuenta interna no esta vinculada a un empleado activo.';
  end if;

  if available_date_value is null then
    raise exception 'La fecha de disponibilidad es invalida.';
  end if;

  if available_date_value < current_date then
    raise exception 'No se puede crear disponibilidad en fechas pasadas.';
  end if;

  if end_time_value <= start_time_value then
    raise exception 'La hora fin debe ser posterior a la hora inicio.';
  end if;

  insert into public.employee_availability (employee_id, available_date, weekday, start_time, end_time, active)
  values (account_record.employee_id, available_date_value, extract(dow from available_date_value)::smallint, start_time_value, end_time_value, coalesce(active_value, true))
  returning * into saved_availability;

  return to_jsonb(saved_availability);
end;
$$;

create or replace function public.update_internal_employee_availability(
  account_id_value uuid,
  availability_id_value text,
  available_date_value date,
  start_time_value time without time zone,
  end_time_value time without time zone,
  active_value boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  saved_availability public.employee_availability%rowtype;
begin
  select *
  into account_record
  from public.internal_accounts
  where internal_accounts.id = account_id_value
    and internal_accounts.role = 'employee'::public.app_role
    and internal_accounts.active = true
  limit 1;

  if account_record.id is null or account_record.employee_id is null then
    raise exception 'La cuenta interna no esta vinculada a un empleado activo.';
  end if;

  if available_date_value is null then
    raise exception 'La fecha de disponibilidad es invalida.';
  end if;

  if available_date_value < current_date then
    raise exception 'No se puede mover disponibilidad a fechas pasadas.';
  end if;

  if end_time_value <= start_time_value then
    raise exception 'La hora fin debe ser posterior a la hora inicio.';
  end if;

  update public.employee_availability
    set available_date = available_date_value,
      weekday = extract(dow from available_date_value)::smallint,
      start_time = start_time_value,
      end_time = end_time_value,
      active = coalesce(active_value, true),
      updated_at = now()
  where employee_availability.id::text = availability_id_value
    and employee_availability.employee_id = account_record.employee_id
  returning * into saved_availability;

  if saved_availability.id is null then
    raise exception 'La disponibilidad no existe o no pertenece a este empleado.';
  end if;

  return to_jsonb(saved_availability);
end;
$$;

create or replace function public.delete_internal_employee_availability(
  account_id_value uuid,
  availability_id_value text
)
returns void
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
  where internal_accounts.id = account_id_value
    and internal_accounts.role = 'employee'::public.app_role
    and internal_accounts.active = true
  limit 1;

  if account_record.id is null or account_record.employee_id is null then
    raise exception 'La cuenta interna no esta vinculada a un empleado activo.';
  end if;

  delete from public.employee_availability
  where employee_availability.id::text = availability_id_value
    and employee_availability.employee_id = account_record.employee_id;

  if not found then
    raise exception 'La disponibilidad no existe o no pertenece a este empleado.';
  end if;
end;
$$;

grant select on public.employee_availability to anon, authenticated;
grant insert, update, delete on public.employee_availability to authenticated;
grant execute on function public.list_internal_employee_availability(uuid) to anon, authenticated;
grant execute on function public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean) to anon, authenticated;
grant execute on function public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean) to anon, authenticated;
grant execute on function public.delete_internal_employee_availability(uuid, text) to anon, authenticated;

alter table public.employee_availability enable row level security;

drop policy if exists "employee_availability_read" on public.employee_availability;
create policy "employee_availability_read"
on public.employee_availability for select
to anon, authenticated
using (true);

drop policy if exists "employee_availability_insert" on public.employee_availability;
create policy "employee_availability_insert"
on public.employee_availability for insert
to authenticated
with check (public.is_admin() or public.is_employee_for(employee_id));

drop policy if exists "employee_availability_update" on public.employee_availability;
create policy "employee_availability_update"
on public.employee_availability for update
to authenticated
using (public.is_admin() or public.is_employee_for(employee_id))
with check (public.is_admin() or public.is_employee_for(employee_id));

drop policy if exists "employee_availability_delete" on public.employee_availability;
create policy "employee_availability_delete"
on public.employee_availability for delete
to authenticated
using (public.is_admin() or public.is_employee_for(employee_id));

-- Daily block management was replaced by positive weekly availability.
drop function if exists public.list_internal_employee_blocks(uuid);
drop function if exists public.create_internal_employee_block(uuid, timestamp without time zone, timestamp without time zone, text);
drop function if exists public.update_internal_employee_block(uuid, uuid, timestamp without time zone, timestamp without time zone, text);
drop function if exists public.update_internal_employee_block(uuid, text, timestamp without time zone, timestamp without time zone, text);
drop function if exists public.delete_internal_employee_block(uuid, uuid);
drop function if exists public.delete_internal_employee_block(uuid, text);
drop table if exists public.employee_blocks cascade;

commit;
