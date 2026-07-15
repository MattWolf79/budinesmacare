-- Phase 2 multi-company internal access hardening.
-- Run after 039_multi_tenant_client_context.sql.
-- Internal employee/admin accounts are resolved by the company slug from the URL.

begin;

create or replace function public.get_company_id_by_slug(slug_value text default null)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.companies
  where slug = lower(trim(coalesce(slug_value, '')))
    and status = 'active'
  limit 1
$$;

create or replace function public.get_company_public_context(slug_value text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_company as (
    select companies.*
    from public.companies companies
    where companies.slug = lower(trim(coalesce(slug_value, '')))
    limit 1
  ), selected_config as (
    select config.*
    from public.app_configuration config
    join selected_company on selected_company.id = config.company_id
    limit 1
  )
  select coalesce((
    select jsonb_build_object(
      'id', selected_company.id,
      'name', selected_company.name,
      'slug', selected_company.slug,
      'status', selected_company.status,
      'active', selected_company.status = 'active',
      'company_name', coalesce(nullif(selected_config.company_name, ''), selected_company.name),
      'business_hours_text', coalesce(selected_config.business_hours_text, ''),
      'welcome_background_data_url', selected_config.welcome_background_data_url,
      'banner_images', coalesce(selected_config.banner_images, '[]'::jsonb)
    )
    from selected_company
    left join selected_config on true
  ), jsonb_build_object(
    'id', null,
    'name', null,
    'slug', lower(trim(coalesce(slug_value, ''))),
    'status', 'not_found',
    'active', false,
    'company_name', null,
    'business_hours_text', '',
    'welcome_background_data_url', null,
    'banner_images', '[]'::jsonb
  ))
$$;

-- Usernames and pending requests must be unique inside each company, not globally.
drop index if exists public.internal_accounts_username_uidx;
drop index if exists public.internal_registration_requests_username_pending_uidx;
drop index if exists public.internal_registration_requests_username_uidx;

create unique index if not exists internal_accounts_company_username_uidx
  on public.internal_accounts(company_id, username_normalized)
  where company_id is not null;

create unique index if not exists internal_registration_requests_company_username_pending_uidx
  on public.internal_registration_requests(company_id, username_normalized)
  where status = 'pending' and company_id is not null;

create or replace function public.create_internal_session(account_id_value uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  session_token text := encode(extensions.gen_random_bytes(32), 'hex');
  target_company_id uuid;
begin
  select accounts.company_id
  into target_company_id
  from public.internal_accounts accounts
  where accounts.id = account_id_value
  limit 1;

  insert into public.internal_sessions (account_id, company_id, token_hash)
  values (account_id_value, target_company_id, extensions.crypt(session_token, extensions.gen_salt('bf')));

  return session_token;
end;
$$;

drop function if exists public.verify_internal_login(public.app_role, text, text);

create or replace function public.verify_internal_login(
  account_role public.app_role,
  username_value text,
  password_value text,
  company_slug_value text default null
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
  must_change_password boolean,
  session_token text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  account_record public.internal_accounts%rowtype;
begin
  if target_company_id is null then
    raise exception 'La empresa no está disponible.';
  end if;

  select *
  into account_record
  from public.internal_accounts
  where internal_accounts.company_id = target_company_id
    and internal_accounts.role = account_role
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
    account_record.must_change_password,
    public.create_internal_session(account_record.id);
end;
$$;

drop function if exists public.change_internal_password(uuid, text, text);

create or replace function public.change_internal_password(
  account_id_value uuid,
  current_password_value text,
  new_password_value text,
  company_slug_value text default null
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
  must_change_password boolean,
  session_token text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  account_record public.internal_accounts%rowtype;
  clean_new_password text := trim(coalesce(new_password_value, ''));
begin
  if target_company_id is null then
    raise exception 'La empresa no está disponible.';
  end if;

  select *
  into account_record
  from public.internal_accounts
  where internal_accounts.id = account_id_value
    and internal_accounts.company_id = target_company_id
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

  update public.internal_sessions
  set revoked_at = now()
  where internal_sessions.account_id = account_record.id
    and internal_sessions.revoked_at is null;

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
    account_record.must_change_password,
    public.create_internal_session(account_record.id);
end;
$$;

drop function if exists public.request_internal_registration(public.app_role, text, text, text, date, text, text, text, text, text, text, uuid, text);

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
  clean_username text := trim(coalesce(username_value, ''));
  clean_first_name text := trim(coalesce(first_name_value, ''));
  clean_last_name text := trim(coalesce(last_name_value, ''));
  clean_display_name text := trim(concat_ws(' ', nullif(trim(coalesce(first_name_value, '')), ''), nullif(trim(coalesce(last_name_value, '')), '')));
  clean_password text := trim(coalesce(password_value, ''));
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
begin
  if target_company_id is null then
    raise exception 'La empresa no está disponible.';
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

  if exists (
    select 1
    from public.internal_accounts accounts
    where accounts.company_id = target_company_id
      and accounts.username_normalized = public.normalize_text(clean_username)
  ) then
    raise exception 'Ya existe una cuenta interna con ese usuario.';
  end if;

  if exists (
    select 1
    from public.internal_registration_requests requests
    where requests.company_id = target_company_id
      and requests.status = 'pending'
      and requests.username_normalized = public.normalize_text(clean_username)
  ) then
    raise exception 'Ya existe una solicitud pendiente con ese usuario.';
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

  select company_id, email
  into request_company_id, request_email
  from public.internal_registration_requests
  where id = request_id_value;

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
    update public.internal_accounts
    set company_id = request_company_id,
        updated_at = now()
    where internal_accounts.id = approved_account.id;

    if public.is_valid_email(request_email) and approved_account.employee_id is not null then
      update public.employees
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

create or replace function public.get_admin_panel_data(
  account_id_value uuid default null,
  request_status_value text default 'pending',
  session_token_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  admin_account public.internal_accounts%rowtype;
  payload jsonb;
begin
  if target_company_id is null then
    raise exception 'La empresa no está disponible.';
  end if;

  if public.is_admin() then
    if not exists (
      select 1
      from public.profiles profiles
      where profiles.user_id = auth.uid()
        and profiles.role = 'admin'::public.app_role
        and profiles.active is not false
        and profiles.company_id = target_company_id
    ) then
      raise exception 'No podés administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);

    if admin_account.company_id is distinct from target_company_id then
      raise exception 'No podés administrar otra empresa.';
    end if;
  end if;

  select jsonb_build_object(
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(booking_rows) order by booking_rows.start_at)
      from (
        select *
        from public.bookings bookings
        where bookings.company_id = target_company_id
        order by bookings.start_at
      ) booking_rows
    ), '[]'::jsonb),
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
          and accounts.company_id = target_company_id
        where employees.company_id = target_company_id
          and employees.deleted_at is null
      ) employee_rows
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(to_jsonb(service_rows) order by service_rows.id)
      from (
        select *
        from public.services services
        where services.company_id = target_company_id
        order by services.id
      ) service_rows
    ), '[]'::jsonb),
    'employeeServices', coalesce((
      select jsonb_agg(to_jsonb(relation_rows))
      from (
        select *
        from public.employee_services relations
        where relations.company_id = target_company_id
      ) relation_rows
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
        where requests.company_id = target_company_id
          and (request_status_value is null or requests.status = request_status_value)
      ) request_rows
    ), '[]'::jsonb)
  ) into payload;

  return payload;
