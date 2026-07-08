-- Final RPC patch for internal employee/admin sessions, cross-employee booking from employee agenda,
-- and safe cancellation permissions.
-- Run after 011_internal_admin_employee_management.sql on existing databases.

begin;

create or replace function public.get_internal_employee_workspace(
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
        where bookings.status in ('reserved', 'confirmed', 'pending_assignment')
        order by bookings.start_at
      ) booking_rows
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

create or replace function public.create_internal_employee_booking(
  service_id_value bigint,
  employee_id_value uuid,
  start_at_value timestamp without time zone,
  end_at_value timestamp without time zone,
  customer_name_value text default null,
  customer_email_value text default null,
  account_id_value uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  saved_booking public.bookings%rowtype;
begin
  select *
  into account_record
  from public.internal_accounts accounts
  where accounts.id = account_id_value
    and accounts.role = 'employee'::public.app_role
    and accounts.active = true
    and accounts.employee_id is not null
  limit 1;

  if account_record.id is null then
    raise exception 'Solo un empleado interno activo puede crear turnos.';
  end if;

  if service_id_value is null or employee_id_value is null or start_at_value is null or end_at_value is null then
    raise exception 'Faltan datos para crear el turno.';
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

  if not exists (
    select 1
    from public.employee_services relations
    where relations.employee_id = employee_id_value
      and relations.service_id = service_id_value
  ) then
    raise exception 'El empleado no esta vinculado a esa actividad.';
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
    start_at,
    end_at,
    status
  ) values (
    null,
    nullif(trim(coalesce(customer_email_value, '')), ''),
    nullif(trim(coalesce(customer_name_value, '')), ''),
    service_id_value,
    employee_id_value,
    start_at_value,
    end_at_value,
    'confirmed'
  )
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

create or replace function public.cancel_booking(
  booking_id_value uuid,
  account_id_value uuid default null
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
begin
  if booking_id_value is null then
    raise exception 'El turno es invalido.';
  end if;

  select *
  into booking_record
  from public.bookings bookings
  where bookings.id = booking_id_value
  for update;

  if booking_record.id is null then
    raise exception 'El turno no existe.';
  end if;

  if booking_record.start_at <= localtimestamp then
    raise exception 'No se pueden cancelar turnos de días pasados.';
  end if;

  select accounts.employee_id
  into internal_employee_id
  from public.internal_accounts accounts
  where accounts.id = account_id_value
    and accounts.role = 'employee'::public.app_role
    and accounts.active = true
    and accounts.employee_id is not null
  limit 1;

  if not public.is_admin()
    and not public.is_internal_admin(account_id_value)
    and not coalesce(internal_employee_id is not null and booking_record.employee_id = internal_employee_id, false)
    and not coalesce(booking_record.user_id = auth.uid(), false)
    and not coalesce(public.is_employee_for(booking_record.employee_id), false) then
    raise exception 'No tenés permisos para cancelar este turno.';
  end if;

  update public.bookings
  set status = 'cancelled',
      updated_at = now()
  where bookings.id = booking_record.id
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

grant execute on function public.get_internal_employee_workspace(uuid) to anon, authenticated;
grant execute on function public.create_internal_employee_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid) to anon, authenticated;
grant execute on function public.cancel_booking(uuid, uuid) to anon, authenticated;

commit;
