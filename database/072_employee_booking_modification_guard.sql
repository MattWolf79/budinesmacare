-- Bloquear modificaciones de turnos por empleados cuando no pueden crear turnos.
-- Run after 071_platform_create_company_cliente_servicio.sql.

begin;

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
  empleados_pueden_modificar boolean := true;
begin
  if target_company_id is null then raise exception 'La empresa no está disponible.'; end if;

  select * into saved_booking from public.bookings where id = booking_id_value and company_id = target_company_id limit 1;
  if saved_booking.id is null then raise exception 'El turno no pertenece a esta empresa.'; end if;

  if account_id_value is not null then
    account_record := public.validate_internal_session(account_id_value, session_token_value, null);
    if account_record.company_id is distinct from target_company_id then raise exception 'El turno no pertenece a esta empresa.'; end if;

    if account_record.role = 'employee'::public.app_role then
      if saved_booking.employee_id is distinct from account_record.employee_id then raise exception 'Solo podés cancelar turnos asignados a tu empleado.'; end if;

      select coalesce(configurations.empleados_pueden_reservar, true)
      into empleados_pueden_modificar
      from public.app_configuration configurations
      where configurations.company_id = target_company_id
      limit 1;

      if empleados_pueden_modificar is false then
        raise exception 'Los empleados no tienen habilitada la modificación de turnos.';
      end if;
    end if;
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

create or replace function public.update_booking_customer_details(
  booking_id_value uuid,
  customer_first_name_value text default null,
  customer_last_name_value text default null,
  customer_email_value text default null,
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
  account_record public.internal_accounts%rowtype;
  target_company_id uuid;
  booking_record public.bookings%rowtype;
  saved_booking public.bookings%rowtype;
  clean_first_name text := nullif(trim(coalesce(customer_first_name_value, '')), '');
  clean_last_name text := nullif(trim(coalesce(customer_last_name_value, '')), '');
  clean_email text := lower(nullif(trim(coalesce(customer_email_value, '')), ''));
  clean_customer_name text := nullif(trim(concat_ws(' ', clean_first_name, clean_last_name)), '');
  previous_email text;
  client_booking_url text;
  client_message text;
  client_html text;
  current_business_time timestamp without time zone := timezone('America/Argentina/Buenos_Aires', now());
  empleados_pueden_modificar boolean := true;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, null);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), account_record.company_id);

  if target_company_id is null or account_record.company_id is distinct from target_company_id or account_record.role not in ('admin'::public.app_role, 'employee'::public.app_role) then
    raise exception 'No tenés permisos para editar este turno.';
  end if;

  if clean_email is not null and not public.is_valid_email(clean_email) then
    raise exception 'El mail del cliente no es válido.';
  end if;

  select *
  into booking_record
  from public.bookings bookings
  where bookings.id = booking_id_value
    and bookings.company_id = target_company_id
  for update;

  if booking_record.id is null then
    raise exception 'El turno no existe.';
  end if;

  if account_record.role = 'employee'::public.app_role then
    if booking_record.employee_id is distinct from account_record.employee_id then
      raise exception 'Solo podés editar turnos asignados a tu empleado.';
    end if;

    select coalesce(configurations.empleados_pueden_reservar, true)
    into empleados_pueden_modificar
    from public.app_configuration configurations
    where configurations.company_id = target_company_id
    limit 1;

    if empleados_pueden_modificar is false then
      raise exception 'Los empleados no tienen habilitada la modificación de turnos.';
    end if;
  end if;

  if booking_record.status not in ('reserved', 'confirmed', 'pending_assignment') then
    raise exception 'Solo se pueden editar turnos activos.';
  end if;

  if booking_record.start_at <= current_business_time then
    raise exception 'No se pueden editar datos de turnos que ya pasaron.';
  end if;

  if clean_email is not null and exists (
    select 1
    from public.bookings bookings
    where bookings.company_id = target_company_id
      and bookings.id is distinct from booking_record.id
      and lower(coalesce(bookings.user_email, '')) = clean_email
      and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
      and bookings.start_at < booking_record.end_at
      and bookings.end_at > booking_record.start_at
    limit 1
  ) then
    raise exception 'Ese cliente ya tiene un turno en ese horario.';
  end if;

  previous_email := lower(nullif(trim(coalesce(booking_record.user_email, '')), ''));

  update public.bookings
  set customer_name = clean_customer_name,
      user_email = clean_email
  where id = booking_record.id
  returning * into saved_booking;

  if public.is_valid_email(saved_booking.user_email)
    and (previous_email is distinct from lower(saved_booking.user_email)) then
    client_booking_url := public.build_client_booking_link(saved_booking.company_id);
    client_message := public.format_booking_notification_message(saved_booking, 'Tu turno fue actualizado.') || E'\n\nIr al Turno: ' || client_booking_url;
    client_html := public.format_booking_notification_html(saved_booking, 'Tu turno fue actualizado.', 'Ir al Turno', client_booking_url);
    perform public.send_resend_email(saved_booking.user_email, 'Tu turno fue actualizado', client_message, 'Quiero Turno App - No responder', null, client_html, saved_booking.company_id);
  end if;

  return to_jsonb(saved_booking);
end;
$$;

revoke execute on function public.cancel_booking(uuid, uuid, text, text) from public;
revoke execute on function public.update_booking_customer_details(uuid, text, text, text, uuid, text, text) from public;
grant execute on function public.cancel_booking(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.update_booking_customer_details(uuid, text, text, text, uuid, text, text) to anon, authenticated;

commit;