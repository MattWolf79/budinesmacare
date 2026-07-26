-- ============================================================================
-- 27_admin_booking_client_link.sql
-- ============================================================================
-- Vincula los turnos creados por admin/empleado desde el panel a la cuenta del
-- cliente elegido en el buscador (bookings.client_account_id), para que el turno
-- aparezca en "Mis turnos" del cliente.
--
-- Cambia la firma de create_admin_booking_group agregando client_account_id_value
-- (uuid, opcional). Se elimina la firma anterior (8 args) para evitar overloads.
-- El resto del comportamiento es idéntico a 23_booking_groups.sql.
-- Ejecutar una vez en Supabase SQL Editor, después de 23_booking_groups.sql.

begin;

-- Eliminar la firma anterior (sin client_account_id_value) para no dejar overloads.
drop function if exists public.create_admin_booking_group(jsonb, text, text, text, uuid, uuid, text, text);

create or replace function public.create_admin_booking_group(
  items_value jsonb,
  customer_name_value text default null,
  customer_email_value text default null,
  booking_description_value text default null,
  branch_id_value uuid default null,
  account_id_value uuid default null,
  session_token_value text default null,
  company_slug_value text default null,
  client_account_id_value uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  caller_account public.internal_accounts%rowtype;
  group_id uuid := gen_random_uuid();
  clean_customer_name text := nullif(trim(coalesce(customer_name_value, '')), '');
  clean_customer_email text := nullif(trim(coalesce(customer_email_value, '')), '');
  clean_description text := nullif(trim(coalesce(booking_description_value, '')), '');
  current_business_time timestamp without time zone := timezone('America/Argentina/Buenos_Aires', now());
  item jsonb;
  item_service_id bigint;
  item_employee_id uuid;
  item_start timestamp without time zone;
  item_end timestamp without time zone;
  item_price numeric(12, 2);
  item_bundle_id uuid;
  item_bundle_type text;
  item_status text;
  saved_booking public.bookings%rowtype;
  saved_bookings jsonb := '[]'::jsonb;
  item_count integer := 0;
begin
  -- ---- Autorizacion (admin o empleado) ----
  if public.is_admin() then
    target_company_id := public.get_company_id_by_slug(company_slug_value);
    if target_company_id is null then raise exception 'La empresa no esta disponible.'; end if;
    if not exists (
      select 1 from public.profiles profiles
      where profiles.user_id = auth.uid()
        and profiles.role = 'admin'::public.app_role
        and profiles.active is not false
        and profiles.company_id = target_company_id
    ) then
      raise exception 'No podes administrar otra empresa.';
    end if;
  else
    begin
      caller_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    exception when others then
      caller_account := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
    end;
    target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), caller_account.company_id);
    if target_company_id is null or caller_account.company_id is distinct from target_company_id then
      raise exception 'No podes crear turnos para otra empresa.';
    end if;
  end if;

  if items_value is null or jsonb_typeof(items_value) <> 'array' or jsonb_array_length(items_value) = 0 then
    raise exception 'Seleccciona al menos un servicio.';
  end if;

  -- Validar sucursal (si se envio) pertenece a la empresa.
  if branch_id_value is not null and not exists (
    select 1 from public.branches branches
    where branches.id = branch_id_value and branches.company_id = target_company_id
  ) then
    raise exception 'La sucursal no pertenece a la empresa.';
  end if;

  -- Validar que el cliente seleccionado (si se envio) pertenezca a la empresa.
  if client_account_id_value is not null and not exists (
    select 1 from public.internal_accounts a
    where a.id = client_account_id_value
      and a.company_id = target_company_id
      and a.role = 'client'::public.app_role
  ) then
    raise exception 'El cliente seleccionado no pertenece a la empresa.';
  end if;

  -- ---- Recorrer items ----
  for item in select * from jsonb_array_elements(items_value)
  loop
    item_count := item_count + 1;
    item_service_id := nullif(item->>'service_id', '')::bigint;
    item_employee_id := nullif(item->>'employee_id', '')::uuid;
    item_start := nullif(item->>'start_at', '')::timestamp without time zone;
    item_end := nullif(item->>'end_at', '')::timestamp without time zone;
    item_price := nullif(item->>'item_price', '')::numeric(12, 2);
    item_bundle_id := nullif(item->>'bundle_id', '')::uuid;
    item_bundle_type := nullif(trim(coalesce(item->>'bundle_type', '')), '');

    if item_service_id is null then
      raise exception 'Cada servicio del turno debe indicar el servicio.';
    end if;

    if item_start is null or item_end is null or item_end <= item_start then
      raise exception 'El horario de uno de los servicios es invalido.';
    end if;

    if item_start < current_business_time then
      raise exception 'No se pueden crear turnos en horarios pasados.';
    end if;

    -- El servicio debe existir y estar activo en la empresa.
    if not exists (
      select 1 from public.services services
      where services.id = item_service_id
        and services.company_id = target_company_id
        and services.active is not false
    ) then
      raise exception 'Uno de los servicios no esta disponible.';
    end if;

    if item_employee_id is null then
      -- Sin profesional asignado. Si existe al menos un profesional que atienda el
      -- servicio, tenga disponibilidad cargada para el horario y no este ocupado,
      -- queda pendiente de asignacion. Si no hay ninguno (p. ej. el unico
      -- profesional se enfermo y no cargo agenda), no se pierde el turno: entra en
      -- lista de espera para asignar mas tarde o cancelar por falta de disponibilidad.
      if exists (
        select 1
        from public.employees candidate
        join public.employee_services candidate_services
          on candidate_services.employee_id = candidate.id
          and candidate_services.company_id = target_company_id
        join public.employee_availability candidate_availability
          on candidate_availability.employee_id = candidate.id
          and candidate_availability.company_id = target_company_id
        where candidate.company_id = target_company_id
          and candidate.active = true
          and candidate.deleted_at is null
          and candidate_services.service_id = item_service_id
          and candidate_availability.active = true
          and candidate_availability.available_date = item_start::date
          and candidate_availability.start_time <= item_start::time
          and candidate_availability.end_time >= item_end::time
          and not exists (
            select 1 from public.bookings busy
            where busy.company_id = target_company_id
              and busy.employee_id = candidate.id
              and busy.status in ('reserved', 'confirmed', 'pending_assignment')
              and busy.start_at < item_end
              and busy.end_at > item_start
          )
      ) then
        item_status := 'pending_assignment';
      else
        item_status := 'waitlist';
      end if;
    else
      item_status := 'confirmed';

      if not exists (
        select 1 from public.employees employees
        where employees.id = item_employee_id
          and employees.company_id = target_company_id
          and employees.active = true
          and employees.deleted_at is null
      ) then
        raise exception 'El profesional de uno de los servicios no esta activo.';
      end if;

      if not exists (
        select 1
        from public.employee_services relations
        join public.services services on services.id = relations.service_id
        where relations.company_id = target_company_id
          and services.company_id = target_company_id
          and relations.employee_id = item_employee_id
          and relations.service_id = item_service_id
          and services.active is not false
      ) then
        raise exception 'El profesional no atiende uno de los servicios elegidos.';
      end if;

      if not exists (
        select 1 from public.employee_availability availability
        where availability.company_id = target_company_id
          and availability.employee_id = item_employee_id
          and availability.active = true
          and availability.available_date = item_start::date
          and availability.start_time <= item_start::time
          and availability.end_time >= item_end::time
      ) then
        raise exception 'El profesional no tiene disponibilidad para uno de los horarios.';
      end if;

      if exists (
        select 1 from public.bookings bookings
        where bookings.company_id = target_company_id
          and bookings.employee_id = item_employee_id
          and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
          and bookings.start_at < item_end
          and bookings.end_at > item_start
        limit 1
      ) then
        raise exception 'El profesional ya tiene un turno en uno de esos horarios.';
      end if;
    end if;

    -- Conflicto del cliente (por email) sobre cada tramo.
    if clean_customer_email is not null and exists (
      select 1 from public.bookings bookings
      where bookings.company_id = target_company_id
        and lower(coalesce(bookings.user_email, '')) = lower(clean_customer_email)
        and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
        and bookings.start_at < item_end
        and bookings.end_at > item_start
      limit 1
    ) then
      raise exception 'Ese cliente ya tiene un turno en uno de esos horarios.';
    end if;

    insert into public.bookings (
      company_id, branch_id, user_id, user_email, customer_name, service, employee_id,
      booking_description, start_at, end_at, status,
      booking_group_id, bundle_id, bundle_type, item_price, client_account_id
    ) values (
      target_company_id, branch_id_value, null, clean_customer_email, clean_customer_name,
      item_service_id, item_employee_id, clean_description, item_start, item_end, item_status,
      group_id, item_bundle_id, item_bundle_type, item_price, client_account_id_value
    )
    returning * into saved_booking;

    saved_bookings := saved_bookings || to_jsonb(saved_booking);
  end loop;

  return jsonb_build_object(
    'booking_group_id', group_id,
    'count', item_count,
    'bookings', saved_bookings
  );
end;
$$;

revoke execute on function public.create_admin_booking_group(jsonb, text, text, text, uuid, uuid, text, text, uuid) from public;
grant execute on function public.create_admin_booking_group(jsonb, text, text, text, uuid, uuid, text, text, uuid) to anon, authenticated;

commit;
