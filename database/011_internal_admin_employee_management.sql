-- Seed an internal admin account and let admins promote employee accounts.
-- Run after 010_client_pending_assignment_bookings.sql on existing databases.

begin;

create or replace function public.is_internal_admin(account_id_value uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.internal_accounts accounts
    where accounts.id = account_id_value
      and accounts.role = 'admin'::public.app_role
      and accounts.active = true
  )
$$;

insert into public.internal_accounts (
  role,
  username,
  display_name,
  first_name,
  last_name,
  username_normalized,
  password_hash,
  employee_id,
  active,
  must_change_password
)
select
  'admin'::public.app_role,
  'admin',
  'Administrador',
  'Administrador',
  'Inicial',
  public.normalize_text('admin'),
  extensions.crypt('123456', extensions.gen_salt('bf')),
  null,
  true,
  true
where not exists (
  select 1
  from public.internal_accounts accounts
  where accounts.username_normalized = public.normalize_text('admin')
);

drop function if exists public.get_admin_panel_data(uuid, text);
drop function if exists public.create_admin_employee(text, text, text, date, text, text, text, text, text, text, text[]);
drop function if exists public.create_admin_employee(text, text, text, date, text, text, text, text, text, text, text[], boolean, uuid);
drop function if exists public.update_admin_employee(uuid, text, text, text, date, text, text, text, text, text, text, boolean, boolean, text[], uuid);
drop function if exists public.approve_internal_registration(uuid, uuid);
drop function if exists public.approve_internal_registration(uuid, uuid, uuid);
drop function if exists public.reject_internal_registration(uuid);
drop function if exists public.reject_internal_registration(uuid, uuid);
drop function if exists public.delete_admin_employee(uuid);
drop function if exists public.delete_admin_employee(uuid, uuid);

