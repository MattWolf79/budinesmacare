-- Archivo consolidado generado desde database/*.sql
-- Uso: ejecutar los 5 archivos consolidados en orden numerico.
-- No reemplaza las migraciones originales; es una copia de portabilidad/bootstrap.
-- Rango incluido: 015-033


-- ============================================================================
-- Source: database/015_app_configuration.sql
-- ============================================================================

-- App configuration for client home banner, promotions, and booking preferences.
-- Run after 014_internal_security_hardening.sql on existing databases.

begin;

create table if not exists public.app_configuration (
  id boolean primary key default true,
  banner_data_url text,
  banner_file_name text,
  banner_mime_type text,
  promotions jsonb not null default '[]'::jsonb,
  client_can_choose_employee boolean not null default false,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  constraint app_configuration_singleton_chk check (id),
  constraint app_configuration_banner_mime_chk check (
    banner_mime_type is null or banner_mime_type in ('image/jpeg', 'image/png')
  ),
  constraint app_configuration_banner_data_chk check (
    banner_data_url is null
    or banner_data_url like 'data:image/jpeg;base64,%'
    or banner_data_url like 'data:image/png;base64,%'
  ),
  constraint app_configuration_promotions_array_chk check (jsonb_typeof(promotions) = 'array')
);

drop trigger if exists app_configuration_set_updated_at on public.app_configuration;
create trigger app_configuration_set_updated_at
before update on public.app_configuration
for each row execute function public.set_updated_at();

-- Insert default app configuration if it doesn't exist
do $$
begin
  insert into public.app_configuration (id) values (true);
exception when unique_violation then
  -- app_configuration already exists, ignore
end;
$$;

alter table public.app_configuration enable row level security;

drop policy if exists "app_configuration_read" on public.app_configuration;
drop policy if exists "app_configuration_no_direct_insert" on public.app_configuration;
drop policy if exists "app_configuration_no_direct_update" on public.app_configuration;
drop policy if exists "app_configuration_no_direct_delete" on public.app_configuration;

create policy "app_configuration_read"
  on public.app_configuration
  for select
  using (true);

create policy "app_configuration_no_direct_insert"
  on public.app_configuration
  for insert
  with check (false);

create policy "app_configuration_no_direct_update"
  on public.app_configuration
  for update
  using (false)
  with check (false);

create policy "app_configuration_no_direct_delete"
  on public.app_configuration
  for delete
  using (false);

create or replace function public.get_app_configuration()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'banner_data_url', banner_data_url,
      'banner_file_name', banner_file_name,
      'banner_mime_type', banner_mime_type,
      'promotions', promotions,
      'client_can_choose_employee', client_can_choose_employee
    )
    from public.app_configuration
    where id = true
    limit 1
  ), jsonb_build_object(
    'banner_data_url', null,
    'banner_file_name', null,
    'banner_mime_type', null,
    'promotions', '[]'::jsonb,
    'client_can_choose_employee', false
  ))
$$;

create or replace function public.save_admin_app_configuration(
  banner_data_url_value text default null,
  banner_file_name_value text default null,
  banner_mime_type_value text default null,
  promotions_value jsonb default '[]'::jsonb,
  client_can_choose_employee_value boolean default false,
  account_id_value uuid default null,
  session_token_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_promotions jsonb := coalesce(promotions_value, '[]'::jsonb);
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if banner_mime_type_value is not null and banner_mime_type_value not in ('image/jpeg', 'image/png') then
    raise exception 'El banner debe ser JPG o PNG.';
  end if;

  if banner_data_url_value is not null
    and banner_data_url_value not like 'data:image/jpeg;base64,%'
    and banner_data_url_value not like 'data:image/png;base64,%' then
    raise exception 'El banner debe estar codificado como imagen JPG o PNG.';
  end if;

  if jsonb_typeof(next_promotions) <> 'array' then
    raise exception 'Las promociones deben enviarse como arreglo.';
  end if;

  begin
    insert into public.app_configuration (
      id,
      banner_data_url,
      banner_file_name,
      banner_mime_type,
      promotions,
      client_can_choose_employee
    ) values (
      true,
      nullif(banner_data_url_value, ''),
      nullif(banner_file_name_value, ''),
      nullif(banner_mime_type_value, ''),
      next_promotions,
      coalesce(client_can_choose_employee_value, false)
    );
  exception when unique_violation then
    update public.app_configuration set
      banner_data_url = nullif(banner_data_url_value, ''),
      banner_file_name = nullif(banner_file_name_value, ''),
      banner_mime_type = nullif(banner_mime_type_value, ''),
      promotions = next_promotions,
      client_can_choose_employee = coalesce(client_can_choose_employee_value, false)
    where id = true;
  end;

  return public.get_app_configuration();
end;
$$;

revoke execute on function public.get_app_configuration() from public;
revoke execute on function public.save_admin_app_configuration(text, text, text, jsonb, boolean, uuid, text) from public;

grant select on public.app_configuration to anon, authenticated;
grant execute on function public.get_app_configuration() to anon, authenticated;
grant execute on function public.save_admin_app_configuration(text, text, text, jsonb, boolean, uuid, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/016_booking_description.sql
-- ============================================================================

-- Optional booking description, used when a client reserves from a promotion.
-- Run after 015_app_configuration.sql on existing databases.

begin;

alter table public.bookings
  add column if not exists booking_description text;

commit;


-- ============================================================================
-- Source: database/017_client_booking_options.sql
-- ============================================================================

-- Public booking options used by the client agenda.
-- Run after 016_booking_description.sql on existing databases.

begin;

create or replace function public.get_client_booking_options()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'services', coalesce((
      select jsonb_agg(to_jsonb(service_rows) order by service_rows.id)
      from (
        select *
        from public.services
        where active is not false
        order by id
      ) service_rows
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(to_jsonb(employee_rows) order by employee_rows.name)
      from (
        select *
        from public.employees
        where active is not false
          and deleted_at is null
        order by name
      ) employee_rows
    ), '[]'::jsonb),
    'employeeServices', coalesce((
      select jsonb_agg(to_jsonb(relation_rows))
      from (
        select relations.*
        from public.employee_services relations
        join public.services services on services.id = relations.service_id
        join public.employees employees on employees.id = relations.employee_id
        where services.active is not false
          and employees.active is not false
          and employees.deleted_at is null
      ) relation_rows
    ), '[]'::jsonb),
    'employeeAvailability', coalesce((
      select jsonb_agg(to_jsonb(availability_rows))
      from (
        select availability.*
        from public.employee_availability availability
        join public.employees employees on employees.id = availability.employee_id
        where availability.active is true
          and employees.active is not false
          and employees.deleted_at is null
      ) availability_rows
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.get_client_booking_options() from public;
grant execute on function public.get_client_booking_options() to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/018_promotional_bookings.sql
-- ============================================================================

-- Promotional bookings can be created without a service row.
-- Run after 017_client_booking_options.sql on existing databases.

begin;

alter table public.bookings
  alter column service drop not null;

create or replace function public.assign_admin_booking_employee(
  booking_id_value uuid,
  employee_id_value uuid,
  account_id_value uuid default null,
  session_token_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_record public.bookings%rowtype;
  saved_booking public.bookings%rowtype;
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if booking_id_value is null or employee_id_value is null then
    raise exception 'Faltan datos para asignar el empleado.';
  end if;

  select *
  into booking_record
  from public.bookings bookings
  where bookings.id = booking_id_value
  for update;

  if booking_record.id is null then
    raise exception 'El turno no existe.';
  end if;

  if booking_record.employee_id is not null and booking_record.employee_id <> employee_id_value then
    raise exception 'El turno ya tiene un empleado asignado.';
  end if;

  if not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.active = true
      and employees.deleted_at is null
  ) then
    raise exception 'El empleado no esta activo.';
  end if;

  if booking_record.service is not null and not exists (
    select 1
    from public.employee_services relations
    where relations.employee_id = employee_id_value
      and relations.service_id = booking_record.service
  ) then
    raise exception 'El empleado no esta vinculado a ese servicio.';
  end if;

  if not exists (
    select 1
    from public.employee_availability availability
    where availability.employee_id = employee_id_value
      and availability.active = true
      and availability.available_date = booking_record.start_at::date
      and availability.start_time <= booking_record.start_at::time
      and availability.end_time >= booking_record.end_at::time
  ) then
    raise exception 'El empleado no tiene disponibilidad configurada para ese horario.';
  end if;

  if exists (
    select 1
    from public.bookings bookings
    where bookings.id <> booking_id_value
      and bookings.employee_id = employee_id_value
      and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
      and bookings.start_at < booking_record.end_at
      and bookings.end_at > booking_record.start_at
    limit 1
  ) then
    raise exception 'El empleado ya tiene un turno en ese horario.';
  end if;

  update public.bookings
  set employee_id = employee_id_value,
      status = 'confirmed'
  where id = booking_id_value
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

revoke execute on function public.assign_admin_booking_employee(uuid, uuid, uuid, text) from public;
grant execute on function public.assign_admin_booking_employee(uuid, uuid, uuid, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/019_client_booking_request_rpc.sql
-- ============================================================================

-- Client booking request RPC used by the agenda under RLS.
-- Run after 018_promotional_bookings.sql on existing databases.

begin;

create or replace function public.request_client_booking(
  service_id_value bigint default null,
  employee_id_value uuid default null,
  booking_description_value text default null,
  start_at_value timestamp without time zone default null,
  end_at_value timestamp without time zone default null,
  customer_name_value text default null,
  customer_email_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_booking public.bookings%rowtype;
  next_status text := case when employee_id_value is null then 'pending_assignment' else 'confirmed' end;
begin
  if auth.uid() is null then
    raise exception 'IniciÃ¡ sesiÃ³n para solicitar un turno.';
  end if;

  if start_at_value is null or end_at_value is null or end_at_value <= start_at_value then
    raise exception 'El horario seleccionado no es vÃ¡lido.';
  end if;

  if start_at_value < localtimestamp then
    raise exception 'No se pueden solicitar turnos en horarios pasados.';
  end if;

  if service_id_value is null and nullif(trim(coalesce(booking_description_value, '')), '') is null then
    raise exception 'SeleccionÃ¡ un servicio o promociÃ³n.';
  end if;

  if service_id_value is not null and not exists (
    select 1
    from public.services services
    where services.id = service_id_value
      and services.active is not false
  ) then
    raise exception 'El servicio seleccionado no estÃ¡ disponible.';
  end if;

  if exists (
    select 1
    from public.bookings bookings
    where bookings.status in ('reserved', 'confirmed', 'pending_assignment')
      and bookings.start_at < end_at_value
      and bookings.end_at > start_at_value
      and (
        bookings.user_id = auth.uid()
        or (
          nullif(trim(coalesce(customer_email_value, '')), '') is not null
          and lower(coalesce(bookings.user_email, '')) = lower(trim(customer_email_value))
        )
      )
    limit 1
  ) then
    raise exception 'Ya tenÃ©s un turno o solicitud en ese horario.';
  end if;

  if employee_id_value is not null then
    if not exists (
      select 1
      from public.employees employees
      where employees.id = employee_id_value
        and employees.active is true
        and employees.deleted_at is null
    ) then
      raise exception 'El empleado seleccionado no estÃ¡ disponible.';
    end if;

    if service_id_value is not null and not exists (
      select 1
      from public.employee_services relations
      where relations.employee_id = employee_id_value
        and relations.service_id = service_id_value
    ) then
      raise exception 'El empleado no estÃ¡ vinculado a ese servicio.';
    end if;

    if not exists (
      select 1
      from public.employee_availability availability
      where availability.employee_id = employee_id_value
        and availability.active is true
        and availability.available_date = start_at_value::date
        and availability.start_time <= start_at_value::time
        and availability.end_time >= end_at_value::time
    ) then
      raise exception 'El empleado no tiene disponibilidad configurada para ese horario.';
    end if;

    if exists (
      select 1
      from public.bookings bookings
      where bookings.employee_id = employee_id_value
        and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
        and bookings.start_at < end_at_value
        and bookings.end_at > start_at_value
      limit 1
    ) then
      raise exception 'El empleado ya tiene un turno en ese horario.';
    end if;
  end if;

  insert into public.bookings (
    user_id,
    user_email,
    customer_name,
    service,
    employee_id,
    booking_description,
    start_at,
    end_at,
    status
  ) values (
    auth.uid(),
    nullif(trim(coalesce(customer_email_value, '')), ''),
    nullif(trim(coalesce(customer_name_value, '')), ''),
    service_id_value,
    employee_id_value,
    nullif(trim(coalesce(booking_description_value, '')), ''),
    start_at_value,
    end_at_value,
    next_status
  )
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

revoke execute on function public.request_client_booking(bigint, uuid, text, timestamp without time zone, timestamp without time zone, text, text) from public;
grant execute on function public.request_client_booking(bigint, uuid, text, timestamp without time zone, timestamp without time zone, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/020_internal_promotional_bookings.sql
-- ============================================================================

-- Internal admin/employee bookings can create promotional bookings without a service row.
-- Run after 019_client_booking_request_rpc.sql on existing databases.

begin;

create or replace function public.create_admin_booking(
  service_id_value bigint,
  employee_id_value uuid,
  start_at_value timestamp without time zone,
  end_at_value timestamp without time zone,
  customer_name_value text default null,
  customer_email_value text default null,
  account_id_value uuid default null,
  session_token_value text default null,
  booking_description_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_booking public.bookings%rowtype;
  is_promotional_booking boolean := service_id_value is null and nullif(trim(coalesce(booking_description_value, '')), '') is not null;
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if employee_id_value is null or start_at_value is null or end_at_value is null then
    raise exception 'Faltan datos para crear el turno.';
  end if;

  if service_id_value is null and not is_promotional_booking then
    raise exception 'SeleccionÃ¡ un servicio o promociÃ³n.';
  end if;

  if end_at_value <= start_at_value then
    raise exception 'El horario del turno es invalido.';
  end if;

  if not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.active = true
      and employees.deleted_at is null
  ) then
    raise exception 'El empleado no esta activo.';
  end if;

  if service_id_value is not null and not exists (
    select 1
    from public.employee_services relations
    where relations.employee_id = employee_id_value
      and relations.service_id = service_id_value
  ) then
    raise exception 'El empleado no esta vinculado a ese servicio.';
  end if;

  if not exists (
    select 1
    from public.employee_availability availability
    where availability.employee_id = employee_id_value
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
    where bookings.employee_id = employee_id_value
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
    where lower(coalesce(bookings.user_email, '')) = lower(trim(customer_email_value))
      and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
      and bookings.start_at < end_at_value
      and bookings.end_at > start_at_value
    limit 1
  ) then
    raise exception 'Ese cliente ya tiene un turno en ese horario.';
  end if;

  insert into public.bookings (
    user_id,
    user_email,
    customer_name,
    service,
    employee_id,
    booking_description,
    start_at,
    end_at,
    status
  ) values (
    null,
    nullif(trim(coalesce(customer_email_value, '')), ''),
    nullif(trim(coalesce(customer_name_value, '')), ''),
    service_id_value,
    employee_id_value,
    nullif(trim(coalesce(booking_description_value, '')), ''),
    start_at_value,
    end_at_value,
    'confirmed'
  )
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
  booking_description_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_booking public.bookings%rowtype;
  is_promotional_booking boolean := service_id_value is null and nullif(trim(coalesce(booking_description_value, '')), '') is not null;
begin
  perform public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);

  if employee_id_value is null or start_at_value is null or end_at_value is null then
    raise exception 'Faltan datos para crear el turno.';
  end if;

  if service_id_value is null and not is_promotional_booking then
    raise exception 'SeleccionÃ¡ un servicio o promociÃ³n.';
  end if;

  if end_at_value <= start_at_value then
    raise exception 'El horario del turno es invalido.';
  end if;

  if not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.active = true
      and employees.deleted_at is null
  ) then
    raise exception 'El empleado no esta activo.';
  end if;

  if service_id_value is not null and not exists (
    select 1
    from public.employee_services relations
    where relations.employee_id = employee_id_value
      and relations.service_id = service_id_value
  ) then
    raise exception 'El empleado no esta vinculado a ese servicio.';
  end if;

  if not exists (
    select 1
    from public.employee_availability availability
    where availability.employee_id = employee_id_value
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
    where bookings.employee_id = employee_id_value
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
    where lower(coalesce(bookings.user_email, '')) = lower(trim(customer_email_value))
      and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
      and bookings.start_at < end_at_value
      and bookings.end_at > start_at_value
    limit 1
  ) then
    raise exception 'Ese cliente ya tiene un turno en ese horario.';
  end if;

  insert into public.bookings (
    user_id,
    user_email,
    customer_name,
    service,
    employee_id,
    booking_description,
    start_at,
    end_at,
    status
  ) values (
    null,
    nullif(trim(coalesce(customer_email_value, '')), ''),
    nullif(trim(coalesce(customer_name_value, '')), ''),
    service_id_value,
    employee_id_value,
    nullif(trim(coalesce(booking_description_value, '')), ''),
    start_at_value,
    end_at_value,
    'confirmed'
  )
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

revoke execute on function public.create_admin_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text, text) from public;
revoke execute on function public.create_internal_employee_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text, text) from public;
grant execute on function public.create_admin_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text, text) to anon, authenticated;
grant execute on function public.create_internal_employee_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/021_admin_cancel_today_bookings.sql
-- ============================================================================

-- Admins can cancel same-day bookings even after the start time.
-- Run after 020_internal_promotional_bookings.sql on existing databases.

begin;

create or replace function public.cancel_booking(
  booking_id_value uuid,
  account_id_value uuid default null,
  session_token_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_record public.bookings%rowtype;
  saved_booking public.bookings%rowtype;
  internal_employee_id uuid := null;
  is_admin_actor boolean := false;
begin
  if booking_id_value is null then
    raise exception 'El turno es invalido.';
  end if;

  if account_id_value is not null then
    perform public.validate_internal_session(account_id_value, session_token_value, null);
  end if;

  select *
  into booking_record
  from public.bookings bookings
  where bookings.id = booking_id_value
  for update;

  if booking_record.id is null then
    raise exception 'El turno no existe.';
  end if;

  is_admin_actor := public.is_admin() or public.is_internal_admin(account_id_value);

  select accounts.employee_id
  into internal_employee_id
  from public.internal_accounts accounts
  where accounts.id = account_id_value
    and accounts.role = 'employee'::public.app_role
    and accounts.active = true
    and accounts.employee_id is not null
  limit 1;

  if not is_admin_actor
    and not coalesce(internal_employee_id is not null and booking_record.employee_id = internal_employee_id, false)
    and not coalesce(booking_record.user_id = auth.uid(), false)
    and not coalesce(public.is_employee_for(booking_record.employee_id), false) then
    raise exception 'No tenÃ©s permisos para cancelar este turno.';
  end if;

  if is_admin_actor then
    if booking_record.start_at::date < current_date then
      raise exception 'No se pueden cancelar turnos de dÃ­as pasados.';
    end if;
  elsif booking_record.start_at <= localtimestamp then
    raise exception 'No se pueden cancelar turnos de dÃ­as pasados.';
  end if;

  update public.bookings
  set status = 'cancelled',
      updated_at = now()
  where bookings.id = booking_record.id
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

revoke execute on function public.cancel_booking(uuid, uuid, text) from public;
grant execute on function public.cancel_booking(uuid, uuid, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/022_drop_ambiguous_internal_booking_rpcs.sql
-- ============================================================================

-- Remove older internal booking RPC overloads that make PostgREST function resolution ambiguous.
-- Run after 020_internal_promotional_bookings.sql on existing databases.

begin;

drop function if exists public.create_admin_booking(
  bigint,
  uuid,
  timestamp without time zone,
  timestamp without time zone,
  text,
  text,
  uuid,
  text
);

drop function if exists public.create_internal_employee_booking(
  bigint,
  uuid,
  timestamp without time zone,
  timestamp without time zone,
  text,
  text,
  uuid,
  text
);

commit;


-- ============================================================================
-- Source: database/023_banner_carousel_images.sql
-- ============================================================================

-- Store up to 4 client-home banner images for carousel display.
-- Run after 022_drop_ambiguous_internal_booking_rpcs.sql on existing databases.

begin;

alter table public.app_configuration
  add column if not exists banner_images jsonb not null default '[]'::jsonb;

alter table public.app_configuration
  drop constraint if exists app_configuration_banner_images_array_chk;

alter table public.app_configuration
  add constraint app_configuration_banner_images_array_chk
  check (jsonb_typeof(banner_images) = 'array' and jsonb_array_length(banner_images) <= 4);

update public.app_configuration
set banner_images = jsonb_build_array(jsonb_build_object(
  'dataUrl', banner_data_url,
  'fileName', banner_file_name,
  'mimeType', banner_mime_type
))
where banner_data_url is not null
  and jsonb_array_length(banner_images) = 0;

drop function if exists public.save_admin_app_configuration(text, text, text, jsonb, boolean, uuid, text);

create or replace function public.get_app_configuration()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'banner_data_url', banner_data_url,
      'banner_file_name', banner_file_name,
      'banner_mime_type', banner_mime_type,
      'banner_images', banner_images,
      'promotions', promotions,
      'client_can_choose_employee', client_can_choose_employee
    )
    from public.app_configuration
    where id = true
    limit 1
  ), jsonb_build_object(
    'banner_data_url', null,
    'banner_file_name', null,
    'banner_mime_type', null,
    'banner_images', '[]'::jsonb,
    'promotions', '[]'::jsonb,
    'client_can_choose_employee', false
  ))
$$;

create or replace function public.save_admin_app_configuration(
  banner_data_url_value text default null,
  banner_file_name_value text default null,
  banner_mime_type_value text default null,
  banner_images_value jsonb default '[]'::jsonb,
  promotions_value jsonb default '[]'::jsonb,
  client_can_choose_employee_value boolean default false,
  account_id_value uuid default null,
  session_token_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_banner_images jsonb := coalesce(banner_images_value, '[]'::jsonb);
  next_promotions jsonb := coalesce(promotions_value, '[]'::jsonb);
  banner_image jsonb;
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if banner_mime_type_value is not null and banner_mime_type_value not in ('image/jpeg', 'image/png') then
    raise exception 'El banner debe ser JPG o PNG.';
  end if;

  if banner_data_url_value is not null
    and banner_data_url_value not like 'data:image/jpeg;base64,%'
    and banner_data_url_value not like 'data:image/png;base64,%' then
    raise exception 'El banner debe estar codificado como imagen JPG o PNG.';
  end if;

  if jsonb_typeof(next_banner_images) <> 'array' then
    raise exception 'Las imÃ¡genes del banner deben enviarse como arreglo.';
  end if;

  if jsonb_array_length(next_banner_images) > 4 then
    raise exception 'El carrusel permite hasta 4 imÃ¡genes.';
  end if;

  for banner_image in select * from jsonb_array_elements(next_banner_images)
  loop
    if coalesce(banner_image->>'mimeType', '') not in ('image/jpeg', 'image/png') then
      raise exception 'Las imÃ¡genes del banner deben ser JPG o PNG.';
    end if;

    if coalesce(banner_image->>'dataUrl', '') not like 'data:image/jpeg;base64,%'
      and coalesce(banner_image->>'dataUrl', '') not like 'data:image/png;base64,%' then
      raise exception 'Las imÃ¡genes del banner deben estar codificadas como JPG o PNG.';
    end if;
  end loop;

  if jsonb_typeof(next_promotions) <> 'array' then
    raise exception 'Las promociones deben enviarse como arreglo.';
  end if;

  begin
    insert into public.app_configuration (
      id,
      banner_data_url,
      banner_file_name,
      banner_mime_type,
      banner_images,
      promotions,
      client_can_choose_employee
    ) values (
      true,
      nullif(banner_data_url_value, ''),
      nullif(banner_file_name_value, ''),
      nullif(banner_mime_type_value, ''),
      next_banner_images,
      next_promotions,
      coalesce(client_can_choose_employee_value, false)
    );
  exception when unique_violation then
    update public.app_configuration set
      banner_data_url = nullif(banner_data_url_value, ''),
      banner_file_name = nullif(banner_file_name_value, ''),
      banner_mime_type = nullif(banner_mime_type_value, ''),
      banner_images = next_banner_images,
      promotions = next_promotions,
      client_can_choose_employee = coalesce(client_can_choose_employee_value, false)
    where id = true;
  end;

  return public.get_app_configuration();
end;
$$;

revoke execute on function public.get_app_configuration() from public;
revoke execute on function public.save_admin_app_configuration(text, text, text, jsonb, jsonb, boolean, uuid, text) from public;

grant execute on function public.get_app_configuration() to anon, authenticated;
grant execute on function public.save_admin_app_configuration(text, text, text, jsonb, jsonb, boolean, uuid, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/024_stop_using_employee_codes.sql
-- ============================================================================

drop index if exists public.employees_code_uidx;

update public.employees
set code = null
where code is not null;


-- ============================================================================
-- Source: database/025_company_name_configuration.sql
-- ============================================================================

-- Add a configurable company name for the client welcome greeting.
-- Run after 024_stop_using_employee_codes.sql on existing databases.

begin;

alter table public.app_configuration
  add column if not exists company_name text not null default 'Turnos App';

alter table public.app_configuration
  drop constraint if exists app_configuration_company_name_length_chk;

alter table public.app_configuration
  add constraint app_configuration_company_name_length_chk
  check (char_length(trim(company_name)) between 1 and 40);

drop function if exists public.save_admin_app_configuration(text, text, text, jsonb, jsonb, boolean, uuid, text);

create or replace function public.get_app_configuration()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'company_name', company_name,
      'banner_data_url', banner_data_url,
      'banner_file_name', banner_file_name,
      'banner_mime_type', banner_mime_type,
      'banner_images', banner_images,
      'promotions', promotions,
      'client_can_choose_employee', client_can_choose_employee
    )
    from public.app_configuration
    where id = true
    limit 1
  ), jsonb_build_object(
    'company_name', 'Turnos App',
    'banner_data_url', null,
    'banner_file_name', null,
    'banner_mime_type', null,
    'banner_images', '[]'::jsonb,
    'promotions', '[]'::jsonb,
    'client_can_choose_employee', false
  ))
$$;

create or replace function public.save_admin_app_configuration(
  company_name_value text default 'Turnos App',
  banner_data_url_value text default null,
  banner_file_name_value text default null,
  banner_mime_type_value text default null,
  banner_images_value jsonb default '[]'::jsonb,
  promotions_value jsonb default '[]'::jsonb,
  client_can_choose_employee_value boolean default false,
  account_id_value uuid default null,
  session_token_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_company_name text := nullif(trim(coalesce(company_name_value, '')), '');
  next_banner_images jsonb := coalesce(banner_images_value, '[]'::jsonb);
  next_promotions jsonb := coalesce(promotions_value, '[]'::jsonb);
  banner_image jsonb;
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if next_company_name is null then
    next_company_name := 'Turnos App';
  end if;

  if char_length(next_company_name) > 40 then
    raise exception 'El nombre de la empresa debe tener hasta 40 caracteres.';
  end if;

  if banner_mime_type_value is not null and banner_mime_type_value not in ('image/jpeg', 'image/png') then
    raise exception 'El banner debe ser JPG o PNG.';
  end if;

  if banner_data_url_value is not null
    and banner_data_url_value not like 'data:image/jpeg;base64,%'
    and banner_data_url_value not like 'data:image/png;base64,%' then
    raise exception 'El banner debe estar codificado como imagen JPG o PNG.';
  end if;

  if jsonb_typeof(next_banner_images) <> 'array' then
    raise exception 'Las imÃ¡genes del banner deben enviarse como arreglo.';
  end if;

  if jsonb_array_length(next_banner_images) > 4 then
    raise exception 'El carrusel permite hasta 4 imÃ¡genes.';
  end if;

  for banner_image in select * from jsonb_array_elements(next_banner_images)
  loop
    if coalesce(banner_image->>'mimeType', '') not in ('image/jpeg', 'image/png') then
      raise exception 'Las imÃ¡genes del banner deben ser JPG o PNG.';
    end if;

    if coalesce(banner_image->>'dataUrl', '') not like 'data:image/jpeg;base64,%'
      and coalesce(banner_image->>'dataUrl', '') not like 'data:image/png;base64,%' then
      raise exception 'Las imÃ¡genes del banner deben estar codificadas como JPG o PNG.';
    end if;
  end loop;

  if jsonb_typeof(next_promotions) <> 'array' then
    raise exception 'Las promociones deben enviarse como arreglo.';
  end if;

  insert into public.app_configuration (
    id,
    company_name,
    banner_data_url,
    banner_file_name,
    banner_mime_type,
    banner_images,
    promotions,
    client_can_choose_employee
  ) values (
    true,
    next_company_name,
    nullif(banner_data_url_value, ''),
    nullif(banner_file_name_value, ''),
    nullif(banner_mime_type_value, ''),
    next_banner_images,
    next_promotions,
    coalesce(client_can_choose_employee_value, false)
  );
  exception when unique_violation then
    update public.app_configuration set
      company_name = next_company_name,
      banner_data_url = nullif(banner_data_url_value, ''),
      banner_file_name = nullif(banner_file_name_value, ''),
      banner_mime_type = nullif(banner_mime_type_value, ''),
      banner_images = next_banner_images,
      promotions = next_promotions,
      client_can_choose_employee = coalesce(client_can_choose_employee_value, false)
    where id = true;
  end;

  return public.get_app_configuration();
end;
$$;

revoke execute on function public.get_app_configuration() from public;
revoke execute on function public.save_admin_app_configuration(text, text, text, text, jsonb, jsonb, boolean, uuid, text) from public;

grant execute on function public.get_app_configuration() to anon, authenticated;
grant execute on function public.save_admin_app_configuration(text, text, text, text, jsonb, jsonb, boolean, uuid, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/026_closure_pricing_foundation.sql
-- ============================================================================

-- Pricing and closure foundation for attended bookings.
-- Run after 025_company_name_configuration.sql on existing databases.

begin;

alter table public.services
  add column if not exists base_price numeric(12, 2) not null default 0;

alter table public.services
  drop constraint if exists services_base_price_chk;

alter table public.services
  add constraint services_base_price_chk check (base_price >= 0);

alter table public.app_configuration
  add column if not exists discounts jsonb not null default '[]'::jsonb;

alter table public.app_configuration
  drop constraint if exists app_configuration_discounts_array_chk;

alter table public.app_configuration
  add constraint app_configuration_discounts_array_chk
  check (jsonb_typeof(discounts) = 'array');

alter table public.bookings
  drop constraint if exists bookings_status_chk;

alter table public.bookings
  add constraint bookings_status_chk
  check (status in ('reserved', 'confirmed', 'pending_assignment', 'cancelled', 'completed'));

alter table public.bookings
  add column if not exists closed_at timestamp without time zone;

create table if not exists public.booking_closures (
  id uuid primary key default gen_random_uuid(),
  client_name text,
  client_email text,
  service_date date not null,
  gross_total numeric(12, 2) not null default 0,
  line_discount_total numeric(12, 2) not null default 0,
  total_discount_total numeric(12, 2) not null default 0,
  total_discounts jsonb not null default '[]'::jsonb,
  final_total numeric(12, 2) not null default 0,
  cash_amount numeric(12, 2) not null default 0,
  transfer_amount numeric(12, 2) not null default 0,
  card_amount numeric(12, 2) not null default 0,
  closed_by_account_id uuid,
  closed_by_role text not null,
  created_at timestamp without time zone not null default now(),
  constraint booking_closures_non_negative_chk check (
    gross_total >= 0 and
    line_discount_total >= 0 and
    total_discount_total >= 0 and
    final_total >= 0 and
    cash_amount >= 0 and
    transfer_amount >= 0 and
    card_amount >= 0
  ),
  constraint booking_closures_total_discounts_array_chk check (jsonb_typeof(total_discounts) = 'array'),
  constraint booking_closures_role_chk check (closed_by_role in ('admin', 'employee'))
);

alter table public.booking_closures
  add column if not exists total_discounts jsonb not null default '[]'::jsonb;

alter table public.booking_closures
  drop constraint if exists booking_closures_total_discounts_array_chk;

alter table public.booking_closures
  add constraint booking_closures_total_discounts_array_chk check (jsonb_typeof(total_discounts) = 'array');

create table if not exists public.booking_closure_items (
  id uuid primary key default gen_random_uuid(),
  closure_id uuid not null references public.booking_closures(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  service_name text not null,
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text,
  base_price numeric(12, 2) not null default 0,
  line_discount_total numeric(12, 2) not null default 0,
  subtotal numeric(12, 2) not null default 0,
  applied_discounts jsonb not null default '[]'::jsonb,
  created_at timestamp without time zone not null default now(),
  constraint booking_closure_items_amounts_chk check (base_price >= 0 and line_discount_total >= 0 and subtotal >= 0),
  constraint booking_closure_items_discounts_array_chk check (jsonb_typeof(applied_discounts) = 'array')
);

create unique index if not exists booking_closure_items_booking_uidx
  on public.booking_closure_items(booking_id);

alter table public.bookings
  add column if not exists closure_id uuid references public.booking_closures(id) on delete set null;

create index if not exists bookings_closure_id_idx
  on public.bookings(closure_id);

create index if not exists booking_closures_service_date_idx
  on public.booking_closures(service_date);

create or replace function public.get_app_configuration()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'company_name', company_name,
      'banner_data_url', banner_data_url,
      'banner_file_name', banner_file_name,
      'banner_mime_type', banner_mime_type,
      'banner_images', banner_images,
      'promotions', promotions,
      'discounts', discounts,
      'client_can_choose_employee', client_can_choose_employee
    )
    from public.app_configuration
    where id = true
    limit 1
  ), jsonb_build_object(
    'company_name', 'Turnos App',
    'banner_data_url', null,
    'banner_file_name', null,
    'banner_mime_type', null,
    'banner_images', '[]'::jsonb,
    'promotions', '[]'::jsonb,
    'discounts', '[]'::jsonb,
    'client_can_choose_employee', false
  ))
$$;

create or replace function public.save_admin_app_configuration(
  company_name_value text default 'Turnos App',
  banner_data_url_value text default null,
  banner_file_name_value text default null,
  banner_mime_type_value text default null,
  banner_images_value jsonb default '[]'::jsonb,
  promotions_value jsonb default '[]'::jsonb,
  discounts_value jsonb default '[]'::jsonb,
  client_can_choose_employee_value boolean default false,
  account_id_value uuid default null,
  session_token_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_company_name text := nullif(trim(coalesce(company_name_value, '')), '');
  next_banner_images jsonb := coalesce(banner_images_value, '[]'::jsonb);
  next_promotions jsonb := coalesce(promotions_value, '[]'::jsonb);
  next_discounts jsonb := coalesce(discounts_value, '[]'::jsonb);
  banner_image jsonb;
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if next_company_name is null then
    next_company_name := 'Turnos App';
  end if;

  if char_length(next_company_name) > 40 then
    raise exception 'El nombre de la empresa debe tener hasta 40 caracteres.';
  end if;

  if banner_mime_type_value is not null and banner_mime_type_value not in ('image/jpeg', 'image/png') then
    raise exception 'El banner debe ser JPG o PNG.';
  end if;

  if banner_data_url_value is not null
    and banner_data_url_value not like 'data:image/jpeg;base64,%'
    and banner_data_url_value not like 'data:image/png;base64,%' then
    raise exception 'El banner debe estar codificado como imagen JPG o PNG.';
  end if;

  if jsonb_typeof(next_banner_images) <> 'array' then
    raise exception 'Las imagenes del banner deben enviarse como arreglo.';
  end if;

  if jsonb_array_length(next_banner_images) > 4 then
    raise exception 'El carrusel permite hasta 4 imagenes.';
  end if;

  for banner_image in select * from jsonb_array_elements(next_banner_images)
  loop
    if coalesce(banner_image->>'mimeType', '') not in ('image/jpeg', 'image/png') then
      raise exception 'Las imagenes del banner deben ser JPG o PNG.';
    end if;

    if coalesce(banner_image->>'dataUrl', '') not like 'data:image/jpeg;base64,%'
      and coalesce(banner_image->>'dataUrl', '') not like 'data:image/png;base64,%' then
      raise exception 'Las imagenes del banner deben estar codificadas como JPG o PNG.';
    end if;
  end loop;

  if jsonb_typeof(next_promotions) <> 'array' then
    raise exception 'Las promociones deben enviarse como arreglo.';
  end if;

  if jsonb_typeof(next_discounts) <> 'array' then
    raise exception 'Los descuentos deben enviarse como arreglo.';
  end if;

  insert into public.app_configuration (
    id,
    company_name,
    banner_data_url,
    banner_file_name,
    banner_mime_type,
    banner_images,
    promotions,
    discounts,
    client_can_choose_employee
  ) values (
    true,
    next_company_name,
    nullif(banner_data_url_value, ''),
    nullif(banner_file_name_value, ''),
    nullif(banner_mime_type_value, ''),
    next_banner_images,
    next_promotions,
    next_discounts,
    coalesce(client_can_choose_employee_value, false)
  )
  on conflict (id) do update set
    company_name = excluded.company_name,
    banner_data_url = excluded.banner_data_url,
    banner_file_name = excluded.banner_file_name,
    banner_mime_type = excluded.banner_mime_type,
    banner_images = excluded.banner_images,
    promotions = excluded.promotions,
    discounts = excluded.discounts,
    client_can_choose_employee = excluded.client_can_choose_employee;

  return public.get_app_configuration();
end;
$$;

create or replace function public.save_admin_service(
  service_id_value bigint,
  name_value text,
  icon_value text,
  color_value text,
  default_duration_value integer,
  base_price_value numeric,
  active_value boolean,
  account_id_value uuid default null,
  session_token_value text default null
)
returns table (
  id bigint,
  name text,
  icon text,
  color text,
  default_duration integer,
  base_price numeric,
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
  clean_base_price numeric := coalesce(base_price_value, 0);
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if clean_name is null then
    raise exception 'Ingresa el nombre del servicio.';
  end if;

  if clean_duration <= 0 then
    raise exception 'La duracion del servicio debe ser mayor a cero.';
  end if;

  if clean_base_price < 0 then
    raise exception 'El precio base no puede ser negativo.';
  end if;

  if service_id_value is null then
    return query
    insert into public.services (name, icon, color, default_duration, base_price, active)
    values (
      clean_name,
      nullif(trim(coalesce(icon_value, '')), ''),
      clean_color,
      clean_duration,
      clean_base_price,
      coalesce(active_value, true)
    )
    returning services.id, services.name, services.icon, services.color, services.default_duration, services.base_price, services.active;

    return;
  end if;

  return query
  update public.services
  set name = clean_name,
      icon = nullif(trim(coalesce(icon_value, '')), ''),
      color = clean_color,
      default_duration = clean_duration,
      base_price = clean_base_price,
      active = coalesce(active_value, true)
  where services.id = service_id_value
  returning services.id, services.name, services.icon, services.color, services.default_duration, services.base_price, services.active;

  if not found then
    raise exception 'El servicio no existe.';
  end if;
end;
$$;

create or replace function public.close_booking_attention(
  service_date_value date,
  client_name_value text default null,
  client_email_value text default null,
  booking_ids_value uuid[] default '{}',
  closure_items_value jsonb default '[]'::jsonb,
  total_discounts_value jsonb default '[]'::jsonb,
  gross_total_value numeric default 0,
  line_discount_total_value numeric default 0,
  total_discount_total_value numeric default 0,
  final_total_value numeric default 0,
  cash_amount_value numeric default 0,
  transfer_amount_value numeric default 0,
  card_amount_value numeric default 0,
  account_id_value uuid default null,
  session_token_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  saved_closure public.booking_closures%rowtype;
  booking_count integer;
  item jsonb;
begin
  if service_date_value is null then
    raise exception 'Selecciona la fecha del cierre.';
  end if;

  if service_date_value > current_date then
    raise exception 'No se pueden cerrar turnos de dias futuros.';
  end if;

  if booking_ids_value is null or array_length(booking_ids_value, 1) is null then
    raise exception 'Selecciona al menos un turno para cerrar.';
  end if;

  account_record := public.validate_internal_session(account_id_value, session_token_value, null);

  if account_record.role not in ('admin'::public.app_role, 'employee'::public.app_role) then
    raise exception 'No tenes permisos para cerrar turnos.';
  end if;

  if jsonb_typeof(coalesce(closure_items_value, '[]'::jsonb)) <> 'array' then
    raise exception 'El detalle del cierre debe enviarse como arreglo.';
  end if;

  if jsonb_typeof(coalesce(total_discounts_value, '[]'::jsonb)) <> 'array' then
    raise exception 'Los descuentos generales deben enviarse como arreglo.';
  end if;

  if abs(coalesce(cash_amount_value, 0) + coalesce(transfer_amount_value, 0) + coalesce(card_amount_value, 0) - coalesce(final_total_value, 0)) > 0.01 then
    raise exception 'La suma de los pagos debe coincidir con el total final.';
  end if;

  select count(*)
  into booking_count
  from public.bookings bookings
  where bookings.id = any(booking_ids_value)
    and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
    and bookings.start_at::date = service_date_value
    and (
      nullif(trim(coalesce(client_email_value, '')), '') is null
      or lower(coalesce(bookings.user_email, '')) = lower(trim(client_email_value))
    )
    and (
      nullif(trim(coalesce(client_email_value, '')), '') is not null
      or nullif(trim(coalesce(client_name_value, '')), '') is null
      or public.normalize_text(coalesce(bookings.customer_name, '')) = public.normalize_text(client_name_value)
    );

  if booking_count <> array_length(booking_ids_value, 1) then
    raise exception 'Hay turnos que no corresponden al cliente, fecha o estado seleccionado.';
  end if;

  if account_record.role = 'employee'::public.app_role and not exists (
    select 1
    from public.bookings bookings
    where bookings.start_at::date = service_date_value
      and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
      and bookings.employee_id = account_record.employee_id
      and (
        nullif(trim(coalesce(client_email_value, '')), '') is null
        or lower(coalesce(bookings.user_email, '')) = lower(trim(client_email_value))
      )
      and (
        nullif(trim(coalesce(client_email_value, '')), '') is not null
        or nullif(trim(coalesce(client_name_value, '')), '') is null
        or public.normalize_text(coalesce(bookings.customer_name, '')) = public.normalize_text(client_name_value)
      )
  ) then
    raise exception 'Solo podes cerrar clientes que tengan al menos un turno asignado a tu empleado ese dia.';
  end if;

  insert into public.booking_closures (
    client_name,
    client_email,
    service_date,
    gross_total,
    line_discount_total,
    total_discount_total,
    total_discounts,
    final_total,
    cash_amount,
    transfer_amount,
    card_amount,
    closed_by_account_id,
    closed_by_role
  ) values (
    nullif(trim(coalesce(client_name_value, '')), ''),
    nullif(trim(coalesce(client_email_value, '')), ''),
    service_date_value,
    coalesce(gross_total_value, 0),
    coalesce(line_discount_total_value, 0),
    coalesce(total_discount_total_value, 0),
    coalesce(total_discounts_value, '[]'::jsonb),
    coalesce(final_total_value, 0),
    coalesce(cash_amount_value, 0),
    coalesce(transfer_amount_value, 0),
    coalesce(card_amount_value, 0),
    account_record.id,
    account_record.role::text
  ) returning * into saved_closure;

  for item in select * from jsonb_array_elements(coalesce(closure_items_value, '[]'::jsonb))
  loop
    insert into public.booking_closure_items (
      closure_id,
      booking_id,
      service_name,
      employee_id,
      employee_name,
      base_price,
      line_discount_total,
      subtotal,
      applied_discounts
    ) values (
      saved_closure.id,
      (item->>'bookingId')::uuid,
      coalesce(nullif(trim(item->>'serviceName'), ''), 'Servicio'),
      nullif(item->>'employeeId', '')::uuid,
      nullif(trim(item->>'employeeName'), ''),
      coalesce((item->>'basePrice')::numeric, 0),
      coalesce((item->>'lineDiscountTotal')::numeric, 0),
      coalesce((item->>'subtotal')::numeric, 0),
      coalesce(item->'appliedDiscounts', '[]'::jsonb)
    );
  end loop;

  update public.bookings
  set status = 'completed',
      closed_at = now(),
      closure_id = saved_closure.id
  where bookings.id = any(booking_ids_value);

  return to_jsonb(saved_closure);
end;
$$;

revoke execute on function public.get_app_configuration() from public;
revoke execute on function public.save_admin_app_configuration(text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text) from public;
revoke execute on function public.save_admin_service(bigint, text, text, text, integer, numeric, boolean, uuid, text) from public;
revoke execute on function public.close_booking_attention(date, text, text, uuid[], jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text) from public;

grant execute on function public.get_app_configuration() to anon, authenticated;
grant execute on function public.save_admin_app_configuration(text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text) to anon, authenticated;
grant execute on function public.save_admin_service(bigint, text, text, text, integer, numeric, boolean, uuid, text) to anon, authenticated;
grant execute on function public.close_booking_attention(date, text, text, uuid[], jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text) to anon, authenticated;

grant select, insert, update on public.booking_closures to authenticated;
grant select, insert on public.booking_closure_items to authenticated;

commit;


-- ============================================================================
-- Source: database/027_allow_historic_availability.sql
-- ============================================================================

-- Allow internal users to create/edit historical availability for operational testing and back-office corrections.
-- Run after 026_closure_pricing_foundation.sql.

begin;

create or replace function public.save_admin_employee_availability(
  availability_id_value text,
  employee_id_value uuid,
  available_date_value date,
  start_time_value time without time zone,
  end_time_value time without time zone,
  active_value boolean default true,
  account_id_value uuid default null,
  session_token_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_availability public.employee_availability%rowtype;
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if employee_id_value is null then
    raise exception 'SeleccionÃ¡ un empleado.';
  end if;

  if available_date_value is null then
    raise exception 'La fecha de disponibilidad es invalida.';
  end if;

  if end_time_value <= start_time_value then
    raise exception 'La hora fin debe ser posterior a la hora inicio.';
  end if;

  if availability_id_value is null then
    insert into public.employee_availability (employee_id, available_date, weekday, start_time, end_time, active)
    values (employee_id_value, available_date_value, extract(dow from available_date_value)::smallint, start_time_value, end_time_value, coalesce(active_value, true))
    returning * into saved_availability;

    return to_jsonb(saved_availability);
  end if;

  update public.employee_availability
  set employee_id = employee_id_value,
      available_date = available_date_value,
      weekday = extract(dow from available_date_value)::smallint,
      start_time = start_time_value,
      end_time = end_time_value,
      active = coalesce(active_value, true),
      updated_at = now()
  where employee_availability.id::text = availability_id_value
  returning * into saved_availability;

  if saved_availability.id is null then
    raise exception 'La disponibilidad no existe.';
  end if;

  return to_jsonb(saved_availability);
end;
$$;

create or replace function public.create_internal_employee_availability(
  account_id_value uuid,
  available_date_value date,
  start_time_value time without time zone,
  end_time_value time without time zone,
  active_value boolean default true,
  session_token_value text default null
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
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);

  if account_record.employee_id is null then
    raise exception 'La cuenta interna no esta vinculada a un empleado activo.';
  end if;

  if available_date_value is null then
    raise exception 'La fecha de disponibilidad es invalida.';
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
  active_value boolean default true,
  session_token_value text default null
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
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);

  if account_record.employee_id is null then
    raise exception 'La cuenta interna no esta vinculada a un empleado activo.';
  end if;

  if available_date_value is null then
    raise exception 'La fecha de disponibilidad es invalida.';
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
    raise exception 'La disponibilidad no existe.';
  end if;

  return to_jsonb(saved_availability);
end;
$$;

revoke execute on function public.save_admin_employee_availability(text, uuid, date, time without time zone, time without time zone, boolean, uuid, text) from public;
revoke execute on function public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean, text) from public;
revoke execute on function public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean, text) from public;

grant execute on function public.save_admin_employee_availability(text, uuid, date, time without time zone, time without time zone, boolean, uuid, text) to anon, authenticated;
grant execute on function public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean, text) to anon, authenticated;
grant execute on function public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/028_activity_discount_checks.sql
-- ============================================================================

-- Activity discount check assignment for services.
-- Run after 027_allow_historic_availability.sql.

begin;

alter table public.services
  add column if not exists activity_discount_check_id text;

drop function if exists public.save_admin_service(bigint, text, text, text, integer, numeric, boolean, uuid, text);

create or replace function public.save_admin_service(
  service_id_value bigint,
  name_value text,
  icon_value text,
  color_value text,
  default_duration_value integer,
  base_price_value numeric,
  active_value boolean,
  account_id_value uuid default null,
  session_token_value text default null,
  activity_discount_check_id_value text default null
)
returns table (
  id bigint,
  name text,
  icon text,
  color text,
  default_duration integer,
  base_price numeric,
  active boolean,
  activity_discount_check_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := nullif(trim(coalesce(name_value, '')), '');
  clean_color text := coalesce(nullif(trim(coalesce(color_value, '')), ''), '#42A5F5');
  clean_duration integer := coalesce(default_duration_value, 30);
  clean_base_price numeric := coalesce(base_price_value, 0);
  clean_activity_discount_check_id text := nullif(trim(coalesce(activity_discount_check_id_value, '')), '');
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if clean_name is null then
    raise exception 'Ingresa el nombre del servicio.';
  end if;

  if clean_duration <= 0 then
    raise exception 'La duracion del servicio debe ser mayor a cero.';
  end if;

  if clean_base_price < 0 then
    raise exception 'El precio base no puede ser negativo.';
  end if;

  if service_id_value is null then
    return query
    insert into public.services (name, icon, color, default_duration, base_price, active, activity_discount_check_id)
    values (
      clean_name,
      nullif(trim(coalesce(icon_value, '')), ''),
      clean_color,
      clean_duration,
      clean_base_price,
      coalesce(active_value, true),
      clean_activity_discount_check_id
    )
    returning services.id, services.name, services.icon, services.color, services.default_duration, services.base_price, services.active, services.activity_discount_check_id;

    return;
  end if;

  return query
  update public.services
  set name = clean_name,
      icon = nullif(trim(coalesce(icon_value, '')), ''),
      color = clean_color,
      default_duration = clean_duration,
      base_price = clean_base_price,
      active = coalesce(active_value, true),
      activity_discount_check_id = clean_activity_discount_check_id
  where services.id = service_id_value
  returning services.id, services.name, services.icon, services.color, services.default_duration, services.base_price, services.active, services.activity_discount_check_id;

  if not found then
    raise exception 'El servicio no existe.';
  end if;
end;
$$;

revoke execute on function public.save_admin_service(bigint, text, text, text, integer, numeric, boolean, uuid, text, text) from public;
grant execute on function public.save_admin_service(bigint, text, text, text, integer, numeric, boolean, uuid, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/029_employee_workspace_completed_bookings.sql
-- ============================================================================

-- Include completed bookings in internal employee workspace so closed appointments remain visible with lock.
-- Run after 028_activity_discount_checks.sql.

begin;

create or replace function public.get_internal_employee_workspace_legacy(
  account_id_value uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  payload jsonb;
begin
  select *
  into account_record
  from public.internal_accounts accounts
  where accounts.id = account_id_value
    and accounts.active = true
    and accounts.employee_id is not null
  limit 1;

  if account_record.id is null then
    raise exception 'La cuenta interna no esta vinculada a un empleado activo.';
  end if;

  select jsonb_build_object(
    'employee', coalesce((
      select to_jsonb(employees)
      from public.employees employees
      where employees.id = account_record.employee_id
        and employees.deleted_at is null
      limit 1
    ), 'null'::jsonb),
    'employees', coalesce((
      select jsonb_agg(to_jsonb(employee_rows) order by employee_rows.name)
      from (
        select *
        from public.employees employees
        where employees.deleted_at is null
      ) employee_rows
    ), '[]'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(booking_rows) order by booking_rows.start_at)
      from (
        select *
        from public.bookings bookings
        where bookings.status in ('reserved', 'confirmed', 'pending_assignment', 'completed')
        order by bookings.start_at
      ) booking_rows
    ), '[]'::jsonb),
    'bookingClosureItems', coalesce((
      select jsonb_agg(to_jsonb(closure_item_rows) order by closure_item_rows.created_at)
      from (
        select closure_items.*
        from public.booking_closure_items closure_items
        join public.bookings bookings on bookings.id = closure_items.booking_id
        where bookings.status = 'completed'
      ) closure_item_rows
    ), '[]'::jsonb),
    'bookingClosures', coalesce((
      select jsonb_agg(to_jsonb(closure_rows) order by closure_rows.created_at)
      from (
        select distinct closures.*
        from public.booking_closures closures
        join public.booking_closure_items closure_items on closure_items.closure_id = closures.id
        join public.bookings bookings on bookings.id = closure_items.booking_id
        where bookings.status = 'completed'
      ) closure_rows
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(to_jsonb(service_rows) order by service_rows.id)
      from (select * from public.services order by id) service_rows
    ), '[]'::jsonb),
    'employeeServices', coalesce((
      select jsonb_agg(to_jsonb(relation_rows))
      from (
        select * from public.employee_services
      ) relation_rows
    ), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(to_jsonb(availability_rows) order by availability_rows.available_date, availability_rows.start_time)
      from (
        select *
        from public.employee_availability availability
        where availability.employee_id = account_record.employee_id
        order by availability.available_date, availability.start_time
      ) availability_rows
    ), '[]'::jsonb),
    'agendaAvailability', coalesce((
      select jsonb_agg(to_jsonb(availability_rows) order by availability_rows.available_date, availability_rows.start_time)
      from (
        select *
        from public.employee_availability availability
        order by availability.available_date, availability.start_time
      ) availability_rows
    ), '[]'::jsonb)
  ) into payload;

  return payload;
end;
$$;

revoke execute on function public.get_internal_employee_workspace_legacy(uuid) from public;
grant execute on function public.get_internal_employee_workspace_legacy(uuid) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/030_client_welcome_background.sql
-- ============================================================================

-- Add a configurable background image for the client welcome section.
-- Run after 029_employee_workspace_completed_bookings.sql on existing databases.

begin;

alter table public.app_configuration
  add column if not exists welcome_background_data_url text,
  add column if not exists welcome_background_file_name text,
  add column if not exists welcome_background_mime_type text;

alter table public.app_configuration
  drop constraint if exists app_configuration_welcome_background_mime_chk;

alter table public.app_configuration
  add constraint app_configuration_welcome_background_mime_chk check (
    welcome_background_mime_type is null or welcome_background_mime_type in ('image/jpeg', 'image/png')
  );

alter table public.app_configuration
  drop constraint if exists app_configuration_welcome_background_data_chk;

alter table public.app_configuration
  add constraint app_configuration_welcome_background_data_chk check (
    welcome_background_data_url is null
    or welcome_background_data_url like 'data:image/jpeg;base64,%'
    or welcome_background_data_url like 'data:image/png;base64,%'
  );

drop function if exists public.save_admin_app_configuration(text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text);

create or replace function public.get_app_configuration()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'company_name', company_name,
      'welcome_background_data_url', welcome_background_data_url,
      'welcome_background_file_name', welcome_background_file_name,
      'welcome_background_mime_type', welcome_background_mime_type,
      'banner_data_url', banner_data_url,
      'banner_file_name', banner_file_name,
      'banner_mime_type', banner_mime_type,
      'banner_images', banner_images,
      'promotions', promotions,
      'discounts', discounts,
      'client_can_choose_employee', client_can_choose_employee
    )
    from public.app_configuration
    where id = true
    limit 1
  ), jsonb_build_object(
    'company_name', 'Turnos App',
    'welcome_background_data_url', null,
    'welcome_background_file_name', null,
    'welcome_background_mime_type', null,
    'banner_data_url', null,
    'banner_file_name', null,
    'banner_mime_type', null,
    'banner_images', '[]'::jsonb,
    'promotions', '[]'::jsonb,
    'discounts', '[]'::jsonb,
    'client_can_choose_employee', false
  ))
$$;

create or replace function public.save_admin_app_configuration(
  company_name_value text default 'Turnos App',
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
  session_token_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_company_name text := nullif(trim(coalesce(company_name_value, '')), '');
  next_banner_images jsonb := coalesce(banner_images_value, '[]'::jsonb);
  next_promotions jsonb := coalesce(promotions_value, '[]'::jsonb);
  next_discounts jsonb := coalesce(discounts_value, '[]'::jsonb);
  banner_image jsonb;
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if next_company_name is null then
    next_company_name := 'Turnos App';
  end if;

  if char_length(next_company_name) > 40 then
    raise exception 'El nombre de la empresa debe tener hasta 40 caracteres.';
  end if;

  if welcome_background_mime_type_value is not null and welcome_background_mime_type_value not in ('image/jpeg', 'image/png') then
    raise exception 'El fondo de bienvenida debe ser JPG o PNG.';
  end if;

  if welcome_background_data_url_value is not null
    and welcome_background_data_url_value not like 'data:image/jpeg;base64,%'
    and welcome_background_data_url_value not like 'data:image/png;base64,%' then
    raise exception 'El fondo de bienvenida debe estar codificado como imagen JPG o PNG.';
  end if;

  if banner_mime_type_value is not null and banner_mime_type_value not in ('image/jpeg', 'image/png') then
    raise exception 'El banner debe ser JPG o PNG.';
  end if;

  if banner_data_url_value is not null
    and banner_data_url_value not like 'data:image/jpeg;base64,%'
    and banner_data_url_value not like 'data:image/png;base64,%' then
    raise exception 'El banner debe estar codificado como imagen JPG o PNG.';
  end if;

  if jsonb_typeof(next_banner_images) <> 'array' then
    raise exception 'Las imagenes del banner deben enviarse como arreglo.';
  end if;

  if jsonb_array_length(next_banner_images) > 4 then
    raise exception 'El carrusel permite hasta 4 imagenes.';
  end if;

  for banner_image in select * from jsonb_array_elements(next_banner_images)
  loop
    if coalesce(banner_image->>'mimeType', '') not in ('image/jpeg', 'image/png') then
      raise exception 'Las imagenes del banner deben ser JPG o PNG.';
    end if;

    if coalesce(banner_image->>'dataUrl', '') not like 'data:image/jpeg;base64,%'
      and coalesce(banner_image->>'dataUrl', '') not like 'data:image/png;base64,%' then
      raise exception 'Las imagenes del banner deben estar codificadas como JPG o PNG.';
    end if;
  end loop;

  if jsonb_typeof(next_promotions) <> 'array' then
    raise exception 'Las promociones deben enviarse como arreglo.';
  end if;

  if jsonb_typeof(next_discounts) <> 'array' then
    raise exception 'Los descuentos deben enviarse como arreglo.';
  end if;

  insert into public.app_configuration (
    id,
    company_name,
    welcome_background_data_url,
    welcome_background_file_name,
    welcome_background_mime_type,
    banner_data_url,
    banner_file_name,
    banner_mime_type,
    banner_images,
    promotions,
    discounts,
    client_can_choose_employee
  ) values (
    true,
    next_company_name,
    nullif(welcome_background_data_url_value, ''),
    nullif(welcome_background_file_name_value, ''),
    nullif(welcome_background_mime_type_value, ''),
    nullif(banner_data_url_value, ''),
    nullif(banner_file_name_value, ''),
    nullif(banner_mime_type_value, ''),
    next_banner_images,
    next_promotions,
    next_discounts,
    coalesce(client_can_choose_employee_value, false)
  )
  on conflict (id) do update set
    company_name = excluded.company_name,
    welcome_background_data_url = excluded.welcome_background_data_url,
    welcome_background_file_name = excluded.welcome_background_file_name,
    welcome_background_mime_type = excluded.welcome_background_mime_type,
    banner_data_url = excluded.banner_data_url,
    banner_file_name = excluded.banner_file_name,
    banner_mime_type = excluded.banner_mime_type,
    banner_images = excluded.banner_images,
    promotions = excluded.promotions,
    discounts = excluded.discounts,
    client_can_choose_employee = excluded.client_can_choose_employee;

  return public.get_app_configuration();
end;
$$;

revoke execute on function public.get_app_configuration() from public;
revoke execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text) from public;

grant execute on function public.get_app_configuration() to anon, authenticated;
grant execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/031_admin_monthly_closure_summary.sql
-- ============================================================================

-- Add current-month closure totals to the admin panel payload.
-- Run after 030_client_welcome_background.sql on existing databases.

begin;

create or replace function public.get_admin_panel_data_legacy(
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
    raise exception 'Solo un administrador puede ver datos de administraciÃ³n.';
  end if;

  select jsonb_build_object(
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(booking_rows) order by booking_rows.start_at)
      from (select * from public.bookings order by start_at) booking_rows
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
    'currentMonthClosureSummary', coalesce((
      select jsonb_build_object(
        'booking_count', count(month_rows.booking_id),
        'total', coalesce(sum(month_rows.amount), 0)
      )
      from (
        select
          closure_items.booking_id,
          greatest(
            0,
            closure_items.subtotal - case
              when closure_totals.subtotal_total > 0
              then (closure_items.subtotal / closure_totals.subtotal_total) * closures.total_discount_total
              else 0
            end
          ) as amount
        from public.booking_closure_items closure_items
        join public.booking_closures closures on closures.id = closure_items.closure_id
        join (
          select closure_id, sum(subtotal) as subtotal_total
          from public.booking_closure_items
          group by closure_id
        ) closure_totals on closure_totals.closure_id = closure_items.closure_id
        where closures.created_at >= date_trunc('month', current_date)
          and closures.created_at < date_trunc('month', current_date) + interval '1 month'
      ) month_rows
    ), jsonb_build_object('booking_count', 0, 'total', 0)),
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

revoke execute on function public.get_admin_panel_data_legacy(uuid, text) from public;
grant execute on function public.get_admin_panel_data_legacy(uuid, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/032_business_hours_configuration.sql
-- ============================================================================

-- Add configurable business hours text for the client welcome banner.
-- Run after 031_admin_monthly_closure_summary.sql on existing databases.

begin;

alter table public.app_configuration
  add column if not exists business_hours_text text not null default '';

alter table public.app_configuration
  drop constraint if exists app_configuration_business_hours_text_length_chk;

alter table public.app_configuration
  add constraint app_configuration_business_hours_text_length_chk
  check (char_length(business_hours_text) <= 500);

drop function if exists public.save_admin_app_configuration(text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text);

create or replace function public.get_app_configuration()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'company_name', company_name,
      'business_hours_text', business_hours_text,
      'welcome_background_data_url', welcome_background_data_url,
      'welcome_background_file_name', welcome_background_file_name,
      'welcome_background_mime_type', welcome_background_mime_type,
      'banner_data_url', banner_data_url,
      'banner_file_name', banner_file_name,
      'banner_mime_type', banner_mime_type,
      'banner_images', banner_images,
      'promotions', promotions,
      'discounts', discounts,
      'client_can_choose_employee', client_can_choose_employee
    )
    from public.app_configuration
    where id = true
    limit 1
  ), jsonb_build_object(
    'company_name', 'Turnos App',
    'business_hours_text', '',
    'welcome_background_data_url', null,
    'welcome_background_file_name', null,
    'welcome_background_mime_type', null,
    'banner_data_url', null,
    'banner_file_name', null,
    'banner_mime_type', null,
    'banner_images', '[]'::jsonb,
    'promotions', '[]'::jsonb,
    'discounts', '[]'::jsonb,
    'client_can_choose_employee', false
  ))
$$;

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
  session_token_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_company_name text := nullif(trim(coalesce(company_name_value, '')), '');
  next_business_hours_text text := trim(coalesce(business_hours_text_value, ''));
  next_banner_images jsonb := coalesce(banner_images_value, '[]'::jsonb);
  next_promotions jsonb := coalesce(promotions_value, '[]'::jsonb);
  next_discounts jsonb := coalesce(discounts_value, '[]'::jsonb);
  banner_image jsonb;
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if next_company_name is null then
    next_company_name := 'Turnos App';
  end if;

  if char_length(next_company_name) > 40 then
    raise exception 'El nombre de la empresa debe tener hasta 40 caracteres.';
  end if;

  if char_length(next_business_hours_text) > 500 then
    raise exception 'El horario de atencion debe tener hasta 500 caracteres.';
  end if;

  if welcome_background_mime_type_value is not null and welcome_background_mime_type_value not in ('image/jpeg', 'image/png') then
    raise exception 'El fondo de bienvenida debe ser JPG o PNG.';
  end if;

  if welcome_background_data_url_value is not null
    and welcome_background_data_url_value not like 'data:image/jpeg;base64,%'
    and welcome_background_data_url_value not like 'data:image/png;base64,%' then
    raise exception 'El fondo de bienvenida debe estar codificado como imagen JPG o PNG.';
  end if;

  if banner_mime_type_value is not null and banner_mime_type_value not in ('image/jpeg', 'image/png') then
    raise exception 'El banner debe ser JPG o PNG.';
  end if;

  if banner_data_url_value is not null
    and banner_data_url_value not like 'data:image/jpeg;base64,%'
    and banner_data_url_value not like 'data:image/png;base64,%' then
    raise exception 'El banner debe estar codificado como imagen JPG o PNG.';
  end if;

  if jsonb_typeof(next_banner_images) <> 'array' then
    raise exception 'Las imagenes del banner deben enviarse como arreglo.';
  end if;

  if jsonb_array_length(next_banner_images) > 4 then
    raise exception 'El carrusel permite hasta 4 imagenes.';
  end if;

  for banner_image in select * from jsonb_array_elements(next_banner_images)
  loop
    if coalesce(banner_image->>'mimeType', '') not in ('image/jpeg', 'image/png') then
      raise exception 'Las imagenes del banner deben ser JPG o PNG.';
    end if;

    if coalesce(banner_image->>'dataUrl', '') not like 'data:image/jpeg;base64,%'
      and coalesce(banner_image->>'dataUrl', '') not like 'data:image/png;base64,%' then
      raise exception 'Las imagenes del banner deben estar codificadas como JPG o PNG.';
    end if;
  end loop;

  if jsonb_typeof(next_promotions) <> 'array' then
    raise exception 'Las promociones deben enviarse como arreglo.';
  end if;

  if jsonb_typeof(next_discounts) <> 'array' then
    raise exception 'Los descuentos deben enviarse como arreglo.';
  end if;

  insert into public.app_configuration (
    id,
    company_name,
    business_hours_text,
    welcome_background_data_url,
    welcome_background_file_name,
    welcome_background_mime_type,
    banner_data_url,
    banner_file_name,
    banner_mime_type,
    banner_images,
    promotions,
    discounts,
    client_can_choose_employee
  ) values (
    true,
    next_company_name,
    next_business_hours_text,
    nullif(welcome_background_data_url_value, ''),
    nullif(welcome_background_file_name_value, ''),
    nullif(welcome_background_mime_type_value, ''),
    nullif(banner_data_url_value, ''),
    nullif(banner_file_name_value, ''),
    nullif(banner_mime_type_value, ''),
    next_banner_images,
    next_promotions,
    next_discounts,
    coalesce(client_can_choose_employee_value, false)
  )
  on conflict (id) do update set
    company_name = excluded.company_name,
    business_hours_text = excluded.business_hours_text,
    welcome_background_data_url = excluded.welcome_background_data_url,
    welcome_background_file_name = excluded.welcome_background_file_name,
    welcome_background_mime_type = excluded.welcome_background_mime_type,
    banner_data_url = excluded.banner_data_url,
    banner_file_name = excluded.banner_file_name,
    banner_mime_type = excluded.banner_mime_type,
    banner_images = excluded.banner_images,
    promotions = excluded.promotions,
    discounts = excluded.discounts,
    client_can_choose_employee = excluded.client_can_choose_employee;

  return public.get_app_configuration();
end;
$$;

revoke execute on function public.get_app_configuration() from public;
revoke execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text) from public;

grant execute on function public.get_app_configuration() to anon, authenticated;
grant execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/033_employee_email_notifications.sql
-- ============================================================================

-- Employee emails and automatic mail notifications through Resend.
-- Run after 032_business_hours_configuration.sql on existing databases.

begin;

create extension if not exists pg_net;

create or replace function public.is_valid_email(email_value text)
returns boolean
language sql
immutable
as $$
  select nullif(trim(coalesce(email_value, '')), '') is not null
    and trim(email_value) ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
$$;

alter table public.employees
  add column if not exists email text;

alter table public.internal_registration_requests
  add column if not exists email text;

alter table public.employees
  drop constraint if exists employees_email_chk;

alter table public.employees
  add constraint employees_email_chk check (email is null or public.is_valid_email(email));

alter table public.internal_registration_requests
  drop constraint if exists internal_registration_requests_email_chk;

alter table public.internal_registration_requests
  add constraint internal_registration_requests_email_chk check (email is null or public.is_valid_email(email));

create index if not exists employees_email_idx
  on public.employees(lower(email))
  where email is not null;

create table if not exists public.mail_settings (
  id boolean primary key default true,
  resend_api_key text,
  from_email text not null default 'noresponder@quieroturnoapp.com.ar',
  from_name text not null default 'Quiero Turno App - No responder',
  active boolean not null default true,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  constraint mail_settings_singleton_chk check (id = true),
  constraint mail_settings_from_email_chk check (public.is_valid_email(from_email))
);

insert into public.mail_settings (id)
values (true)
-- Final singleton check for app_configuration
do $$
begin
  insert into public.app_configuration (id) values (true);
exception when unique_violation then
  -- app_configuration already exists, ignore
end;
$$;

update public.mail_settings
set from_email = 'noresponder@quieroturnoapp.com.ar',
    from_name = 'Quiero Turno App - No responder',
    updated_at = now()
where id = true;

revoke all on public.mail_settings from public;
revoke all on public.mail_settings from anon;
revoke all on public.mail_settings from authenticated;

create or replace function public.send_resend_email(
  to_email_value text,
  subject_value text,
  message_value text,
  from_name_value text default 'Quiero Turno App - No responder',
  reply_to_value text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_to_email text := lower(trim(coalesce(to_email_value, '')));
  settings public.mail_settings%rowtype;
  sender_name text;
begin
  if not public.is_valid_email(clean_to_email) then
    return;
  end if;

  select * into settings
  from public.mail_settings
  where id = true
    and active = true
    and nullif(trim(coalesce(resend_api_key, '')), '') is not null
  limit 1;

  if settings.id is null then
    return;
  end if;

  sender_name := nullif(trim(coalesce(from_name_value, '')), '');
  if sender_name is null then
    sender_name := settings.from_name;
  end if;

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || settings.resend_api_key
    ),
    body := jsonb_build_object(
      'from', sender_name || ' <' || settings.from_email || '>',
      'to', jsonb_build_array(clean_to_email),
      'subject', subject_value,
      'text', message_value,
      'reply_to', settings.from_email
    ),
    timeout_milliseconds := 5000
  );
end;
$$;

-- ============================================================================
-- Email notification functions
-- ============================================================================

create or replace function public.html_escape(value text)
returns text
language sql
immutable
as $$
  select replace(
    replace(
      replace(
        replace(
          replace(coalesce(value, ''), '&', '&amp;'),
          '<', '&lt;'),
        '>', '&gt;'),
      '"', '&quot;'),
    '''', '&#39;')
$$;

create or replace function public.get_mail_app_url(company_id_value uuid default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim((select app_url from public.mail_settings where id = true limit 1)), ''),
    'https://quieroturnoapp.com.ar'
  )
$$;

create or replace function public.build_mail_app_link(company_id_value uuid default null, hash_value text default '')
returns text
language sql
stable
security definer
set search_path = public
as $$
  with selected_company as (
    select companies.slug
    from public.companies companies
    where companies.id = company_id_value
    limit 1
  ), base_url as (
    select regexp_replace(public.get_mail_app_url(company_id_value), '/+$', '') as value
  ), normalized_hash as (
    select trim(coalesce(hash_value, '')) as value
  )
  select (select value from base_url) ||
    coalesce('/' || (select slug from selected_company), '') ||
    case
      when nullif((select value from normalized_hash), '') is null then ''
      when (select value from normalized_hash) in ('admin-agenda', 'employee-agenda') then '/admin#' || (select value from normalized_hash)
      when left((select value from normalized_hash), 1) = '#' then (select value from normalized_hash)
      else '#' || (select value from normalized_hash)
    end
$$;

create or replace function public.notify_admin_emails(subject_value text, message_value text, reply_to_value text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_email text;
begin
  for admin_email in
    select distinct lower(trim(employees.email))
    from public.employees employees
    join public.internal_accounts accounts
      on accounts.employee_id = employees.id
      and accounts.role = 'admin'::public.app_role
      and accounts.active = true
    where employees.active is not false
      and employees.deleted_at is null
      and public.is_valid_email(employees.email)
  loop
    perform public.send_resend_email(admin_email, subject_value, message_value, 'Quiero Turno App - No responder', reply_to_value);
  end loop;
end;
$$;

create or replace function public.format_booking_notification_message(booking_value public.bookings, event_label text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  service_name text;
  employee_name text;
begin
  select services.name into service_name
  from public.services services
  where services.id = booking_value.service;

  select coalesce(nullif(trim(concat_ws(' ', employees.first_name, employees.last_name)), ''), employees.name)
  into employee_name
  from public.employees employees
  where employees.id = booking_value.employee_id;

  return concat_ws(E'\n',
    event_label,
    'Cliente: ' || coalesce(nullif(booking_value.customer_name, ''), nullif(booking_value.user_email, ''), 'Cliente sin datos'),
    case when public.is_valid_email(booking_value.user_email) then 'Mail cliente: ' || booking_value.user_email else null end,
    'Servicio: ' || coalesce(nullif(booking_value.booking_description, ''), service_name, 'Turno'),
    case when employee_name is not null then 'Empleado: ' || employee_name else 'Empleado: pendiente de asignaciÃ³n' end,
    'Inicio: ' || to_char(booking_value.start_at, 'DD/MM/YYYY HH24:MI'),
    'Fin: ' || to_char(booking_value.end_at, 'DD/MM/YYYY HH24:MI')
  );
end;
$$;

create or replace function public.format_booking_notification_html(
  booking_value public.bookings,
  event_label text,
  cta_label text default null,
  cta_url text default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  service_name text;
  employee_name text;
  activity_name text;
  client_name text;
  event_intro text;
  badge_label text;
  clean_cta_label text := nullif(trim(coalesce(cta_label, '')), '');
  clean_cta_url text := nullif(trim(coalesce(cta_url, '')), '');
begin
  select services.name into service_name
  from public.services services
  where services.id = booking_value.service;

  select coalesce(nullif(trim(concat_ws(' ', employees.first_name, employees.last_name)), ''), employees.name)
  into employee_name
  from public.employees employees
  where employees.id = booking_value.employee_id;

  activity_name := coalesce(nullif(booking_value.booking_description, ''), service_name, 'Turno');
  client_name := coalesce(nullif(booking_value.customer_name, ''), nullif(booking_value.user_email, ''), 'Cliente sin datos');

  event_intro := case
    when event_label ilike '%recordatorio%' then 'Te esperamos pronto. Te dejamos los datos del turno para que los tengas a mano.'
    when event_label ilike '%confirmado%' then 'Tu reserva ya tiene profesional asignado. GuardÃ¡ este detalle para llegar con tranquilidad.'
    when event_label ilike '%pendiente%' then 'Hay una solicitud esperando asignaciÃ³n de empleado. Revisala desde la agenda para confirmar el turno.'
    when event_label ilike '%asignado%' then 'Se agregÃ³ un nuevo turno a tu agenda laboral. RevisÃ¡ los datos antes de la atenciÃ³n.'
    when event_label ilike '%cancelÃ³%' then 'Te avisamos que este turno fue cancelado y ya no figura como atenciÃ³n pendiente.'
    else 'Te compartimos el detalle actualizado del turno.'
  end;

  badge_label := case
    when event_label ilike '%recordatorio%' then 'Recordatorio'
    when event_label ilike '%confirmado%' then 'ConfirmaciÃ³n'
    when event_label ilike '%pendiente%' then 'AcciÃ³n requerida'
    when event_label ilike '%asignado%' then 'Agenda'
    when event_label ilike '%cancelÃ³%' then 'CancelaciÃ³n'
    else 'Quiero Turno App'
  end;

  return '<div style="margin:0;padding:0;background:#eef7f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937">'
    || '<div style="display:none;max-height:0;overflow:hidden;color:#eef7f8">' || public.html_escape(event_intro) || '</div>'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#eef7f8;padding:0;margin:0"><tr><td align="center" style="padding:28px 12px">'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:620px;background:#ffffff;border:1px solid #d6e7ea;border-radius:16px;overflow:hidden;box-shadow:0 14px 34px rgba(15,23,42,0.10)">'
    || '<tr><td style="padding:24px 26px;background:#26313a;color:#ffffff">'
    || '<div style="font-size:12px;line-height:1;text-transform:uppercase;letter-spacing:.08em;color:#8de1e8;font-weight:700">Quiero Turno</div>'
    || '<div style="margin-top:12px;display:inline-block;border:1px solid rgba(141,225,232,.55);border-radius:999px;padding:6px 10px;color:#dffcff;background:rgba(36,174,187,.16);font-size:12px;font-weight:700">' || public.html_escape(badge_label) || '</div>'
    || '<h1 style="margin:14px 0 0;color:#ffffff;font-size:24px;line-height:1.22;font-weight:800">' || public.html_escape(event_label) || '</h1>'
    || '<p style="margin:10px 0 0;color:#d7e4e8;font-size:15px;line-height:1.55">' || public.html_escape(event_intro) || '</p>'
    || '</td></tr>'
    || '<tr><td style="padding:24px 26px 8px">'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;width:100%">'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Cliente</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(client_name) || '</td></tr>'
    || case when public.is_valid_email(booking_value.user_email) then '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Mail</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(booking_value.user_email) || '</td></tr>' else '' end
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Servicio</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(activity_name) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Empleado</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(coalesce(employee_name, 'Pendiente de asignaciÃ³n')) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Inicio</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(to_char(booking_value.start_at, 'DD/MM/YYYY HH24:MI')) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Fin</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(to_char(booking_value.end_at, 'DD/MM/YYYY HH24:MI')) || '</td></tr>'
    || '</table>'
    || case when clean_cta_label is not null and clean_cta_url is not null then
      '<div style="padding:10px 0 22px;text-align:center"><a href="' || public.html_escape(clean_cta_url) || '" style="display:inline-block;background:#24aebb;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 20px;font-size:15px;font-weight:800;box-shadow:0 8px 18px rgba(36,174,187,.22)">' || public.html_escape(clean_cta_label) || '</a></div>'
      else '' end
    || '</td></tr>'
    || '<tr><td style="padding:18px 26px;background:#f6fbfc;border-top:1px solid #e3edf0;color:#64748b;font-size:13px;line-height:1.5;text-align:center">Este es un mensaje automÃ¡tico de Quiero Turno. No respondas este mail.</td></tr>'
    || '</table>'
    || '</td></tr></table>'
    || '</div>';
end;
$$;

create or replace function public.send_booking_email_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_email text;
  client_message text;
  admin_message text;
  employee_message text;
  client_html text;
  admin_html text;
  employee_html text;
  employee_agenda_url text := public.build_mail_app_link(NEW.company_id, 'employee-agenda');
  admin_assignment_url text := public.build_mail_app_link(NEW.company_id, 'admin-agenda');
begin
  if TG_OP = 'INSERT' and NEW.status in ('reserved', 'confirmed', 'pending_assignment') then
    if NEW.status = 'pending_assignment' or NEW.employee_id is null then
      admin_message := public.format_booking_notification_message(NEW, 'Hay un turno pendiente para asignar.') || E'\n\nAsignar turno: ' || admin_assignment_url;
      admin_html := public.format_booking_notification_html(NEW, 'Hay un turno pendiente para asignar.', 'Asignar turno', admin_assignment_url);

      for employee_email in
        select distinct lower(trim(employees.email))
        from public.employees employees
        join public.internal_accounts accounts
          on accounts.employee_id = employees.id
          and accounts.role = 'admin'::public.app_role
          and accounts.active = true
        where employees.active is not false
          and employees.deleted_at is null
          and public.is_valid_email(employees.email)
      loop
        perform public.send_resend_email(employee_email, 'Hay un turno pendiente para asignar', admin_message, 'Quiero Turno App - No responder', NEW.user_email, admin_html);
      end loop;
    end if;

    if NEW.employee_id is not null then
      if public.is_valid_email(NEW.user_email) then
        client_message := public.format_booking_notification_message(NEW, 'Tu turno fue confirmado.');
        client_html := public.format_booking_notification_html(NEW, 'Tu turno fue confirmado.');
        perform public.send_resend_email(NEW.user_email, 'Tu turno fue confirmado', client_message, 'Quiero Turno App - No responder', null, client_html);
      end if;

      select employees.email into employee_email
      from public.employees employees
      where employees.id = NEW.employee_id;

      employee_message := public.format_booking_notification_message(NEW, 'TenÃ©s un nuevo turno asignado.') || E'\n\nIr a Agenda: ' || employee_agenda_url;
      employee_html := public.format_booking_notification_html(NEW, 'TenÃ©s un nuevo turno asignado.', 'Ir a Agenda', employee_agenda_url);
      perform public.send_resend_email(employee_email, 'TenÃ©s un nuevo turno asignado', employee_message, 'Quiero Turno App - No responder', NEW.user_email, employee_html);
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists bookings_send_email_notifications on public.bookings;
create trigger bookings_send_email_notifications
after insert or update of status, employee_id on public.bookings
for each row
execute function public.send_booking_email_notifications();

create or replace function public.send_internal_request_email_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_message text;
begin
  if NEW.status = 'pending' then
    request_message := concat_ws(E'\n',
      'Hay un acceso interno pendiente para aceptar.',
      'Perfil: ' || NEW.role::text,
      'Nombre: ' || coalesce(nullif(NEW.display_name, ''), 'Sin nombre'),
      'Usuario: ' || coalesce(nullif(NEW.username, ''), 'Sin usuario'),
      case when public.is_valid_email(NEW.email) then 'Mail: ' || NEW.email else null end,
      case when nullif(NEW.phone, '') is not null then 'Celular: ' || NEW.phone else null end,
      'EntrÃ¡ al panel de administraciÃ³n para aprobar o rechazar la solicitud.'
    );

    perform public.notify_admin_emails('Hay un empleado nuevo para aceptar', request_message, NEW.email);
  end if;

  return NEW;
end;
$$;

drop trigger if exists internal_requests_send_email_notifications on public.internal_registration_requests;
create trigger internal_requests_send_email_notifications
after insert on public.internal_registration_requests
for each row
execute function public.send_internal_request_email_notifications();

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
  email_value text default null
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
  created_employee record;
  saved_employee public.employees%rowtype;
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
  welcome_message text;
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'IngresÃ¡ un mail vÃ¡lido para el empleado.';
  end if;

  for created_employee in
    select *
    from public.create_admin_employee_legacy(name_value, first_name_value, last_name_value, birth_date_value, phone_value, address_street_value, address_number_value, address_locality_value, photo_url_value, code_value, service_ids_value, is_admin_value, account_id_value)
  loop
    update public.employees
    set email = clean_email,
        updated_at = now()
    where employees.id = created_employee.id
    returning * into saved_employee;

    welcome_message := concat_ws(E'\n',
      'Tu acceso interno fue creado.',
      'Usuario: ' || created_employee.internal_username,
      'ContraseÃ±a inicial: 123456',
      'Al ingresar se te va a pedir cambiar la contraseÃ±a.',
      'Este es un mensaje automÃ¡tico, no respondas este mail.'
    );

    perform public.send_resend_email(
      clean_email,
      'Tu acceso interno fue creado',
      welcome_message,
      'Quiero Turno App - No responder'
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
      created_employee.internal_username,
      created_employee.is_admin;
  end loop;
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
  account_id_value uuid default null,
  session_token_value text default null,
  email_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_employee jsonb;
  saved_employee public.employees%rowtype;
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'IngresÃ¡ un mail vÃ¡lido para el empleado.';
  end if;

  updated_employee := public.update_admin_employee_legacy(employee_id_value, name_value, first_name_value, last_name_value, birth_date_value, phone_value, address_street_value, address_number_value, address_locality_value, photo_url_value, code_value, active_value, is_admin_value, service_ids_value, account_id_value);

  update public.employees
  set email = clean_email,
      updated_at = now()
  where employees.id = employee_id_value
  returning * into saved_employee;

  return updated_employee || jsonb_build_object('email', saved_employee.email);
end;
$$;

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
  email_value text default null
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
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
begin
  if account_role not in ('admin'::public.app_role, 'employee'::public.app_role) then
    raise exception 'Rol interno invalido.';
  end if;

  if length(clean_username) < 3 or clean_username !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'El usuario debe tener al menos 3 caracteres y solo puede usar letras, numeros, punto, guion o guion bajo.';
  end if;

  if length(clean_first_name) < 2 or length(clean_last_name) < 2 then
    raise exception 'IngresÃ¡ nombre y apellido.';
  end if;

  if birth_date_value is null or birth_date_value > current_date then
    raise exception 'La fecha de nacimiento es invalida.';
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'IngresÃ¡ un mail vÃ¡lido.';
  end if;

  if length(clean_password) < 6 or clean_password !~ '^[A-Za-z0-9]+$' then
    raise exception 'La contraseÃ±a debe ser alfanumerica y tener al menos 6 caracteres.';
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
    email,
    address_street,
    address_number,
    address_locality,
    photo_url,
    username_normalized,
    password_hash,
    employee_id
  ) values (
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
  request_email text;
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  select email into request_email
  from public.internal_registration_requests
  where id = request_id_value;

  for approved_account in
    select * from public.approve_internal_registration_legacy(request_id_value, employee_id_value, account_id_value)
  loop
    if public.is_valid_email(request_email) then
      update public.employees
      set email = lower(trim(request_email)),
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

create or replace function public.get_client_booking_options()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'services', coalesce((
      select jsonb_agg(to_jsonb(service_rows) order by service_rows.id)
      from (
        select *
        from public.services
        where active is not false
        order by id
      ) service_rows
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(to_jsonb(employee_rows) order by employee_rows.name)
      from (
        select
          id,
          name,
          first_name,
          last_name,
          photo_url,
          active,
          deleted_at
        from public.employees
        where active is not false
          and deleted_at is null
        order by name
      ) employee_rows
    ), '[]'::jsonb),
    'employeeServices', coalesce((
      select jsonb_agg(to_jsonb(relation_rows))
      from (
        select relations.*
        from public.employee_services relations
        join public.services services on services.id = relations.service_id
        join public.employees employees on employees.id = relations.employee_id
        where services.active is not false
          and employees.active is not false
          and employees.deleted_at is null
      ) relation_rows
    ), '[]'::jsonb),
    'employeeAvailability', coalesce((
      select jsonb_agg(to_jsonb(availability_rows))
      from (
        select availability.*
        from public.employee_availability availability
        join public.employees employees on employees.id = availability.employee_id
        where availability.active is true
          and employees.active is not false
          and employees.deleted_at is null
      ) availability_rows
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.send_resend_email(text, text, text, text, text) from public;
revoke execute on function public.notify_admin_emails(text, text, text) from public;
grant execute on function public.create_admin_employee(text, text, text, date, text, text, text, text, text, text, text[], boolean, uuid, text, text) to anon, authenticated;
grant execute on function public.update_admin_employee(uuid, text, text, text, date, text, text, text, text, text, text, boolean, boolean, text[], uuid, text, text) to anon, authenticated;
grant execute on function public.request_internal_registration(public.app_role, text, text, text, date, text, text, text, text, text, text, uuid, text) to anon, authenticated;
grant execute on function public.approve_internal_registration(uuid, uuid, uuid, text) to anon, authenticated;
grant execute on function public.get_client_booking_options() to anon, authenticated;

commit;

