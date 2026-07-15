-- Require client promotion requests to respect employee availability, like regular services.
-- Run after 037_force_quiero_turno_mail_sender.sql on existing databases.

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
  clean_booking_description text := nullif(trim(coalesce(booking_description_value, '')), '');
  clean_customer_email text := nullif(trim(coalesce(customer_email_value, '')), '');
  selected_promotion jsonb;
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión para solicitar un turno.';
  end if;

  if start_at_value is null or end_at_value is null or end_at_value <= start_at_value then
    raise exception 'El horario seleccionado no es válido.';
  end if;

  if start_at_value < localtimestamp then
    raise exception 'No se pueden solicitar turnos en horarios pasados.';
  end if;

  if service_id_value is null and clean_booking_description is null then
    raise exception 'Seleccioná un servicio o promoción.';
  end if;

  if service_id_value is not null and not exists (
    select 1
    from public.services services
    where services.id = service_id_value
      and services.active is not false
  ) then
    raise exception 'El servicio seleccionado no está disponible.';
  end if;

  if service_id_value is null then
    select promotion
    into selected_promotion
    from public.app_configuration configuration,
      jsonb_array_elements(coalesce(configuration.promotions, '[]'::jsonb)) promotion
    where configuration.id = true
      and coalesce((promotion->>'enabled')::boolean, false) is true
      and nullif(trim(concat_ws(
        ' · ',
        nullif(trim(coalesce(promotion->>'title', '')), ''),
        nullif(trim(coalesce(promotion->>'description', '')), ''),
        nullif(trim(coalesce(promotion->>'value', '')), '')
      )), '') = clean_booking_description
    limit 1;

    if selected_promotion is null then
      raise exception 'La promoción seleccionada no está disponible.';
    end if;
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
          clean_customer_email is not null
          and lower(coalesce(bookings.user_email, '')) = lower(clean_customer_email)
        )
      )
    limit 1
  ) then
    raise exception 'Ya tenés un turno o solicitud en ese horario.';
  end if;

  if employee_id_value is null then
    if service_id_value is not null and not exists (
      select 1
      from public.employee_services relations
      join public.employees employees on employees.id = relations.employee_id
      join public.employee_availability availability on availability.employee_id = employees.id
      where relations.service_id = service_id_value
        and employees.active is true
        and employees.deleted_at is null
        and availability.active is true
        and availability.available_date = start_at_value::date
        and availability.start_time <= start_at_value::time
        and availability.end_time >= end_at_value::time
        and not exists (
          select 1
          from public.bookings bookings
          where bookings.employee_id = employees.id
            and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
            and bookings.start_at < end_at_value
            and bookings.end_at > start_at_value
        )
      limit 1
    ) then
      raise exception 'No hay disponibilidad para ese servicio en ese horario.';
    end if;

    if service_id_value is null and not exists (
      select 1
      from jsonb_array_elements_text(coalesce(selected_promotion->'employeeIds', '[]'::jsonb)) promotion_employees(employee_id_text)
      join public.employees employees on employees.id = promotion_employees.employee_id_text::uuid
      join public.employee_availability availability on availability.employee_id = employees.id
      where employees.active is true
        and employees.deleted_at is null
        and availability.active is true
        and availability.available_date = start_at_value::date
        and availability.start_time <= start_at_value::time
        and availability.end_time >= end_at_value::time
        and not exists (
          select 1
          from public.bookings bookings
          where bookings.employee_id = employees.id
            and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
            and bookings.start_at < end_at_value
            and bookings.end_at > start_at_value
        )
      limit 1
    ) then
      raise exception 'No hay disponibilidad para esa promoción en ese horario.';
    end if;
  end if;

  if employee_id_value is not null then
    if not exists (
      select 1
      from public.employees employees
      where employees.id = employee_id_value
        and employees.active is true
        and employees.deleted_at is null
    ) then
      raise exception 'El empleado seleccionado no está disponible.';
    end if;

    if service_id_value is not null and not exists (
      select 1
      from public.employee_services relations
      where relations.employee_id = employee_id_value
        and relations.service_id = service_id_value
    ) then
      raise exception 'El empleado no está vinculado a ese servicio.';
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
    clean_customer_email,
    nullif(trim(coalesce(customer_name_value, '')), ''),
    service_id_value,
    employee_id_value,
    clean_booking_description,
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