create or replace function public.get_admin_panel_data(
  account_id_value uuid default null,
  request_status_value text default 'pending'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  if not public.is_admin() and not public.is_internal_admin(account_id_value) then
    raise exception 'Solo un administrador puede ver datos de administración.';
  end if;

  select jsonb_build_object(
    'employees', coalesce((
      select jsonb_agg(to_jsonb(employee_rows) order by employee_rows.name)
      from (
        select
          employees.*,
          coalesce(accounts.role = 'admin'::public.app_role, false) as is_admin,
          accounts.username as internal_username
        from public.employees employees
        left join public.internal_accounts accounts
          on accounts.employee_id = employees.id
          and accounts.active = true
        where employees.deleted_at is null
      ) employee_rows
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(to_jsonb(service_rows) order by service_rows.id)
      from (select * from public.services order by id) service_rows
    ), '[]'::jsonb),
    'employeeServices', coalesce((
      select jsonb_agg(to_jsonb(relation_rows))
      from (select * from public.employee_services) relation_rows
    ), '[]'::jsonb),
    'accessRequests', coalesce((
      select jsonb_agg(to_jsonb(request_rows) order by request_rows.created_at desc)
      from (
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
        where request_status_value is null or requests.status = request_status_value
      ) request_rows
    ), '[]'::jsonb)
  ) into payload;

  return payload;
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
  service_ids_value text[] default array[]::text[],
  is_admin_value boolean default false,
  account_id_value uuid default null
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
  internal_username text,
  is_admin boolean
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
  if not public.is_admin() and not public.is_internal_admin(account_id_value) then
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
    candidate_username,
    is_admin_value;
end;
$$;

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
  account_id_value uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_employee public.employees%rowtype;
  account_record public.internal_accounts%rowtype;
  clean_first_name text := nullif(trim(coalesce(first_name_value, '')), '');
  clean_last_name text := nullif(trim(coalesce(last_name_value, '')), '');
  clean_display_name text := trim(concat_ws(' ', nullif(trim(coalesce(first_name_value, '')), ''), nullif(trim(coalesce(last_name_value, '')), '')));
begin
  if not public.is_admin() and not public.is_internal_admin(account_id_value) then
    raise exception 'Solo un administrador puede editar empleados.';
  end if;

  update public.employees
  set name = trim(coalesce(name_value, '')),
      first_name = clean_first_name,
      last_name = clean_last_name,
      birth_date = birth_date_value,
      phone = nullif(trim(coalesce(phone_value, '')), ''),
      address_street = nullif(trim(coalesce(address_street_value, '')), ''),
      address_number = nullif(trim(coalesce(address_number_value, '')), ''),
      address_locality = nullif(trim(coalesce(address_locality_value, '')), ''),
      photo_url = nullif(photo_url_value, ''),
      code = nullif(trim(coalesce(code_value, '')), ''),
      active = active_value,
      updated_at = now()
  where employees.id = employee_id_value
  returning * into saved_employee;

  if saved_employee.id is null then
    raise exception 'El empleado no existe.';
  end if;

  select * into account_record
  from public.internal_accounts accounts
  where accounts.employee_id = saved_employee.id
  order by accounts.created_at asc
  limit 1;

  if account_record.id is null then
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
    ) values (
      case when is_admin_value then 'admin'::public.app_role else 'employee'::public.app_role end,
      saved_employee.name,
      clean_display_name,
      clean_first_name,
      clean_last_name,
      birth_date_value,
      nullif(trim(coalesce(phone_value, '')), ''),
      nullif(trim(coalesce(address_street_value, '')), ''),
      nullif(trim(coalesce(address_number_value, '')), ''),
      nullif(trim(coalesce(address_locality_value, '')), ''),
      nullif(photo_url_value, ''),
      public.normalize_text(saved_employee.name),
      extensions.crypt('123456', extensions.gen_salt('bf')),
      saved_employee.id,
      active_value,
      true
    );
  else
    update public.internal_accounts
    set role = case when is_admin_value then 'admin'::public.app_role else 'employee'::public.app_role end,
        display_name = clean_display_name,
        first_name = clean_first_name,
        last_name = clean_last_name,
        birth_date = birth_date_value,
        phone = nullif(trim(coalesce(phone_value, '')), ''),
        address_street = nullif(trim(coalesce(address_street_value, '')), ''),
        address_number = nullif(trim(coalesce(address_number_value, '')), ''),
        address_locality = nullif(trim(coalesce(address_locality_value, '')), ''),
        photo_url = nullif(photo_url_value, ''),
        active = active_value,
        updated_at = now()
    where internal_accounts.id = account_record.id;
  end if;

  delete from public.employee_services where employee_id = saved_employee.id;

  insert into public.employee_services (employee_id, service_id)
  select saved_employee.id, service_id_value::integer
  from unnest(coalesce(service_ids_value, array[]::text[])) as service_ids(service_id_value)
  on conflict do nothing;

  return to_jsonb(saved_employee) || jsonb_build_object('is_admin', is_admin_value, 'internal_username', saved_employee.name);
end;
$$;

