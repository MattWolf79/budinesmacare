-- ============================================================================
-- 28_client_booking_waitlist.sql
-- ============================================================================
-- Alinea el flujo de reserva del cliente (request_client_booking) con el del
-- admin (create_admin_booking_group): cuando NO hay ningún profesional con
-- disponibilidad para el horario elegido, en vez de lanzar el error P0001
-- ("No hay disponibilidad para ese servicio/promocion en ese horario."), el
-- turno se guarda igual en estado 'waitlist' (lista de espera). Así el cliente
-- ve el aviso de atención y el turno queda registrado para asignar o cancelar.
--
-- Reemplaza la definición de 12_client_login_usuario_dni.sql. Idempotente.
-- Ejecutar una vez en Supabase SQL Editor, después de 12 (y 26/27).
-- ============================================================================

begin;

create or replace function public.request_client_booking(
  service_id_value bigint default null,
  employee_id_value uuid default null,
  booking_description_value text default null,
  start_at_value timestamp without time zone default null,
  end_at_value timestamp without time zone default null,
  customer_name_value text default null,
  customer_email_value text default null,
  company_slug_value text default null,
  account_id_value uuid default null,
  session_token_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  saved_booking public.bookings%rowtype;
  next_status text := case when employee_id_value is null then 'pending_assignment' else 'confirmed' end;
  clean_booking_description text := nullif(trim(coalesce(booking_description_value, '')), '');
  clean_customer_email text := nullif(trim(coalesce(customer_email_value, '')), '');
  clean_customer_name text := nullif(trim(coalesce(customer_name_value, '')), '');
  selected_promotion jsonb;
  current_business_time timestamp without time zone := timezone('America/Argentina/Buenos_Aires', now());
  client_account public.internal_accounts%rowtype;
  resolved_auth_user_id uuid := auth.uid();
  resolved_client_account_id uuid := null;
begin
  if target_company_id is null then
    raise exception 'La empresa no esta disponible.';
  end if;

  if resolved_auth_user_id is null then
    if account_id_value is null or nullif(trim(coalesce(session_token_value, '')), '') is null then
      raise exception 'Inicia sesion para solicitar un turno.';
    end if;

    client_account := public.validate_internal_session(account_id_value, session_token_value, 'client'::public.app_role);

    if client_account.company_id is distinct from target_company_id then
      raise exception 'La empresa no esta disponible.';
    end if;

    resolved_client_account_id := client_account.id;
    clean_customer_email := coalesce(clean_customer_email, nullif(trim(coalesce(client_account.email, '')), ''));
    clean_customer_name := coalesce(clean_customer_name, nullif(trim(coalesce(client_account.display_name, '')), ''));
  end if;

  if start_at_value is null or end_at_value is null or end_at_value <= start_at_value then
    raise exception 'El horario seleccionado no es valido.';
  end if;

  if start_at_value < current_business_time then
    raise exception 'No se pueden solicitar turnos en horarios pasados.';
  end if;

  if service_id_value is null and clean_booking_description is null then
    raise exception 'Selecciona un servicio o promocion.';
  end if;

  if service_id_value is not null and not exists (
    select 1
    from public.services services
    where services.id = service_id_value
      and services.company_id = target_company_id
      and services.active is not false
  ) then
    raise exception 'El servicio seleccionado no esta disponible.';
  end if;

  if service_id_value is null then
    select promotion
    into selected_promotion
    from public.app_configuration configuration,
      jsonb_array_elements(coalesce(configuration.promotions, '[]'::jsonb)) with ordinality promotion_item(promotion, position)
    where configuration.company_id = target_company_id
      and coalesce((promotion->>'enabled')::boolean, false) is true
      and (
        nullif(trim(concat_ws(
          ' · ',
          nullif(trim(coalesce(promotion->>'title', '')), ''),
          nullif(trim(coalesce(promotion->>'description', '')), ''),
          nullif(trim(coalesce(promotion->>'value', '')), '')
        )), '') = clean_booking_description
        or format('Banner %s', position) = clean_booking_description
      )
    limit 1;

    if selected_promotion is null then
      raise exception 'La promocion seleccionada no esta disponible.';
    end if;
  end if;

  if exists (
    select 1
    from public.bookings bookings
    where bookings.company_id = target_company_id
      and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
      and bookings.start_at < end_at_value
      and bookings.end_at > start_at_value
      and (
        (resolved_auth_user_id is not null and bookings.user_id = resolved_auth_user_id)
        or (resolved_client_account_id is not null and bookings.client_account_id = resolved_client_account_id)
        or (
          clean_customer_email is not null
          and lower(coalesce(bookings.user_email, '')) = lower(clean_customer_email)
        )
      )
    limit 1
  ) then
    raise exception 'Ya tenes un turno o solicitud en ese horario.';
  end if;

  if employee_id_value is null then
    -- Sin profesional elegido: si hay al menos un profesional que atienda el
    -- servicio, con disponibilidad cargada y libre, queda 'pending_assignment'.
    -- Si no hay ninguno, el turno NO se pierde: se guarda en 'waitlist' (lista
    -- de espera) para asignar o cancelar mas tarde, en vez de rechazarlo.
    if service_id_value is not null and not exists (
      select 1
      from public.employee_services relations
      join public.employees employees on employees.id = relations.employee_id
      join public.employee_availability availability on availability.employee_id = employees.id
      where relations.company_id = target_company_id
        and employees.company_id = target_company_id
        and availability.company_id = target_company_id
        and relations.service_id = service_id_value
        and employees.active is true
        and employees.deleted_at is null
        and availability.active is true
        and availability.available_date = start_at_value::date
        and availability.start_time <= start_at_value::time
        and availability.end_time >= end_at_value::time
        and not exists (
          select 1
          from public.bookings bookings
          where bookings.company_id = target_company_id
            and bookings.employee_id = employees.id
            and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
            and bookings.start_at < end_at_value
            and bookings.end_at > start_at_value
        )
      limit 1
    ) then
      next_status := 'waitlist';
    end if;

    if service_id_value is null and not exists (
      select 1
      from jsonb_array_elements_text(coalesce(selected_promotion->'employeeIds', '[]'::jsonb)) promotion_employees(employee_id_text)
      join public.employees employees on employees.id = promotion_employees.employee_id_text::uuid
      join public.employee_availability availability on availability.employee_id = employees.id
      where employees.company_id = target_company_id
        and availability.company_id = target_company_id
        and employees.active is true
        and employees.deleted_at is null
        and availability.active is true
        and availability.available_date = start_at_value::date
        and availability.start_time <= start_at_value::time
        and availability.end_time >= end_at_value::time
        and not exists (
          select 1
          from public.bookings bookings
          where bookings.company_id = target_company_id
            and bookings.employee_id = employees.id
            and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
            and bookings.start_at < end_at_value
            and bookings.end_at > start_at_value
        )
      limit 1
    ) then
      next_status := 'waitlist';
    end if;
  end if;

  if employee_id_value is not null then
    if not exists (
      select 1
      from public.employees employees
      where employees.id = employee_id_value
        and employees.company_id = target_company_id
        and employees.active is true
        and employees.deleted_at is null
    ) then
      raise exception 'El empleado seleccionado no esta disponible.';
    end if;

    if service_id_value is not null and not exists (
      select 1
      from public.employee_services relations
      where relations.company_id = target_company_id
        and relations.employee_id = employee_id_value
        and relations.service_id = service_id_value
    ) then
      raise exception 'El empleado no esta vinculado a ese servicio.';
    end if;

    if not exists (
      select 1
      from public.employee_availability availability
      where availability.employee_id = employee_id_value
        and availability.company_id = target_company_id
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
      where bookings.company_id = target_company_id
        and bookings.employee_id = employee_id_value
        and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
        and bookings.start_at < end_at_value
        and bookings.end_at > start_at_value
      limit 1
    ) then
      raise exception 'El empleado ya tiene un turno en ese horario.';
    end if;
  end if;

  insert into public.bookings (
    company_id,
    user_id,
    client_account_id,
    user_email,
    customer_name,
    service,
    employee_id,
    booking_description,
    start_at,
    end_at,
    status
  ) values (
    target_company_id,
    resolved_auth_user_id,
    resolved_client_account_id,
    clean_customer_email,
    clean_customer_name,
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

revoke execute on function public.request_client_booking(bigint, uuid, text, timestamp without time zone, timestamp without time zone, text, text, text, uuid, text) from public;
grant execute on function public.request_client_booking(bigint, uuid, text, timestamp without time zone, timestamp without time zone, text, text, text, uuid, text) to anon, authenticated;

commit;