end;
$$;

create or replace function public.get_internal_employee_workspace(
  account_id_value uuid,
  session_token_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  target_company_id uuid;
  payload jsonb;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), account_record.company_id);

  if target_company_id is null or account_record.company_id is distinct from target_company_id or account_record.employee_id is null then
    raise exception 'La cuenta interna no pertenece a esta empresa.';
  end if;

  select jsonb_build_object(
    'employee', coalesce((
      select to_jsonb(employees)
      from public.employees employees
      where employees.id = account_record.employee_id
        and employees.company_id = target_company_id
        and employees.deleted_at is null
      limit 1
    ), 'null'::jsonb),
    'employees', coalesce((
      select jsonb_agg(to_jsonb(employee_rows) order by employee_rows.name)
      from (
        select *
        from public.employees employees
        where employees.company_id = target_company_id
          and employees.deleted_at is null
      ) employee_rows
    ), '[]'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(booking_rows) order by booking_rows.start_at)
      from (
        select *
        from public.bookings bookings
        where bookings.company_id = target_company_id
          and bookings.employee_id = account_record.employee_id
          and bookings.status in ('reserved', 'confirmed', 'pending_assignment', 'completed')
        order by bookings.start_at
      ) booking_rows
    ), '[]'::jsonb),
    'bookingClosureItems', coalesce((
      select jsonb_agg(to_jsonb(closure_item_rows) order by closure_item_rows.created_at)
      from (
        select closure_items.*
        from public.booking_closure_items closure_items
        join public.bookings bookings on bookings.id = closure_items.booking_id
        where bookings.company_id = target_company_id
          and bookings.employee_id = account_record.employee_id
          and bookings.status = 'completed'
      ) closure_item_rows
    ), '[]'::jsonb),
    'bookingClosures', coalesce((
      select jsonb_agg(to_jsonb(closure_rows) order by closure_rows.created_at)
      from (
        select distinct closures.*
        from public.booking_closures closures
        join public.booking_closure_items closure_items on closure_items.closure_id = closures.id
        join public.bookings bookings on bookings.id = closure_items.booking_id
        where bookings.company_id = target_company_id
          and bookings.employee_id = account_record.employee_id
          and bookings.status = 'completed'
      ) closure_rows
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(to_jsonb(service_rows) order by service_rows.id)
      from (
        select *
        from public.services services
        where services.company_id = target_company_id
        order by services.id
      ) service_rows
    ), '[]'::jsonb),
    'employeeServices', coalesce((
      select jsonb_agg(to_jsonb(relation_rows))
      from (
        select *
        from public.employee_services relations
        where relations.company_id = target_company_id
      ) relation_rows
    ), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(to_jsonb(availability_rows) order by availability_rows.available_date, availability_rows.start_time)
      from (
        select *
        from public.employee_availability availability
        where availability.company_id = target_company_id
          and availability.employee_id = account_record.employee_id
        order by availability.available_date, availability.start_time
      ) availability_rows
    ), '[]'::jsonb),
    'agendaAvailability', coalesce((
      select jsonb_agg(to_jsonb(availability_rows) order by availability_rows.available_date, availability_rows.start_time)
      from (
        select *
        from public.employee_availability availability
        where availability.company_id = target_company_id
        order by availability.available_date, availability.start_time
      ) availability_rows
    ), '[]'::jsonb)
  ) into payload;

  return payload;
