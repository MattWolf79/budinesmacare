-- Allow internal employees to create bookings for any active employee in the same tenant.
-- Run after 052_employee_pending_and_internal_past_guard.sql.

begin;

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
  target_company_id uuid;
  employee_account public.internal_accounts%rowtype;
  saved_booking public.bookings%rowtype;
  is_promotional_booking boolean := service_id_value is null and nullif(trim(coalesce(booking_description_value, '')), '') is not null;
  current_business_time timestamp without time zone := timezone('America/Argentina/Buenos_Aires', now());
begin
  employee_account := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), employee_account.company_id);

  if target_company_id is null or employee_account.company_id is distinct from target_company_id then
    raise exception 'No podés crear turnos para otra empresa.';
  end if;

  if employee_id_value is null or start_at_value is null or end_at_value is null or end_at_value <= start_at_value then
    raise exception 'El horario del turno es invalido.';
  end if;

  if not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.company_id = target_company_id
      and employees.deleted_at is null
      and employees.active is not false
  ) then
    raise exception 'El empleado seleccionado no está disponible.';
  end if;

  if start_at_value < current_business_time then
    raise exception 'No se pueden crear turnos en horarios pasados.';
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

revoke execute on function public.create_internal_employee_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text, text, text) from public;
grant execute on function public.create_internal_employee_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text, text, text) to anon, authenticated;

commit;