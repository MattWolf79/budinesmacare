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