end;
$$;

create or replace function public.create_admin_booking(
  service_id_value bigint,
  employee_id_value uuid,
  start_at_value timestamp without time zone,
  end_at_value timestamp without time zone,
  customer_name_value text default null,
  customer_email_value text default null,
  account_id_value uuid default null,
  session_token_value text default null,
  booking_description_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  admin_account public.internal_accounts%rowtype;
  saved_booking public.bookings%rowtype;
  is_promotional_booking boolean := service_id_value is null and nullif(trim(coalesce(booking_description_value, '')), '') is not null;
begin
  if target_company_id is null then raise exception 'La empresa no está disponible.'; end if;

  if public.is_admin() then
    if not exists (select 1 from public.profiles profiles where profiles.user_id = auth.uid() and profiles.role = 'admin'::public.app_role and profiles.active is not false and profiles.company_id = target_company_id) then
      raise exception 'No podés administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    if admin_account.company_id is distinct from target_company_id then raise exception 'No podés administrar otra empresa.'; end if;
  end if;

  if employee_id_value is null or start_at_value is null or end_at_value is null or end_at_value <= start_at_value then
    raise exception 'El horario del turno es invalido.';
  end if;

  if service_id_value is null and not is_promotional_booking then raise exception 'Seleccioná un servicio o promoción.'; end if;

  if not exists (select 1 from public.employees employees where employees.id = employee_id_value and employees.company_id = target_company_id and employees.active = true and employees.deleted_at is null) then
    raise exception 'El empleado no esta activo.';
  end if;

  if service_id_value is not null and not exists (select 1 from public.employee_services relations join public.services services on services.id = relations.service_id where relations.company_id = target_company_id and services.company_id = target_company_id and relations.employee_id = employee_id_value and relations.service_id = service_id_value and services.active is not false) then
    raise exception 'El empleado no esta vinculado a ese servicio.';
  end if;

  if not exists (select 1 from public.employee_availability availability where availability.company_id = target_company_id and availability.employee_id = employee_id_value and availability.active = true and availability.available_date = start_at_value::date and availability.start_time <= start_at_value::time and availability.end_time >= end_at_value::time) then
    raise exception 'El empleado no tiene disponibilidad configurada para ese horario.';
  end if;

  if exists (select 1 from public.bookings bookings where bookings.company_id = target_company_id and bookings.employee_id = employee_id_value and bookings.status in ('reserved', 'confirmed', 'pending_assignment') and bookings.start_at < end_at_value and bookings.end_at > start_at_value limit 1) then
    raise exception 'El empleado ya tiene un turno en ese horario.';
  end if;

  if nullif(trim(coalesce(customer_email_value, '')), '') is not null and exists (select 1 from public.bookings bookings where bookings.company_id = target_company_id and lower(coalesce(bookings.user_email, '')) = lower(trim(customer_email_value)) and bookings.status in ('reserved', 'confirmed', 'pending_assignment') and bookings.start_at < end_at_value and bookings.end_at > start_at_value limit 1) then
    raise exception 'Ese cliente ya tiene un turno en ese horario.';
  end if;

  insert into public.bookings (company_id, user_id, user_email, customer_name, service, employee_id, booking_description, start_at, end_at, status)
  values (target_company_id, null, nullif(trim(coalesce(customer_email_value, '')), ''), nullif(trim(coalesce(customer_name_value, '')), ''), service_id_value, employee_id_value, nullif(trim(coalesce(booking_description_value, '')), ''), start_at_value, end_at_value, 'confirmed')
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

create or replace function public.create_internal_employee_booking(
  service_id_value bigint,
  employee_id_value uuid,
  start_at_value timestamp without time zone,
  end_at_value timestamp without time zone,
  customer_name_value text default null,
  customer_email_value text default null,
  account_id_value uuid default null,
  session_token_value text default null,
  booking_description_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  employee_account public.internal_accounts%rowtype;
  saved_booking public.bookings%rowtype;
  is_promotional_booking boolean := service_id_value is null and nullif(trim(coalesce(booking_description_value, '')), '') is not null;
begin
  if target_company_id is null then raise exception 'La empresa no está disponible.'; end if;

  employee_account := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);

  if employee_account.company_id is distinct from target_company_id or employee_account.employee_id is distinct from employee_id_value then
    raise exception 'No podés crear turnos para otra empresa o empleado.';
  end if;

  if employee_id_value is null or start_at_value is null or end_at_value is null or end_at_value <= start_at_value then
    raise exception 'El horario del turno es invalido.';
  end if;

  if service_id_value is null and not is_promotional_booking then raise exception 'Seleccioná un servicio o promoción.'; end if;

  if service_id_value is not null and not exists (
    select 1
    from public.employee_services relations
    join public.services services on services.id = relations.service_id
    where relations.company_id = target_company_id
      and services.company_id = target_company_id
      and relations.employee_id = employee_id_value
      and relations.service_id = service_id_value
      and services.active is not false
  ) then
    raise exception 'El empleado no esta vinculado a ese servicio.';
  end if;

  if not exists (
    select 1
    from public.employee_availability availability
    where availability.company_id = target_company_id
      and availability.employee_id = employee_id_value
      and availability.active = true
      and availability.available_date = start_at_value::date
      and availability.start_time <= start_at_value::time
      and availability.end_time >= end_at_value::time
  ) then
    raise exception 'El empleado no tiene disponibilidad configurada para ese horario.';
  end if;

  if exists (
    select 1
    from public.bookings bookings
    where bookings.company_id = target_company_id
      and bookings.employee_id = employee_id_value
      and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
      and bookings.start_at < end_at_value
      and bookings.end_at > start_at_value
    limit 1
  ) then
    raise exception 'El empleado ya tiene un turno en ese horario.';
  end if;

  if nullif(trim(coalesce(customer_email_value, '')), '') is not null and exists (
    select 1
    from public.bookings bookings
    where bookings.company_id = target_company_id
      and lower(coalesce(bookings.user_email, '')) = lower(trim(customer_email_value))
      and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
      and bookings.start_at < end_at_value
      and bookings.end_at > start_at_value
    limit 1
  ) then
    raise exception 'Ese cliente ya tiene un turno en ese horario.';
  end if;

  insert into public.bookings (company_id, user_id, user_email, customer_name, service, employee_id, booking_description, start_at, end_at, status)
  values (target_company_id, null, nullif(trim(coalesce(customer_email_value, '')), ''), nullif(trim(coalesce(customer_name_value, '')), ''), service_id_value, employee_id_value, nullif(trim(coalesce(booking_description_value, '')), ''), start_at_value, end_at_value, 'confirmed')
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

create or replace function public.cancel_booking(
  booking_id_value uuid,
  account_id_value uuid default null,
  session_token_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  account_record public.internal_accounts%rowtype;
  saved_booking public.bookings%rowtype;
begin
  if target_company_id is null then raise exception 'La empresa no está disponible.'; end if;

  select * into saved_booking from public.bookings where id = booking_id_value and company_id = target_company_id limit 1;
  if saved_booking.id is null then raise exception 'El turno no pertenece a esta empresa.'; end if;

  if account_id_value is not null then
    account_record := public.validate_internal_session(account_id_value, session_token_value, null);
    if account_record.company_id is distinct from target_company_id then raise exception 'El turno no pertenece a esta empresa.'; end if;
    if account_record.role = 'employee'::public.app_role and saved_booking.employee_id is distinct from account_record.employee_id then raise exception 'Solo podés cancelar turnos asignados a tu empleado.'; end if;
  elsif auth.uid() is null or saved_booking.user_id is distinct from auth.uid() then
    raise exception 'Solo podés cancelar turnos propios.';
  end if;

  update public.bookings
  set status = 'cancelled', updated_at = now()
  where id = saved_booking.id
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

create or replace function public.assign_admin_booking_employee(
  booking_id_value uuid,
  employee_id_value uuid,
  account_id_value uuid default null,
  session_token_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  admin_account public.internal_accounts%rowtype;
  saved_booking public.bookings%rowtype;
begin
  if target_company_id is null then raise exception 'La empresa no está disponible.'; end if;

  if public.is_admin() then
    if not exists (select 1 from public.profiles profiles where profiles.user_id = auth.uid() and profiles.role = 'admin'::public.app_role and profiles.active is not false and profiles.company_id = target_company_id) then raise exception 'No podés administrar otra empresa.'; end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    if admin_account.company_id is distinct from target_company_id then raise exception 'No podés administrar otra empresa.'; end if;
  end if;

  select * into saved_booking from public.bookings where id = booking_id_value and company_id = target_company_id limit 1;
  if saved_booking.id is null then raise exception 'El turno no pertenece a esta empresa.'; end if;

  if not exists (select 1 from public.employees employees where employees.id = employee_id_value and employees.company_id = target_company_id and employees.active = true and employees.deleted_at is null) then raise exception 'El empleado no está disponible.'; end if;

  update public.bookings
  set employee_id = employee_id_value, status = 'confirmed', updated_at = now()
  where id = booking_id_value and company_id = target_company_id
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

create or replace function public.list_internal_employee_availability(account_id_value uuid, session_token_value text default null, company_slug_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  account_record public.internal_accounts%rowtype;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  if target_company_id is null or account_record.company_id is distinct from target_company_id then raise exception 'La cuenta interna no pertenece a esta empresa.'; end if;
  return coalesce((select jsonb_agg(to_jsonb(availability) order by availability.available_date, availability.start_time) from public.employee_availability availability where availability.company_id = target_company_id and availability.employee_id = account_record.employee_id), '[]'::jsonb);
end; $$;

create or replace function public.save_admin_employee_availability(availability_id_value text, employee_id_value uuid, available_date_value date, start_time_value time without time zone, end_time_value time without time zone, active_value boolean default true, account_id_value uuid default null, session_token_value text default null, company_slug_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  admin_account public.internal_accounts%rowtype;
  result jsonb;
begin
  if target_company_id is null then raise exception 'La empresa no está disponible.'; end if;
  if public.is_admin() then
    if not exists (select 1 from public.profiles profiles where profiles.user_id = auth.uid() and profiles.role = 'admin'::public.app_role and profiles.active is not false and profiles.company_id = target_company_id) then raise exception 'No podés administrar otra empresa.'; end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    if admin_account.company_id is distinct from target_company_id then raise exception 'No podés administrar otra empresa.'; end if;
  end if;
  if not exists (select 1 from public.employees employees where employees.id = employee_id_value and employees.company_id = target_company_id and employees.deleted_at is null) then raise exception 'El empleado no pertenece a esta empresa.'; end if;
  if availability_id_value is not null and not exists (select 1 from public.employee_availability availability where availability.id = availability_id_value::uuid and availability.company_id = target_company_id) then raise exception 'La disponibilidad no pertenece a esta empresa.'; end if;
  result := public.save_admin_employee_availability_legacy(availability_id_value, employee_id_value, available_date_value, start_time_value, end_time_value, active_value, account_id_value);
  update public.employee_availability set company_id = target_company_id where id = (result->>'id')::uuid;
  return result || jsonb_build_object('company_id', target_company_id);
end; $$;

create or replace function public.delete_admin_employee_availability(availability_id_value text, account_id_value uuid default null, session_token_value text default null, company_slug_value text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  admin_account public.internal_accounts%rowtype;
begin
  if target_company_id is null then raise exception 'La empresa no está disponible.'; end if;
  if public.is_admin() then
    if not exists (select 1 from public.profiles profiles where profiles.user_id = auth.uid() and profiles.role = 'admin'::public.app_role and profiles.active is not false and profiles.company_id = target_company_id) then raise exception 'No podés administrar otra empresa.'; end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    if admin_account.company_id is distinct from target_company_id then raise exception 'No podés administrar otra empresa.'; end if;
  end if;
  if not exists (select 1 from public.employee_availability availability where availability.id = availability_id_value::uuid and availability.company_id = target_company_id) then raise exception 'La disponibilidad no pertenece a esta empresa.'; end if;
  perform public.delete_admin_employee_availability_legacy(availability_id_value, account_id_value);
end; $$;

create or replace function public.create_internal_employee_availability(account_id_value uuid, available_date_value date, start_time_value time without time zone, end_time_value time without time zone, active_value boolean default true, session_token_value text default null, company_slug_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  account_record public.internal_accounts%rowtype;
  result jsonb;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  if target_company_id is null or account_record.company_id is distinct from target_company_id then raise exception 'La cuenta interna no pertenece a esta empresa.'; end if;
  result := public.create_internal_employee_availability_legacy(account_id_value, available_date_value, start_time_value, end_time_value, active_value);
  update public.employee_availability set company_id = target_company_id where id = (result->>'id')::uuid;
  return result || jsonb_build_object('company_id', target_company_id);
end; $$;

create or replace function public.update_internal_employee_availability(account_id_value uuid, availability_id_value text, available_date_value date, start_time_value time without time zone, end_time_value time without time zone, active_value boolean default true, session_token_value text default null, company_slug_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  account_record public.internal_accounts%rowtype;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  if target_company_id is null or account_record.company_id is distinct from target_company_id then raise exception 'La cuenta interna no pertenece a esta empresa.'; end if;
  if not exists (select 1 from public.employee_availability availability where availability.id = availability_id_value::uuid and availability.company_id = target_company_id and availability.employee_id = account_record.employee_id) then raise exception 'La disponibilidad no pertenece a esta empresa.'; end if;
  return public.update_internal_employee_availability_legacy(account_id_value, availability_id_value, available_date_value, start_time_value, end_time_value, active_value);
end; $$;

create or replace function public.delete_internal_employee_availability(account_id_value uuid, availability_id_value text, session_token_value text default null, company_slug_value text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  account_record public.internal_accounts%rowtype;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  if target_company_id is null or account_record.company_id is distinct from target_company_id then raise exception 'La cuenta interna no pertenece a esta empresa.'; end if;
  if not exists (select 1 from public.employee_availability availability where availability.id = availability_id_value::uuid and availability.company_id = target_company_id and availability.employee_id = account_record.employee_id) then raise exception 'La disponibilidad no pertenece a esta empresa.'; end if;
  perform public.delete_internal_employee_availability_legacy(account_id_value, availability_id_value);
end; $$;

alter function public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text)
  rename to save_admin_app_configuration_039;

revoke execute on function public.save_admin_app_configuration_039(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text) from anon, authenticated;

create or replace function public.save_admin_app_configuration(
  company_name_value text default 'Turnos App',
  business_hours_text_value text default '',
  welcome_background_data_url_value text default null,
  welcome_background_file_name_value text default null,
  welcome_background_mime_type_value text default null,
  banner_data_url_value text default null,
  banner_file_name_value text default null,
  banner_mime_type_value text default null,
  banner_images_value jsonb default '[]'::jsonb,
  promotions_value jsonb default '[]'::jsonb,
  discounts_value jsonb default '[]'::jsonb,
  client_can_choose_employee_value boolean default false,
  account_id_value uuid default null,
  session_token_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  admin_account public.internal_accounts%rowtype;
begin
  if target_company_id is null then
    raise exception 'La empresa no está disponible.';
  end if;

  if public.is_admin() then
    if not exists (
      select 1
      from public.profiles profiles
      where profiles.user_id = auth.uid()
        and profiles.role = 'admin'::public.app_role
        and profiles.active is not false
        and profiles.company_id = target_company_id
    ) then
      raise exception 'No podés administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);

    if admin_account.company_id is distinct from target_company_id then
      raise exception 'No podés administrar otra empresa.';
    end if;
  end if;

  return public.save_admin_app_configuration_039(
    company_name_value,
    business_hours_text_value,
    welcome_background_data_url_value,
    welcome_background_file_name_value,
    welcome_background_mime_type_value,
    banner_data_url_value,
    banner_file_name_value,
    banner_mime_type_value,
    banner_images_value,
    promotions_value,
    discounts_value,
    client_can_choose_employee_value,
    account_id_value,
    session_token_value,
    company_slug_value
  );
end;
$$;

revoke execute on function public.verify_internal_login(public.app_role, text, text, text) from public;
revoke execute on function public.change_internal_password(uuid, text, text, text) from public;
revoke execute on function public.request_internal_registration(public.app_role, text, text, text, date, text, text, text, text, text, text, uuid, text, text) from public;
revoke execute on function public.get_admin_panel_data(uuid, text, text, text) from public;
revoke execute on function public.get_internal_employee_workspace(uuid, text, text) from public;
revoke execute on function public.create_admin_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text, text, text) from public;
revoke execute on function public.create_internal_employee_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text, text, text) from public;
revoke execute on function public.cancel_booking(uuid, uuid, text, text) from public;
revoke execute on function public.assign_admin_booking_employee(uuid, uuid, uuid, text, text) from public;
revoke execute on function public.list_internal_employee_availability(uuid, text, text) from public;
revoke execute on function public.save_admin_employee_availability(text, uuid, date, time without time zone, time without time zone, boolean, uuid, text, text) from public;
revoke execute on function public.delete_admin_employee_availability(text, uuid, text, text) from public;
revoke execute on function public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean, text, text) from public;
revoke execute on function public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean, text, text) from public;
revoke execute on function public.delete_internal_employee_availability(uuid, text, text, text) from public;
revoke execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text) from public;

grant execute on function public.verify_internal_login(public.app_role, text, text, text) to anon, authenticated;
grant execute on function public.change_internal_password(uuid, text, text, text) to anon, authenticated;
grant execute on function public.request_internal_registration(public.app_role, text, text, text, date, text, text, text, text, text, text, uuid, text, text) to anon, authenticated;
grant execute on function public.get_admin_panel_data(uuid, text, text, text) to anon, authenticated;
grant execute on function public.get_internal_employee_workspace(uuid, text, text) to anon, authenticated;
grant execute on function public.create_admin_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.create_internal_employee_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.cancel_booking(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.assign_admin_booking_employee(uuid, uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.list_internal_employee_availability(uuid, text, text) to anon, authenticated;
grant execute on function public.save_admin_employee_availability(text, uuid, date, time without time zone, time without time zone, boolean, uuid, text, text) to anon, authenticated;
grant execute on function public.delete_admin_employee_availability(text, uuid, text, text) to anon, authenticated;
grant execute on function public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean, text, text) to anon, authenticated;
grant execute on function public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean, text, text) to anon, authenticated;
grant execute on function public.delete_internal_employee_availability(uuid, text, text, text) to anon, authenticated;
grant execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text) to anon, authenticated;

commit;