create or replace function public.approve_internal_registration(
  request_id_value uuid,
  employee_id_value uuid default null,
  account_id_value uuid default null
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
  if not public.is_admin() and not public.is_internal_admin(account_id_value) then
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

  if target_employee_id is null then
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
    ) values (
      request_record.username,
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

  update public.internal_registration_requests
  set status = 'approved',
      employee_id = target_employee_id,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where internal_registration_requests.id = request_record.id;

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
    employee_id,
    active,
    must_change_password
  ) values (
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
    target_employee_id,
    true,
    false
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

create or replace function public.reject_internal_registration(
  request_id_value uuid,
  account_id_value uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and not public.is_internal_admin(account_id_value) then
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

create or replace function public.delete_admin_employee(
  employee_id_value uuid,
  account_id_value uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and not public.is_internal_admin(account_id_value) then
    raise exception 'Solo un administrador puede eliminar empleados.';
  end if;

  if employee_id_value is null then
    raise exception 'El empleado es invalido.';
  end if;

  if exists (
    select 1
    from public.bookings bookings
    where bookings.employee_id = employee_id_value
      and bookings.status in ('reserved', 'confirmed')
      and bookings.end_at >= now()::timestamp without time zone
    limit 1
  ) then
    raise exception 'No se puede eliminar un empleado con turnos futuros. Podés cancelar o reasignar esos turnos primero.';
  end if;

  delete from public.internal_accounts
  where internal_accounts.employee_id = employee_id_value;

  update public.profiles
  set role = 'client'::public.app_role,
      employee_id = null,
      updated_at = now()
  where profiles.employee_id = employee_id_value
    and profiles.role = 'employee'::public.app_role;

  update public.internal_registration_requests
  set employee_id = null
  where internal_registration_requests.employee_id = employee_id_value;

  delete from public.employee_services
  where employee_services.employee_id = employee_id_value;

  delete from public.employee_availability
  where employee_availability.employee_id = employee_id_value;

  if exists (
    select 1
    from public.bookings bookings
    where bookings.employee_id = employee_id_value
    limit 1
  ) then
    update public.employees
    set active = false,
        deleted_at = coalesce(deleted_at, now()),
        updated_at = now()
    where employees.id = employee_id_value;
  else
    delete from public.employees
    where employees.id = employee_id_value;
  end if;

  if not found then
    raise exception 'El empleado no existe.';
  end if;
end;
$$;

create or replace function public.save_admin_service(
  service_id_value bigint,
  name_value text,
  icon_value text,
  color_value text,
  default_duration_value integer,
  active_value boolean,
  account_id_value uuid default null
)
returns table (
  id bigint,
  name text,
  icon text,
  color text,
  default_duration integer,
  active boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := nullif(trim(coalesce(name_value, '')), '');
  clean_color text := coalesce(nullif(trim(coalesce(color_value, '')), ''), '#42A5F5');
  clean_duration integer := coalesce(default_duration_value, 30);
begin
  if not public.is_admin() and not public.is_internal_admin(account_id_value) then
    raise exception 'Solo un administrador puede guardar actividades.';
  end if;

  if clean_name is null then
    raise exception 'Ingresá el nombre de la actividad.';
  end if;

  if clean_duration <= 0 then
    raise exception 'La duración de la actividad debe ser mayor a cero.';
  end if;

  if service_id_value is null then
    return query
    insert into public.services (name, icon, color, default_duration, active)
    values (
      clean_name,
      nullif(trim(coalesce(icon_value, '')), ''),
      clean_color,
      clean_duration,
      coalesce(active_value, true)
    )
    returning services.id, services.name, services.icon, services.color, services.default_duration, services.active;
  end if;

  return query
  update public.services
  set name = clean_name,
      icon = nullif(trim(coalesce(icon_value, '')), ''),
      color = clean_color,
      default_duration = clean_duration,
      active = coalesce(active_value, true)
  where services.id = service_id_value
  returning services.id, services.name, services.icon, services.color, services.default_duration, services.active;

  if not found then
    raise exception 'La actividad no existe.';
  end if;
end;
$$;

create or replace function public.delete_admin_service(
  service_id_value bigint,
  account_id_value uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and not public.is_internal_admin(account_id_value) then
    raise exception 'Solo un administrador puede eliminar actividades.';
  end if;

  if exists (
    select 1
    from public.bookings bookings
    where bookings.service = service_id_value
    limit 1
  ) then
    raise exception 'No se puede eliminar una actividad con turnos cargados. Podés desactivarla para que no se ofrezca más.';
  end if;

  delete from public.employee_services
  where employee_services.service_id = service_id_value;

  delete from public.services
  where services.id = service_id_value;

  if not found then
    raise exception 'La actividad no existe.';
  end if;
end;
$$;

grant execute on function public.is_internal_admin(uuid) to anon, authenticated;
grant execute on function public.get_admin_panel_data(uuid, text) to anon, authenticated;
grant execute on function public.create_admin_employee(text, text, text, date, text, text, text, text, text, text, text[], boolean, uuid) to anon, authenticated;
grant execute on function public.update_admin_employee(uuid, text, text, text, date, text, text, text, text, text, text, boolean, boolean, text[], uuid) to anon, authenticated;
grant execute on function public.approve_internal_registration(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.reject_internal_registration(uuid, uuid) to anon, authenticated;
grant execute on function public.delete_admin_employee(uuid, uuid) to anon, authenticated;
grant execute on function public.save_admin_service(bigint, text, text, text, integer, boolean, uuid) to anon, authenticated;
grant execute on function public.delete_admin_service(bigint, uuid) to anon, authenticated;

commit;