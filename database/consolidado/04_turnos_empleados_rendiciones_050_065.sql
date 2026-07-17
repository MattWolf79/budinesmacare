-- Archivo consolidado generado desde database/*.sql
-- Uso: ejecutar los 5 archivos consolidados en orden numerico.
-- No reemplaza las migraciones originales; es una copia de portabilidad/bootstrap.
-- Rango incluido: 050-065


-- ============================================================================
-- Source: database/050_client_booking_argentina_time.sql
-- ============================================================================

-- Use Argentina business time when validating client booking requests.
-- Run after 049_tenant_availability_fallback.sql.

begin;

create or replace function public.request_client_booking(
  service_id_value bigint default null,
  employee_id_value uuid default null,
  booking_description_value text default null,
  start_at_value timestamp without time zone default null,
  end_at_value timestamp without time zone default null,
  customer_name_value text default null,
  customer_email_value text default null,
  company_slug_value text default null
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
  selected_promotion jsonb;
  current_business_time timestamp without time zone := timezone('America/Argentina/Buenos_Aires', now());
begin
  if target_company_id is null then
    raise exception 'La empresa no estÃ¡ disponible.';
  end if;

  if auth.uid() is null then
    raise exception 'IniciÃ¡ sesiÃ³n para solicitar un turno.';
  end if;

  if start_at_value is null or end_at_value is null or end_at_value <= start_at_value then
    raise exception 'El horario seleccionado no es vÃ¡lido.';
  end if;

  if start_at_value < current_business_time then
    raise exception 'No se pueden solicitar turnos en horarios pasados.';
  end if;

  if service_id_value is null and clean_booking_description is null then
    raise exception 'SeleccionÃ¡ un servicio o promociÃ³n.';
  end if;

  if service_id_value is not null and not exists (
    select 1
    from public.services services
    where services.id = service_id_value
      and services.company_id = target_company_id
      and services.active is not false
  ) then
    raise exception 'El servicio seleccionado no estÃ¡ disponible.';
  end if;

  if service_id_value is null then
    select promotion
    into selected_promotion
    from public.app_configuration configuration,
      jsonb_array_elements(coalesce(configuration.promotions, '[]'::jsonb)) promotion
    where configuration.company_id = target_company_id
      and coalesce((promotion->>'enabled')::boolean, false) is true
      and nullif(trim(concat_ws(
        ' Â· ',
        nullif(trim(coalesce(promotion->>'title', '')), ''),
        nullif(trim(coalesce(promotion->>'description', '')), ''),
        nullif(trim(coalesce(promotion->>'value', '')), '')
      )), '') = clean_booking_description
    limit 1;

    if selected_promotion is null then
      raise exception 'La promociÃ³n seleccionada no estÃ¡ disponible.';
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
        bookings.user_id = auth.uid()
        or (
          clean_customer_email is not null
          and lower(coalesce(bookings.user_email, '')) = lower(clean_customer_email)
        )
      )
    limit 1
  ) then
    raise exception 'Ya tenÃ©s un turno o solicitud en ese horario.';
  end if;

  if employee_id_value is null then
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
      raise exception 'No hay disponibilidad para ese servicio en ese horario.';
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
      raise exception 'No hay disponibilidad para esa promociÃ³n en ese horario.';
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
      raise exception 'El empleado seleccionado no estÃ¡ disponible.';
    end if;

    if service_id_value is not null and not exists (
      select 1
      from public.employee_services relations
      where relations.company_id = target_company_id
        and relations.employee_id = employee_id_value
        and relations.service_id = service_id_value
    ) then
      raise exception 'El empleado no estÃ¡ vinculado a ese servicio.';
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

grant execute on function public.request_client_booking(bigint, uuid, text, timestamp without time zone, timestamp without time zone, text, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/051_employee_workspace_tenant_bookings.sql
-- ============================================================================

-- Fix employee workspace agenda loading for tenant routes.
-- Run after 050_client_booking_argentina_time.sql.

begin;

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
          and bookings.status in ('reserved', 'confirmed', 'pending_assignment', 'completed')
          and (
            bookings.employee_id = account_record.employee_id
            or (
              bookings.employee_id is null
              and bookings.status = 'pending_assignment'
              and (
                bookings.service is null
                or exists (
                  select 1
                  from public.employee_services relations
                  where relations.company_id = target_company_id
                    and relations.employee_id = account_record.employee_id
                    and relations.service_id = bookings.service
                )
              )
            )
          )
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

grant execute on function public.get_internal_employee_workspace(uuid, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/052_employee_pending_and_internal_past_guard.sql
-- ============================================================================

-- Show relevant pending requests to employees and block internal bookings in past business time.
-- Run after 051_employee_workspace_tenant_bookings.sql.

begin;

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
          and bookings.status in ('reserved', 'confirmed', 'pending_assignment', 'completed')
          and (
            bookings.employee_id = account_record.employee_id
            or (
              bookings.employee_id is null
              and bookings.status = 'pending_assignment'
              and (
                bookings.service is null
                or exists (
                  select 1
                  from public.employee_services relations
                  where relations.company_id = target_company_id
                    and relations.employee_id = account_record.employee_id
                    and relations.service_id = bookings.service
                )
              )
            )
          )
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
  target_company_id uuid;
  admin_account public.internal_accounts%rowtype;
  saved_booking public.bookings%rowtype;
  is_promotional_booking boolean := service_id_value is null and nullif(trim(coalesce(booking_description_value, '')), '') is not null;
  current_business_time timestamp without time zone := timezone('America/Argentina/Buenos_Aires', now());
begin
  if public.is_admin() then
    target_company_id := public.get_company_id_by_slug(company_slug_value);
    if target_company_id is null then raise exception 'La empresa no estÃ¡ disponible.'; end if;
    if not exists (select 1 from public.profiles profiles where profiles.user_id = auth.uid() and profiles.role = 'admin'::public.app_role and profiles.active is not false and profiles.company_id = target_company_id) then
      raise exception 'No podÃ©s administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);
    if target_company_id is null or admin_account.company_id is distinct from target_company_id then raise exception 'No podÃ©s administrar otra empresa.'; end if;
  end if;

  if employee_id_value is null or start_at_value is null or end_at_value is null or end_at_value <= start_at_value then
    raise exception 'El horario del turno es invalido.';
  end if;

  if start_at_value < current_business_time then
    raise exception 'No se pueden crear turnos en horarios pasados.';
  end if;

  if service_id_value is null and not is_promotional_booking then raise exception 'SeleccionÃ¡ un servicio o promociÃ³n.'; end if;

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
  target_company_id uuid;
  employee_account public.internal_accounts%rowtype;
  saved_booking public.bookings%rowtype;
  is_promotional_booking boolean := service_id_value is null and nullif(trim(coalesce(booking_description_value, '')), '') is not null;
  current_business_time timestamp without time zone := timezone('America/Argentina/Buenos_Aires', now());
begin
  employee_account := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), employee_account.company_id);

  if target_company_id is null or employee_account.company_id is distinct from target_company_id or employee_account.employee_id is distinct from employee_id_value then
    raise exception 'No podÃ©s crear turnos para otra empresa o empleado.';
  end if;

  if employee_id_value is null or start_at_value is null or end_at_value is null or end_at_value <= start_at_value then
    raise exception 'El horario del turno es invalido.';
  end if;

  if start_at_value < current_business_time then
    raise exception 'No se pueden crear turnos en horarios pasados.';
  end if;

  if service_id_value is null and not is_promotional_booking then raise exception 'SeleccionÃ¡ un servicio o promociÃ³n.'; end if;

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

grant execute on function public.get_internal_employee_workspace(uuid, text, text) to anon, authenticated;
grant execute on function public.create_admin_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.create_internal_employee_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/053_tenant_branded_email_notifications.sql
-- ============================================================================

-- Brand booking notification emails by tenant so shared inboxes can distinguish companies.
-- Run after 052_employee_pending_and_internal_past_guard.sql.

begin;

create or replace function public.get_company_mail_display_name(company_id_value uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim((
      select configurations.company_name
      from public.app_configuration configurations
      where configurations.company_id = company_id_value
      limit 1
    )), ''),
    nullif(trim((
      select companies.name
      from public.companies companies
      where companies.id = company_id_value
      limit 1
    )), ''),
    nullif(trim((
      select companies.slug
      from public.companies companies
      where companies.id = company_id_value
      limit 1
    )), ''),
    'Quiero Turno App'
  )
$$;

create or replace function public.format_company_mail_subject(company_id_value uuid, subject_value text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when company_id_value is null then coalesce(subject_value, '')
    when coalesce(subject_value, '') ilike '[' || public.get_company_mail_display_name(company_id_value) || ']%' then coalesce(subject_value, '')
    else '[' || public.get_company_mail_display_name(company_id_value) || '] ' || coalesce(subject_value, '')
  end
$$;

create or replace function public.format_company_mail_sender_name(company_id_value uuid, from_name_value text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when company_id_value is null then nullif(trim(coalesce(from_name_value, '')), '')
    when nullif(trim(coalesce(from_name_value, '')), '') is null then public.get_company_mail_display_name(company_id_value) || ' - No responder'
    when trim(from_name_value) ilike 'quiero turno app%' then public.get_company_mail_display_name(company_id_value) || ' - No responder'
    else trim(from_name_value)
  end
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
  company_name text := public.get_company_mail_display_name(booking_value.company_id);
begin
  select services.name into service_name
  from public.services services
  where services.id = booking_value.service
    and services.company_id = booking_value.company_id;

  select coalesce(nullif(trim(concat_ws(' ', employees.first_name, employees.last_name)), ''), employees.name)
  into employee_name
  from public.employees employees
  where employees.id = booking_value.employee_id
    and employees.company_id = booking_value.company_id;

  return concat_ws(E'\n',
    event_label,
    'Empresa: ' || company_name,
    'Cliente: ' || coalesce(nullif(booking_value.customer_name, ''), nullif(booking_value.user_email, ''), 'Cliente sin datos'),
    case when public.is_valid_email(booking_value.user_email) then 'Mail cliente: ' || booking_value.user_email else null end,
    'Servicio: ' || coalesce(nullif(booking_value.booking_description, ''), service_name, 'Turno'),
    case when employee_name is not null then 'Profesional: ' || employee_name else 'Profesional: pendiente de asignaciÃ³n' end,
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
  company_name text := public.get_company_mail_display_name(booking_value.company_id);
  header_background_data_url text;
  header_style text;
  activity_name text;
  client_name text;
  event_intro text;
  badge_label text;
  clean_cta_label text := nullif(trim(coalesce(cta_label, '')), '');
  clean_cta_url text := nullif(trim(coalesce(cta_url, '')), '');
begin
  select services.name into service_name
  from public.services services
  where services.id = booking_value.service
    and services.company_id = booking_value.company_id;

  select coalesce(nullif(trim(concat_ws(' ', employees.first_name, employees.last_name)), ''), employees.name)
  into employee_name
  from public.employees employees
  where employees.id = booking_value.employee_id
    and employees.company_id = booking_value.company_id;

  activity_name := coalesce(nullif(booking_value.booking_description, ''), service_name, 'Turno');
  client_name := coalesce(nullif(booking_value.customer_name, ''), nullif(booking_value.user_email, ''), 'Cliente sin datos');

  select nullif(trim(configurations.welcome_background_data_url), '')
  into header_background_data_url
  from public.app_configuration configurations
  where configurations.company_id = booking_value.company_id
    and configurations.welcome_background_data_url like 'data:image/%'
  limit 1;

  header_style := 'padding:24px 26px;background:#26313a;color:#ffffff';

  if header_background_data_url is not null then
    header_style := 'padding:24px 26px;color:#ffffff;background-color:#26313a;background-image:linear-gradient(rgba(23,31,39,.78),rgba(23,31,39,.82)),url(''' || replace(header_background_data_url, '''', '%27') || ''');background-size:cover;background-position:center;background-repeat:no-repeat';
  end if;

  event_intro := case
    when event_label ilike '%recordatorio%' then 'Te esperamos pronto. Te dejamos los datos del turno para que los tengas a mano.'
    when event_label ilike '%confirmado%' then 'Tu reserva ya tiene profesional asignado. GuardÃ¡ este detalle para llegar con tranquilidad.'
    when event_label ilike '%pendiente%' then 'Hay una solicitud esperando asignaciÃ³n de profesional. Revisala desde la agenda para confirmar el turno.'
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
    || '<div style="display:none;max-height:0;overflow:hidden;color:#eef7f8">' || public.html_escape(company_name || ' - ' || event_intro) || '</div>'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#eef7f8;padding:0;margin:0"><tr><td align="center" style="padding:28px 12px">'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:620px;background:#ffffff;border:1px solid #d6e7ea;border-radius:16px;overflow:hidden;box-shadow:0 14px 34px rgba(15,23,42,0.10)">'
    || '<tr><td style="' || header_style || '">'
    || '<div style="font-size:12px;line-height:1;text-transform:uppercase;letter-spacing:.08em;color:#8de1e8;font-weight:700">Quiero Turno App</div>'
    || '<div style="margin-top:10px;color:#ffffff;font-size:21px;line-height:1.2;font-weight:900">' || public.html_escape(company_name) || '</div>'
    || '<div style="margin-top:12px;display:inline-block;border:1px solid rgba(141,225,232,.55);border-radius:999px;padding:6px 10px;color:#dffcff;background:rgba(36,174,187,.16);font-size:12px;font-weight:700">' || public.html_escape(badge_label) || '</div>'
    || '<h1 style="margin:14px 0 0;color:#ffffff;font-size:24px;line-height:1.22;font-weight:800">' || public.html_escape(event_label) || '</h1>'
    || '<p style="margin:10px 0 0;color:#d7e4e8;font-size:15px;line-height:1.55">' || public.html_escape(event_intro) || '</p>'
    || '</td></tr>'
    || '<tr><td style="padding:24px 26px 8px">'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;width:100%">'
    || '<tr><td style="width:42%;padding:12px 14px;background:#eefbfc;border:1px solid #b9e8ed;border-right:0;border-radius:10px 0 0 10px;color:#0f6d78;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Empresa</td><td style="padding:12px 14px;background:#eefbfc;border:1px solid #b9e8ed;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:800">' || public.html_escape(company_name) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Cliente</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(client_name) || '</td></tr>'
    || case when public.is_valid_email(booking_value.user_email) then '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Mail</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(booking_value.user_email) || '</td></tr>' else '' end
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Servicio</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(activity_name) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Profesional</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(coalesce(employee_name, 'Pendiente de asignaciÃ³n')) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Inicio</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(to_char(booking_value.start_at, 'DD/MM/YYYY HH24:MI')) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Fin</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(to_char(booking_value.end_at, 'DD/MM/YYYY HH24:MI')) || '</td></tr>'
    || '</table>'
    || case when clean_cta_label is not null and clean_cta_url is not null then
      '<div style="padding:10px 0 22px;text-align:center"><a href="' || public.html_escape(clean_cta_url) || '" style="display:inline-block;background:#24aebb;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 20px;font-size:15px;font-weight:800;box-shadow:0 8px 18px rgba(36,174,187,.22)">' || public.html_escape(clean_cta_label) || '</a></div>'
      else '' end
    || '</td></tr>'
    || '<tr><td style="padding:18px 26px;background:#f6fbfc;border-top:1px solid #e3edf0;color:#64748b;font-size:13px;line-height:1.5;text-align:center">Este es un mensaje automÃ¡tico de ' || public.html_escape(company_name) || ' enviado mediante Quiero Turno App. No respondas este mail.</td></tr>'
    || '</table>'
    || '</td></tr></table>'
    || '</div>';
end;
$$;

create or replace function public.send_resend_email(
  to_email_value text,
  subject_value text,
  message_value text,
  from_name_value text,
  reply_to_value text,
  html_message_value text,
  company_id_value uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_to_email text := lower(trim(coalesce(to_email_value, '')));
  clean_reply_to text := lower(trim(coalesce(reply_to_value, '')));
  settings public.mail_settings%rowtype;
  sender_name text;
  effective_subject text;
begin
  if not public.is_valid_email(clean_to_email) then
    return;
  end if;

  settings := public.get_mail_settings(company_id_value);

  if settings.resend_api_key is null then
    return;
  end if;

  sender_name := public.format_company_mail_sender_name(company_id_value, from_name_value);
  if sender_name is null then
    sender_name := settings.from_name;
  end if;

  effective_subject := public.format_company_mail_subject(company_id_value, subject_value);

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || settings.resend_api_key
    ),
    body := jsonb_strip_nulls(jsonb_build_object(
      'from', sender_name || ' <' || settings.from_email || '>',
      'to', jsonb_build_array(clean_to_email),
      'subject', effective_subject,
      'text', message_value,
      'html', nullif(html_message_value, ''),
      'reply_to', case when public.is_valid_email(clean_reply_to) then clean_reply_to else settings.from_email end
    )),
    timeout_milliseconds := 5000
  );
end;
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

revoke execute on function public.get_company_mail_display_name(uuid) from public;
revoke execute on function public.format_company_mail_subject(uuid, text) from public;
revoke execute on function public.format_company_mail_sender_name(uuid, text) from public;
revoke execute on function public.format_booking_notification_message(public.bookings, text) from public;
revoke execute on function public.format_booking_notification_html(public.bookings, text, text, text) from public;
revoke execute on function public.send_resend_email(text, text, text, text, text, text, uuid) from public;
revoke execute on function public.build_mail_app_link(uuid, text) from public;

commit;


-- ============================================================================
-- Source: database/054_employee_registration_generated_username.sql
-- ============================================================================

-- Generate internal registration usernames from first-name initial + last name.
-- Run after 053_tenant_branded_email_notifications.sql.

begin;

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
  clean_username text;
  clean_first_name text := trim(coalesce(first_name_value, ''));
  clean_last_name text := trim(coalesce(last_name_value, ''));
  clean_display_name text := trim(concat_ws(' ', nullif(trim(coalesce(first_name_value, '')), ''), nullif(trim(coalesce(last_name_value, '')), '')));
  clean_password text := trim(coalesce(password_value, ''));
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
  base_username text;
  candidate_username text;
  suffix integer := -1;
begin
  if target_company_id is null then
    raise exception 'La empresa no estÃ¡ disponible.';
  end if;

  if account_role not in ('admin'::public.app_role, 'employee'::public.app_role) then
    raise exception 'Rol interno invalido.';
  end if;

  if length(clean_first_name) < 2 or length(clean_last_name) < 2 then
    raise exception 'IngresÃ¡ nombre y apellido.';
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

  while exists (
    select 1
    from public.internal_accounts accounts
    where accounts.company_id = target_company_id
      and accounts.username_normalized = public.normalize_text(candidate_username)
  ) or exists (
    select 1
    from public.internal_registration_requests requests
    where requests.company_id = target_company_id
      and requests.status = 'pending'
      and requests.username_normalized = public.normalize_text(candidate_username)
  ) or exists (
    select 1
    from public.employees employees
    where employees.company_id = target_company_id
      and public.normalize_text(employees.name) = public.normalize_text(candidate_username)
  ) loop
    suffix := suffix + 1;
    candidate_username := base_username || lpad(suffix::text, 2, '0');
  end loop;

  clean_username := candidate_username;

  if birth_date_value is null or birth_date_value > current_date then
    raise exception 'La fecha de nacimiento es invalida.';
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'IngresÃ¡ un mail vÃ¡lido.';
  end if;

  if length(clean_password) < 6 or clean_password !~ '^[A-Za-z0-9]+$' then
    raise exception 'La contraseÃ±a debe ser alfanumerica y tener al menos 6 caracteres.';
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

revoke execute on function public.request_internal_registration(public.app_role, text, text, text, date, text, text, text, text, text, text, uuid, text, text) from public;
grant execute on function public.request_internal_registration(public.app_role, text, text, text, date, text, text, text, text, text, text, uuid, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/055_fix_approve_internal_registration_ambiguity.sql
-- ============================================================================

-- Fix ambiguous id reference when approving internal registration requests.
-- Run after 054_employee_registration_generated_username.sql.

begin;

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

  select requests.company_id, requests.email
  into request_company_id, request_email
  from public.internal_registration_requests requests
  where requests.id = request_id_value;

  if request_company_id is null then
    raise exception 'La solicitud no tiene empresa asociada.';
  end if;

  if admin_account.id is not null and admin_account.company_id is distinct from request_company_id then
    raise exception 'No podÃ©s aprobar solicitudes de otra empresa.';
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
    update public.internal_accounts accounts
    set company_id = request_company_id,
        updated_at = now()
    where accounts.id = approved_account.id;

    if public.is_valid_email(request_email) and approved_account.employee_id is not null then
      update public.employees employees
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

revoke execute on function public.approve_internal_registration(uuid, uuid, uuid, text) from public;
grant execute on function public.approve_internal_registration(uuid, uuid, uuid, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/056_regenerate_employee_username_on_update.sql
-- ============================================================================

-- Regenerate employee usernames when admin edits first name or last name.
-- Run after 055_fix_approve_internal_registration_ambiguity.sql.

begin;

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
  email_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  admin_account public.internal_accounts%rowtype;
  updated_employee jsonb;
  saved_employee public.employees%rowtype;
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
  clean_first_name text := nullif(trim(coalesce(first_name_value, '')), '');
  clean_last_name text := nullif(trim(coalesce(last_name_value, '')), '');
  base_username text;
  candidate_username text;
  suffix integer := -1;
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null then
    raise exception 'La empresa no estÃ¡ disponible.';
  end if;

  if admin_account.company_id is distinct from target_company_id then
    raise exception 'No podÃ©s administrar otra empresa.';
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'IngresÃ¡ un mail vÃ¡lido para el empleado.';
  end if;

  if clean_first_name is null or clean_last_name is null then
    raise exception 'IngresÃ¡ nombre y apellido para generar el usuario.';
  end if;

  if not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.company_id = target_company_id
      and employees.deleted_at is null
  ) then
    raise exception 'El empleado no pertenece a esta empresa.';
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

  while exists (
    select 1
    from public.internal_accounts accounts
    where accounts.company_id = target_company_id
      and accounts.employee_id is distinct from employee_id_value
      and accounts.username_normalized = public.normalize_text(candidate_username)
  ) or exists (
    select 1
    from public.internal_registration_requests requests
    where requests.company_id = target_company_id
      and requests.status = 'pending'
      and requests.employee_id is distinct from employee_id_value
      and requests.username_normalized = public.normalize_text(candidate_username)
  ) or exists (
    select 1
    from public.employees employees
    where employees.company_id = target_company_id
      and employees.id <> employee_id_value
      and public.normalize_text(employees.name) = public.normalize_text(candidate_username)
  ) loop
    suffix := suffix + 1;
    candidate_username := base_username || lpad(suffix::text, 2, '0');
  end loop;

  updated_employee := public.update_admin_employee_legacy(
    employee_id_value,
    candidate_username,
    clean_first_name,
    clean_last_name,
    birth_date_value,
    phone_value,
    address_street_value,
    address_number_value,
    address_locality_value,
    photo_url_value,
    code_value,
    active_value,
    is_admin_value,
    service_ids_value,
    account_id_value
  );

  update public.employees employees
  set name = candidate_username,
      email = clean_email,
      company_id = target_company_id,
      updated_at = now()
  where employees.id = employee_id_value
  returning * into saved_employee;

  update public.internal_accounts accounts
  set username = candidate_username,
      username_normalized = public.normalize_text(candidate_username),
      company_id = target_company_id,
      updated_at = now()
  where accounts.employee_id = employee_id_value;

  update public.employee_services relations
  set company_id = target_company_id
  where relations.employee_id = employee_id_value;

  return to_jsonb(saved_employee) || jsonb_build_object(
    'is_admin', is_admin_value,
    'internal_username', coalesce(updated_employee ->> 'internal_username', candidate_username)
  );
end;
$$;

revoke execute on function public.update_admin_employee(uuid, text, text, text, date, text, text, text, text, text, text, boolean, boolean, text[], uuid, text, text, text) from public;
grant execute on function public.update_admin_employee(uuid, text, text, text, date, text, text, text, text, text, text, boolean, boolean, text[], uuid, text, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/057_email_welcome_background_public_url.sql
-- ============================================================================

-- Store welcome background as a public HTTPS image so email clients can render it.
-- Run after 056_regenerate_employee_username_on_update.sql.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-mail-assets', 'company-mail-assets', true, 1048576, array['image/jpeg', 'image/png'])
on conflict (id) do update set
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = array['image/jpeg', 'image/png'],
  updated_at = now();

drop policy if exists company_mail_assets_read on storage.objects;
create policy company_mail_assets_read
  on storage.objects for select
  to public
  using (bucket_id = 'company-mail-assets');

drop policy if exists company_mail_assets_insert on storage.objects;
create policy company_mail_assets_insert
  on storage.objects for insert
  to public
  with check (bucket_id = 'company-mail-assets');

drop policy if exists company_mail_assets_update on storage.objects;
create policy company_mail_assets_update
  on storage.objects for update
  to public
  using (bucket_id = 'company-mail-assets')
  with check (bucket_id = 'company-mail-assets');

alter table public.app_configuration
  add column if not exists welcome_background_public_url text;

alter table public.app_configuration
  drop constraint if exists app_configuration_welcome_background_public_url_chk;

alter table public.app_configuration
  add constraint app_configuration_welcome_background_public_url_chk check (
    welcome_background_public_url is null
    or welcome_background_public_url like 'https://%'
  );

create or replace function public.get_app_configuration(company_slug_value text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_company as (
    select companies.*
    from public.companies companies
    where companies.id = public.get_company_id_by_slug(company_slug_value)
    limit 1
  )
  select coalesce((
    select jsonb_build_object(
      'company_id', selected_company.id,
      'company_slug', selected_company.slug,
      'company_status', selected_company.status,
      'company_name', coalesce(nullif(config.company_name, ''), selected_company.name),
      'business_hours_text', coalesce(config.business_hours_text, ''),
      'welcome_background_data_url', config.welcome_background_data_url,
      'welcome_background_public_url', config.welcome_background_public_url,
      'welcome_background_file_name', config.welcome_background_file_name,
      'welcome_background_mime_type', config.welcome_background_mime_type,
      'banner_data_url', config.banner_data_url,
      'banner_file_name', config.banner_file_name,
      'banner_mime_type', config.banner_mime_type,
      'banner_images', coalesce(config.banner_images, '[]'::jsonb),
      'promotions', coalesce(config.promotions, '[]'::jsonb),
      'discounts', coalesce(config.discounts, '[]'::jsonb),
      'client_can_choose_employee', coalesce(config.client_can_choose_employee, false)
    )
    from selected_company
    left join public.app_configuration config on config.company_id = selected_company.id
    limit 1
  ), jsonb_build_object(
    'company_id', null,
    'company_slug', lower(trim(coalesce(company_slug_value, ''))),
    'company_status', 'not_found',
    'company_name', 'Empresa no disponible',
    'business_hours_text', '',
    'welcome_background_data_url', null,
    'welcome_background_public_url', null,
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

drop function if exists public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text);

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
  company_slug_value text default null,
  welcome_background_public_url_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  admin_account public.internal_accounts%rowtype;
  saved_config jsonb;
  clean_public_url text := nullif(trim(coalesce(welcome_background_public_url_value, '')), '');
begin
  if target_company_id is null then
    raise exception 'La empresa no estÃ¡ disponible.';
  end if;

  if clean_public_url is not null and clean_public_url not like 'https://%' then
    raise exception 'La imagen para mails debe tener una URL pÃºblica HTTPS.';
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
      raise exception 'No podÃ©s administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);

    if admin_account.company_id is distinct from target_company_id then
      raise exception 'No podÃ©s administrar otra empresa.';
    end if;
  end if;

  saved_config := public.save_admin_app_configuration_039(
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

  update public.app_configuration configurations
  set welcome_background_public_url = clean_public_url,
      updated_at = now()
  where configurations.company_id = target_company_id;

  return public.get_app_configuration(company_slug_value);
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
  company_name text := public.get_company_mail_display_name(booking_value.company_id);
  header_background_url text;
  header_style text;
  activity_name text;
  client_name text;
  event_intro text;
  badge_label text;
  clean_cta_label text := nullif(trim(coalesce(cta_label, '')), '');
  clean_cta_url text := nullif(trim(coalesce(cta_url, '')), '');
begin
  select services.name into service_name
  from public.services services
  where services.id = booking_value.service
    and services.company_id = booking_value.company_id;

  select coalesce(nullif(trim(concat_ws(' ', employees.first_name, employees.last_name)), ''), employees.name)
  into employee_name
  from public.employees employees
  where employees.id = booking_value.employee_id
    and employees.company_id = booking_value.company_id;

  activity_name := coalesce(nullif(booking_value.booking_description, ''), service_name, 'Turno');
  client_name := coalesce(nullif(booking_value.customer_name, ''), nullif(booking_value.user_email, ''), 'Cliente sin datos');

  select nullif(trim(configurations.welcome_background_public_url), '')
  into header_background_url
  from public.app_configuration configurations
  where configurations.company_id = booking_value.company_id
    and configurations.welcome_background_public_url like 'https://%'
  limit 1;

  header_style := 'padding:24px 26px;background:#26313a;color:#ffffff';

  if header_background_url is not null then
    header_style := 'padding:24px 26px;color:#ffffff;background-color:#26313a;background-image:linear-gradient(rgba(23,31,39,.78),rgba(23,31,39,.82)),url(''' || replace(header_background_url, '''', '%27') || ''');background-size:cover;background-position:center;background-repeat:no-repeat';
  end if;

  event_intro := case
    when event_label ilike '%recordatorio%' then 'Te esperamos pronto. Te dejamos los datos del turno para que los tengas a mano.'
    when event_label ilike '%confirmado%' then 'Tu reserva ya tiene profesional asignado. GuardÃ¡ este detalle para llegar con tranquilidad.'
    when event_label ilike '%pendiente%' then 'Hay una solicitud esperando asignaciÃ³n de profesional. Revisala desde la agenda para confirmar el turno.'
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
    || '<div style="display:none;max-height:0;overflow:hidden;color:#eef7f8">' || public.html_escape(company_name || ' - ' || event_intro) || '</div>'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#eef7f8;padding:0;margin:0"><tr><td align="center" style="padding:28px 12px">'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:620px;background:#ffffff;border:1px solid #d6e7ea;border-radius:16px;overflow:hidden;box-shadow:0 14px 34px rgba(15,23,42,0.10)">'
    || '<tr><td background="' || public.html_escape(coalesce(header_background_url, '')) || '" style="' || header_style || '">'
    || '<div style="font-size:12px;line-height:1;text-transform:uppercase;letter-spacing:.08em;color:#8de1e8;font-weight:700">Quiero Turno App</div>'
    || '<div style="margin-top:10px;color:#ffffff;font-size:21px;line-height:1.2;font-weight:900">' || public.html_escape(company_name) || '</div>'
    || '<div style="margin-top:12px;display:inline-block;border:1px solid rgba(141,225,232,.55);border-radius:999px;padding:6px 10px;color:#dffcff;background:rgba(36,174,187,.16);font-size:12px;font-weight:700">' || public.html_escape(badge_label) || '</div>'
    || '<h1 style="margin:14px 0 0;color:#ffffff;font-size:24px;line-height:1.22;font-weight:800">' || public.html_escape(event_label) || '</h1>'
    || '<p style="margin:10px 0 0;color:#d7e4e8;font-size:15px;line-height:1.55">' || public.html_escape(event_intro) || '</p>'
    || '</td></tr>'
    || '<tr><td style="padding:24px 26px 8px">'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;width:100%">'
    || '<tr><td style="width:42%;padding:12px 14px;background:#eefbfc;border:1px solid #b9e8ed;border-right:0;border-radius:10px 0 0 10px;color:#0f6d78;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Empresa</td><td style="padding:12px 14px;background:#eefbfc;border:1px solid #b9e8ed;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:800">' || public.html_escape(company_name) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Cliente</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(client_name) || '</td></tr>'
    || case when public.is_valid_email(booking_value.user_email) then '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Mail</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(booking_value.user_email) || '</td></tr>' else '' end
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Servicio</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(activity_name) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Profesional</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(coalesce(employee_name, 'Pendiente de asignaciÃ³n')) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Inicio</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(to_char(booking_value.start_at, 'DD/MM/YYYY HH24:MI')) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Fin</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(to_char(booking_value.end_at, 'DD/MM/YYYY HH24:MI')) || '</td></tr>'
    || '</table>'
    || case when clean_cta_label is not null and clean_cta_url is not null then
      '<div style="padding:10px 0 22px;text-align:center"><a href="' || public.html_escape(clean_cta_url) || '" style="display:inline-block;background:#24aebb;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 20px;font-size:15px;font-weight:800;box-shadow:0 8px 18px rgba(36,174,187,.22)">' || public.html_escape(clean_cta_label) || '</a></div>'
      else '' end
    || '</td></tr>'
    || '<tr><td style="padding:18px 26px;background:#f6fbfc;border-top:1px solid #e3edf0;color:#64748b;font-size:13px;line-height:1.5;text-align:center">Este es un mensaje automÃ¡tico de ' || public.html_escape(company_name) || ' enviado mediante Quiero Turno App. No respondas este mail.</td></tr>'
    || '</table>'
    || '</td></tr></table>'
    || '</div>';
end;
$$;

revoke execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text, text) from public;
revoke execute on function public.format_booking_notification_html(public.bookings, text, text, text) from public;
grant execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/058_approve_registration_username_collision.sql
-- ============================================================================

-- Regenerate a free username when approving an internal registration request.
-- Run after 057_email_welcome_background_public_url.sql.

begin;

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
  request_record public.internal_registration_requests%rowtype;
  admin_account public.internal_accounts%rowtype;
  base_username text;
  candidate_username text;
  suffix integer := -1;
begin
  if not public.is_admin() then
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  select *
  into request_record
  from public.internal_registration_requests requests
  where requests.id = request_id_value
  for update;

  if request_record.id is null then
    raise exception 'La solicitud no existe.';
  end if;

  if request_record.status <> 'pending' then
    raise exception 'La solicitud ya fue revisada.';
  end if;

  if request_record.company_id is null then
    raise exception 'La solicitud no tiene empresa asociada.';
  end if;

  if admin_account.id is not null and admin_account.company_id is distinct from request_record.company_id then
    raise exception 'No podÃ©s aprobar solicitudes de otra empresa.';
  end if;

  if employee_id_value is not null and not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.company_id = request_record.company_id
      and employees.deleted_at is null
  ) then
    raise exception 'El empleado seleccionado no pertenece a esta empresa.';
  end if;

  base_username := regexp_replace(
    substring(public.normalize_text(coalesce(request_record.first_name, '')) from 1 for 1) || public.normalize_text(coalesce(request_record.last_name, '')),
    '[^a-z0-9]+',
    '',
    'g'
  );

  if length(coalesce(base_username, '')) < 3 then
    base_username := regexp_replace(public.normalize_text(coalesce(request_record.username, 'usuario')), '[^a-z0-9]+', '', 'g');
  end if;

  if length(coalesce(base_username, '')) < 3 then
    base_username := 'usuario';
  end if;

  candidate_username := coalesce(nullif(trim(request_record.username), ''), base_username);

  while exists (
    select 1
    from public.internal_accounts accounts
    where accounts.username_normalized = public.normalize_text(candidate_username)
  ) or exists (
    select 1
    from public.internal_registration_requests requests
    where requests.company_id = request_record.company_id
      and requests.id <> request_record.id
      and requests.status = 'pending'
      and requests.username_normalized = public.normalize_text(candidate_username)
  ) or exists (
    select 1
    from public.employees employees
    where employees.company_id = request_record.company_id
      and employees.deleted_at is null
      and public.normalize_text(employees.name) = public.normalize_text(candidate_username)
      and (employee_id_value is null or employees.id <> employee_id_value)
  ) loop
    suffix := suffix + 1;
    candidate_username := base_username || lpad(suffix::text, 2, '0');
  end loop;

  if public.normalize_text(candidate_username) <> request_record.username_normalized then
    update public.internal_registration_requests requests
    set username = candidate_username,
        username_normalized = public.normalize_text(candidate_username)
    where requests.id = request_record.id;
  end if;

  for approved_account in
    select * from public.approve_internal_registration_legacy(request_id_value, employee_id_value, account_id_value)
  loop
    update public.internal_accounts accounts
    set company_id = request_record.company_id,
        updated_at = now()
    where accounts.id = approved_account.id;

    if public.is_valid_email(request_record.email) and approved_account.employee_id is not null then
      update public.employees employees
      set company_id = request_record.company_id,
          email = lower(trim(request_record.email)),
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

revoke execute on function public.approve_internal_registration(uuid, uuid, uuid, text) from public;
grant execute on function public.approve_internal_registration(uuid, uuid, uuid, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/059_booking_customer_details_edit.sql
-- ============================================================================

-- Allow internal users to edit booking customer details and include client CTA links in emails.
-- Run after 058_approve_registration_username_collision.sql.

begin;

create or replace function public.build_client_booking_link(company_id_value uuid default null)
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
  )
  select (select value from base_url) ||
    coalesce('/' || (select slug from selected_company), '') ||
    '/sacarturno'
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
  client_booking_url text := public.build_client_booking_link(NEW.company_id);
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
          and accounts.company_id = NEW.company_id
        where employees.company_id = NEW.company_id
          and employees.active is not false
          and employees.deleted_at is null
          and public.is_valid_email(employees.email)
      loop
        perform public.send_resend_email(employee_email, 'Hay un turno pendiente para asignar', admin_message, 'Quiero Turno App - No responder', NEW.user_email, admin_html, NEW.company_id);
      end loop;
    end if;

    if NEW.employee_id is not null then
      if public.is_valid_email(NEW.user_email) then
        client_message := public.format_booking_notification_message(NEW, 'Tu turno fue confirmado.') || E'\n\nIr al Turno: ' || client_booking_url;
        client_html := public.format_booking_notification_html(NEW, 'Tu turno fue confirmado.', 'Ir al Turno', client_booking_url);
        perform public.send_resend_email(NEW.user_email, 'Tu turno fue confirmado', client_message, 'Quiero Turno App - No responder', null, client_html, NEW.company_id);
      end if;

      select employees.email into employee_email
      from public.employees employees
      where employees.id = NEW.employee_id
        and employees.company_id = NEW.company_id;

      employee_message := public.format_booking_notification_message(NEW, 'TenÃ©s un nuevo turno asignado.') || E'\n\nIr a Agenda: ' || employee_agenda_url;
      employee_html := public.format_booking_notification_html(NEW, 'TenÃ©s un nuevo turno asignado.', 'Ir a Agenda', employee_agenda_url);
      perform public.send_resend_email(employee_email, 'TenÃ©s un nuevo turno asignado', employee_message, 'Quiero Turno App - No responder', NEW.user_email, employee_html, NEW.company_id);
    end if;
  end if;

  if TG_OP = 'UPDATE'
    and NEW.status in ('reserved', 'confirmed')
    and NEW.employee_id is not null
    and (OLD.employee_id is distinct from NEW.employee_id or OLD.status = 'pending_assignment') then
    if public.is_valid_email(NEW.user_email) then
      client_message := public.format_booking_notification_message(NEW, 'Tu turno fue confirmado.') || E'\n\nIr al Turno: ' || client_booking_url;
      client_html := public.format_booking_notification_html(NEW, 'Tu turno fue confirmado.', 'Ir al Turno', client_booking_url);
      perform public.send_resend_email(NEW.user_email, 'Tu turno fue confirmado', client_message, 'Quiero Turno App - No responder', null, client_html, NEW.company_id);
    end if;

    select employees.email into employee_email
    from public.employees employees
    where employees.id = NEW.employee_id
      and employees.company_id = NEW.company_id;

    employee_message := public.format_booking_notification_message(NEW, 'TenÃ©s un nuevo turno asignado.') || E'\n\nIr a Agenda: ' || employee_agenda_url;
    employee_html := public.format_booking_notification_html(NEW, 'TenÃ©s un nuevo turno asignado.', 'Ir a Agenda', employee_agenda_url);
    perform public.send_resend_email(employee_email, 'TenÃ©s un nuevo turno asignado', employee_message, 'Quiero Turno App - No responder', NEW.user_email, employee_html, NEW.company_id);
  end if;

  if TG_OP = 'UPDATE'
    and NEW.status = 'cancelled'
    and OLD.status is distinct from NEW.status
    and NEW.employee_id is not null then
    select employees.email into employee_email
    from public.employees employees
    where employees.id = NEW.employee_id
      and employees.company_id = NEW.company_id;

    employee_message := public.format_booking_notification_message(NEW, 'Se cancelÃ³ este turno.') || E'\n\nIr a Agenda: ' || employee_agenda_url;
    employee_html := public.format_booking_notification_html(NEW, 'Se cancelÃ³ este turno.', 'Ir a Agenda', employee_agenda_url);
    perform public.send_resend_email(employee_email, 'Se cancelÃ³ un turno', employee_message, 'Quiero Turno App - No responder', NEW.user_email, employee_html, NEW.company_id);
  end if;

  return NEW;
end;
$$;

create or replace function public.send_due_booking_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_record public.bookings%rowtype;
  sent_count integer := 0;
  reminder_message text;
  reminder_html text;
  client_booking_url text;
begin
  for booking_record in
    select *
    from public.bookings bookings
    where bookings.status in ('reserved', 'confirmed')
      and bookings.employee_id is not null
      and bookings.client_reminder_sent_at is null
      and bookings.start_at > localtimestamp
      and bookings.start_at <= localtimestamp + interval '24 hours'
      and public.is_valid_email(bookings.user_email)
    order by bookings.start_at
    for update skip locked
  loop
    client_booking_url := public.build_client_booking_link(booking_record.company_id);
    reminder_message := public.format_booking_notification_message(booking_record, 'Recordatorio: tenÃ©s un turno reservado para maÃ±ana.') || E'\n\nIr al Turno: ' || client_booking_url;
    reminder_html := public.format_booking_notification_html(booking_record, 'Recordatorio: tenÃ©s un turno reservado para maÃ±ana.', 'Ir al Turno', client_booking_url);

    perform public.send_resend_email(
      booking_record.user_email,
      'Recordatorio de turno',
      reminder_message,
      'Quiero Turno App - No responder',
      null,
      reminder_html,
      booking_record.company_id
    );

    update public.bookings
    set client_reminder_sent_at = now()
    where id = booking_record.id;

    sent_count := sent_count + 1;
  end loop;

  return sent_count;
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
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, null);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), account_record.company_id);

  if target_company_id is null or account_record.company_id is distinct from target_company_id or account_record.role not in ('admin'::public.app_role, 'employee'::public.app_role) then
    raise exception 'No tenÃ©s permisos para editar este turno.';
  end if;

  if clean_email is not null and not public.is_valid_email(clean_email) then
    raise exception 'El mail del cliente no es vÃ¡lido.';
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

  if booking_record.status not in ('reserved', 'confirmed', 'pending_assignment') then
    raise exception 'Solo se pueden editar turnos activos.';
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

revoke execute on function public.build_client_booking_link(uuid) from public;
revoke execute on function public.get_internal_employee_workspace(uuid, text, text) from public;
revoke execute on function public.update_booking_customer_details(uuid, text, text, text, uuid, text, text) from public;
grant execute on function public.get_internal_employee_workspace(uuid, text, text) to anon, authenticated;
grant execute on function public.update_booking_customer_details(uuid, text, text, text, uuid, text, text) to anon, authenticated;
grant execute on function public.send_due_booking_reminders() to service_role;

commit;


-- ============================================================================
-- Source: database/060_prevent_past_booking_customer_edit.sql
-- ============================================================================

-- Prevent editing customer details after a booking has already started.
-- Run after 059_booking_customer_details_edit.sql.

begin;

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
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, null);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), account_record.company_id);

  if target_company_id is null or account_record.company_id is distinct from target_company_id or account_record.role not in ('admin'::public.app_role, 'employee'::public.app_role) then
    raise exception 'No tenÃ©s permisos para editar este turno.';
  end if;

  if clean_email is not null and not public.is_valid_email(clean_email) then
    raise exception 'El mail del cliente no es vÃ¡lido.';
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

revoke execute on function public.update_booking_customer_details(uuid, text, text, text, uuid, text, text) from public;
grant execute on function public.update_booking_customer_details(uuid, text, text, text, uuid, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/061_employee_booking_settlements.sql
-- ============================================================================

-- Add employee settlement support for completed bookings.
-- Run after 060_prevent_past_booking_customer_edit.sql.

begin;

alter table public.bookings
  add column if not exists is_settled boolean not null default false,
  add column if not exists settled_at timestamp without time zone,
  add column if not exists settled_by_account_id uuid references public.internal_accounts(id) on delete set null,
  add column if not exists settlement_percent numeric(5, 2),
  add column if not exists settlement_employee_amount numeric(12, 2),
  add column if not exists settlement_company_amount numeric(12, 2);

alter table public.bookings
  drop constraint if exists bookings_settlement_percent_chk;

alter table public.bookings
  add constraint bookings_settlement_percent_chk
  check (settlement_percent is null or (settlement_percent >= 0 and settlement_percent <= 100));

alter table public.bookings
  drop constraint if exists bookings_settlement_amounts_chk;

alter table public.bookings
  add constraint bookings_settlement_amounts_chk
  check (
    (settlement_employee_amount is null or settlement_employee_amount >= 0)
    and (settlement_company_amount is null or settlement_company_amount >= 0)
  ) not valid;

alter table public.bookings validate constraint bookings_settlement_amounts_chk;

create index if not exists bookings_employee_pending_settlement_idx
  on public.bookings(company_id, employee_id, status, is_settled, start_at)
  where status = 'completed';

create or replace function public.get_employee_pending_settlement_bookings(
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
  admin_account public.internal_accounts%rowtype;
  target_company_id uuid;
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null or admin_account.company_id is distinct from target_company_id then
    raise exception 'No podÃ©s administrar otra empresa.';
  end if;

  if not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.company_id = target_company_id
      and employees.deleted_at is null
  ) then
    raise exception 'El empleado no pertenece a esta empresa.';
  end if;

  return coalesce((
    with closure_totals as (
      select
        closure_items.closure_id,
        sum(closure_items.subtotal) as subtotal
      from public.booking_closure_items closure_items
      group by closure_items.closure_id
    ), pending_rows as (
      select
        bookings.id,
        bookings.employee_id,
        employees.name as employee_name,
        coalesce(nullif(closure_items.service_name, ''), services.name, bookings.booking_description, 'Servicio') as service_name,
        coalesce(nullif(bookings.customer_name, ''), 'Cliente sin nombre') as customer_name,
        bookings.user_email,
        bookings.start_at,
        bookings.end_at,
        greatest(
          0,
          coalesce(closure_items.subtotal, services.base_price, 0)
          - case
              when coalesce(closure_totals.subtotal, 0) > 0 then
                (coalesce(closure_items.subtotal, 0) / closure_totals.subtotal) * coalesce(closures.total_discount_total, 0)
              else 0
            end
        ) as total_amount
      from public.bookings bookings
      left join public.booking_closure_items closure_items on closure_items.booking_id = bookings.id
      left join public.booking_closures closures on closures.id = closure_items.closure_id
      left join closure_totals on closure_totals.closure_id = closure_items.closure_id
      left join public.services services on services.id = bookings.service and services.company_id = target_company_id
      left join public.employees employees on employees.id = bookings.employee_id and employees.company_id = target_company_id
      where bookings.company_id = target_company_id
        and bookings.employee_id = employee_id_value
        and bookings.status = 'completed'
        and bookings.is_settled is false
      order by bookings.start_at
    )
    select jsonb_agg(to_jsonb(pending_rows))
    from pending_rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.settle_employee_bookings(
  employee_id_value uuid,
  booking_ids_value uuid[],
  commission_percent_value numeric,
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
  admin_account public.internal_accounts%rowtype;
  target_company_id uuid;
  clean_percent numeric(5, 2) := round(coalesce(commission_percent_value, 0), 2);
  selected_count integer;
  expected_count integer;
  selected_items jsonb;
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null or admin_account.company_id is distinct from target_company_id then
    raise exception 'No podÃ©s administrar otra empresa.';
  end if;

  if booking_ids_value is null or array_length(booking_ids_value, 1) is null then
    raise exception 'SeleccionÃ¡ al menos un turno para rendir.';
  end if;

  if clean_percent < 0 or clean_percent > 100 then
    raise exception 'El porcentaje debe estar entre 0 y 100.';
  end if;

  expected_count := array_length(booking_ids_value, 1);

  with closure_totals as (
    select
      closure_items.closure_id,
      sum(closure_items.subtotal) as subtotal
    from public.booking_closure_items closure_items
    group by closure_items.closure_id
  ), selected_rows as (
    select
      bookings.id,
      bookings.employee_id,
      employees.name as employee_name,
      coalesce(nullif(closure_items.service_name, ''), services.name, bookings.booking_description, 'Servicio') as service_name,
      coalesce(nullif(bookings.customer_name, ''), 'Cliente sin nombre') as customer_name,
      bookings.user_email,
      bookings.start_at,
      bookings.end_at,
      greatest(
        0,
        coalesce(closure_items.subtotal, services.base_price, 0)
        - case
            when coalesce(closure_totals.subtotal, 0) > 0 then
              (coalesce(closure_items.subtotal, 0) / closure_totals.subtotal) * coalesce(closures.total_discount_total, 0)
            else 0
          end
      ) as total_amount
    from public.bookings bookings
    left join public.booking_closure_items closure_items on closure_items.booking_id = bookings.id
    left join public.booking_closures closures on closures.id = closure_items.closure_id
    left join closure_totals on closure_totals.closure_id = closure_items.closure_id
    left join public.services services on services.id = bookings.service and services.company_id = target_company_id
    left join public.employees employees on employees.id = bookings.employee_id and employees.company_id = target_company_id
    where bookings.company_id = target_company_id
      and bookings.employee_id = employee_id_value
      and bookings.status = 'completed'
      and bookings.is_settled is false
      and bookings.id = any(booking_ids_value)
  )
  select count(*), coalesce(jsonb_agg(to_jsonb(selected_rows) order by selected_rows.start_at), '[]'::jsonb)
  into selected_count, selected_items
  from selected_rows;

  if selected_count <> expected_count then
    raise exception 'Hay turnos que no estÃ¡n pendientes de rendiciÃ³n.';
  end if;

  update public.bookings bookings
  set is_settled = true,
      settled_at = now(),
      settled_by_account_id = admin_account.id,
      settlement_percent = clean_percent,
      settlement_employee_amount = round((amounts.total_amount * clean_percent / 100)::numeric, 2),
      settlement_company_amount = round((amounts.total_amount - (amounts.total_amount * clean_percent / 100))::numeric, 2)
  from (
    select
      (item->>'id')::uuid as booking_id,
      (item->>'total_amount')::numeric as total_amount
    from jsonb_array_elements(selected_items) item
  ) amounts
  where bookings.id = amounts.booking_id;

  return jsonb_build_object(
    'commissionPercent', clean_percent,
    'items', selected_items,
    'totalAmount', coalesce((select sum((item->>'total_amount')::numeric) from jsonb_array_elements(selected_items) item), 0),
    'employeeAmount', coalesce((select sum((item->>'total_amount')::numeric * clean_percent / 100) from jsonb_array_elements(selected_items) item), 0),
    'companyAmount', coalesce((select sum((item->>'total_amount')::numeric * (100 - clean_percent) / 100) from jsonb_array_elements(selected_items) item), 0)
  );
end;
$$;

revoke execute on function public.get_employee_pending_settlement_bookings(uuid, uuid, text, text) from public;
revoke execute on function public.settle_employee_bookings(uuid, uuid[], numeric, uuid, text, text) from public;

grant execute on function public.get_employee_pending_settlement_bookings(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.settle_employee_bookings(uuid, uuid[], numeric, uuid, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/062_employee_settlement_employee_scope.sql
-- ============================================================================

-- Ensure settlement reports are scoped to the selected employee.
-- Run after 061_employee_booking_settlements.sql.

begin;

create or replace function public.get_employee_pending_settlement_bookings(
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
  admin_account public.internal_accounts%rowtype;
  target_company_id uuid;
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null or admin_account.company_id is distinct from target_company_id then
    raise exception 'No podÃ©s administrar otra empresa.';
  end if;

  if not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.company_id = target_company_id
      and employees.deleted_at is null
  ) then
    raise exception 'El empleado no pertenece a esta empresa.';
  end if;

  return coalesce((
    with closure_totals as (
      select closure_items.closure_id, sum(closure_items.subtotal) as subtotal
      from public.booking_closure_items closure_items
      group by closure_items.closure_id
    ), pending_rows as (
      select
        bookings.id,
        bookings.employee_id,
        employees.name as employee_name,
        coalesce(nullif(closure_items.service_name, ''), services.name, bookings.booking_description, 'Servicio') as service_name,
        coalesce(nullif(bookings.customer_name, ''), 'Cliente sin nombre') as customer_name,
        bookings.user_email,
        bookings.start_at,
        bookings.end_at,
        greatest(
          0,
          coalesce(closure_items.subtotal, services.base_price, 0)
          - case
              when coalesce(closure_totals.subtotal, 0) > 0 then
                (coalesce(closure_items.subtotal, 0) / closure_totals.subtotal) * coalesce(closures.total_discount_total, 0)
              else 0
            end
        ) as total_amount
      from public.bookings bookings
      left join public.booking_closure_items closure_items on closure_items.booking_id = bookings.id
      left join public.booking_closures closures on closures.id = closure_items.closure_id
      left join closure_totals on closure_totals.closure_id = closure_items.closure_id
      left join public.services services on services.id = bookings.service and services.company_id = target_company_id
      left join public.employees employees on employees.id = bookings.employee_id and employees.company_id = target_company_id
      where bookings.company_id = target_company_id
        and bookings.employee_id = employee_id_value
        and bookings.status = 'completed'
        and bookings.is_settled is false
      order by bookings.start_at
    )
    select jsonb_agg(to_jsonb(pending_rows))
    from pending_rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.settle_employee_bookings(
  employee_id_value uuid,
  booking_ids_value uuid[],
  commission_percent_value numeric,
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
  admin_account public.internal_accounts%rowtype;
  target_company_id uuid;
  clean_percent numeric(5, 2) := round(coalesce(commission_percent_value, 0), 2);
  selected_count integer;
  expected_count integer;
  selected_items jsonb;
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null or admin_account.company_id is distinct from target_company_id then
    raise exception 'No podÃ©s administrar otra empresa.';
  end if;

  if booking_ids_value is null or array_length(booking_ids_value, 1) is null then
    raise exception 'SeleccionÃ¡ al menos un turno para rendir.';
  end if;

  if clean_percent < 0 or clean_percent > 100 then
    raise exception 'El porcentaje debe estar entre 0 y 100.';
  end if;

  expected_count := array_length(booking_ids_value, 1);

  with closure_totals as (
    select closure_items.closure_id, sum(closure_items.subtotal) as subtotal
    from public.booking_closure_items closure_items
    group by closure_items.closure_id
  ), selected_rows as (
    select
      bookings.id,
      bookings.employee_id,
      employees.name as employee_name,
      coalesce(nullif(closure_items.service_name, ''), services.name, bookings.booking_description, 'Servicio') as service_name,
      coalesce(nullif(bookings.customer_name, ''), 'Cliente sin nombre') as customer_name,
      bookings.user_email,
      bookings.start_at,
      bookings.end_at,
      greatest(
        0,
        coalesce(closure_items.subtotal, services.base_price, 0)
        - case
            when coalesce(closure_totals.subtotal, 0) > 0 then
              (coalesce(closure_items.subtotal, 0) / closure_totals.subtotal) * coalesce(closures.total_discount_total, 0)
            else 0
          end
      ) as total_amount
    from public.bookings bookings
    left join public.booking_closure_items closure_items on closure_items.booking_id = bookings.id
    left join public.booking_closures closures on closures.id = closure_items.closure_id
    left join closure_totals on closure_totals.closure_id = closure_items.closure_id
    left join public.services services on services.id = bookings.service and services.company_id = target_company_id
    left join public.employees employees on employees.id = bookings.employee_id and employees.company_id = target_company_id
    where bookings.company_id = target_company_id
      and bookings.employee_id = employee_id_value
      and bookings.status = 'completed'
      and bookings.is_settled is false
      and bookings.id = any(booking_ids_value)
  )
  select count(*), coalesce(jsonb_agg(to_jsonb(selected_rows) order by selected_rows.start_at), '[]'::jsonb)
  into selected_count, selected_items
  from selected_rows;

  if selected_count <> expected_count then
    raise exception 'Hay turnos que no estÃ¡n pendientes de rendiciÃ³n.';
  end if;

  update public.bookings bookings
  set is_settled = true,
      settled_at = now(),
      settled_by_account_id = admin_account.id,
      settlement_percent = clean_percent,
      settlement_employee_amount = round((amounts.total_amount * clean_percent / 100)::numeric, 2),
      settlement_company_amount = round((amounts.total_amount - (amounts.total_amount * clean_percent / 100))::numeric, 2)
  from (
    select
      (item->>'id')::uuid as booking_id,
      (item->>'total_amount')::numeric as total_amount
    from jsonb_array_elements(selected_items) item
  ) amounts
  where bookings.id = amounts.booking_id;

  return jsonb_build_object(
    'commissionPercent', clean_percent,
    'items', selected_items,
    'totalAmount', coalesce((select sum((item->>'total_amount')::numeric) from jsonb_array_elements(selected_items) item), 0),
    'employeeAmount', coalesce((select sum((item->>'total_amount')::numeric * clean_percent / 100) from jsonb_array_elements(selected_items) item), 0),
    'companyAmount', coalesce((select sum((item->>'total_amount')::numeric * (100 - clean_percent) / 100) from jsonb_array_elements(selected_items) item), 0)
  );
end;
$$;

revoke execute on function public.get_employee_pending_settlement_bookings(uuid, uuid, text, text) from public;
revoke execute on function public.settle_employee_bookings(uuid, uuid[], numeric, uuid, text, text) from public;

grant execute on function public.get_employee_pending_settlement_bookings(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.settle_employee_bookings(uuid, uuid[], numeric, uuid, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/063_employee_create_for_any_employee.sql
-- ============================================================================

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
    raise exception 'No podÃ©s crear turnos para otra empresa.';
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
    raise exception 'El empleado seleccionado no estÃ¡ disponible.';
  end if;

  if start_at_value < current_business_time then
    raise exception 'No se pueden crear turnos en horarios pasados.';
  end if;

  if service_id_value is null and not is_promotional_booking then raise exception 'SeleccionÃ¡ un servicio o promociÃ³n.'; end if;

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


-- ============================================================================
-- Source: database/064_prevent_future_booking_closure.sql
-- ============================================================================

-- Prevent closing bookings scheduled after the current business day.
-- Run after 063_employee_create_for_any_employee.sql.

begin;

create or replace function public.prevent_future_booking_closure()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_business_date date := timezone('America/Argentina/Buenos_Aires', now())::date;
begin
  if new.status in ('completed', 'closed')
    and coalesce(old.status, '') not in ('completed', 'closed')
    and new.start_at::date > current_business_date then
    raise exception 'No se pueden cerrar turnos de dÃ­as futuros.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_future_booking_closure_trigger on public.bookings;

create trigger prevent_future_booking_closure_trigger
before update of status on public.bookings
for each row
execute function public.prevent_future_booking_closure();

commit;


-- ============================================================================
-- Source: database/065_admin_monthly_completed_summary.sql
-- ============================================================================

-- Restore tenant-aware current month completed booking totals in the admin payload.
-- Run after 064_prevent_future_booking_closure.sql.

begin;

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
  admin_account public.internal_accounts%rowtype;
  target_company_id uuid;
  current_business_date date := timezone('America/Argentina/Buenos_Aires', now())::date;
  month_start timestamp without time zone;
  month_end timestamp without time zone;
  payload jsonb;
begin
  month_start := date_trunc('month', current_business_date)::timestamp;
  month_end := month_start + interval '1 month';

  if public.is_admin() then
    target_company_id := public.get_company_id_by_slug(company_slug_value);

    if target_company_id is null then
      raise exception 'La empresa no estÃ¡ disponible.';
    end if;

    if not exists (
      select 1
      from public.profiles profiles
      where profiles.user_id = auth.uid()
        and profiles.role = 'admin'::public.app_role
        and profiles.active is not false
        and profiles.company_id = target_company_id
    ) then
      raise exception 'No podÃ©s administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

    if target_company_id is null then
      raise exception 'La empresa no estÃ¡ disponible.';
    end if;

    if admin_account.company_id is distinct from target_company_id then
      raise exception 'No podÃ©s administrar otra empresa.';
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
    'availability', coalesce((
      select jsonb_agg(to_jsonb(availability_rows) order by availability_rows.available_date, availability_rows.start_time)
      from (
        select *
        from public.employee_availability availability
        where availability.company_id = target_company_id
        order by availability.available_date, availability.start_time
      ) availability_rows
    ), '[]'::jsonb),
    'bookingClosureItems', coalesce((
      select jsonb_agg(to_jsonb(closure_item_rows) order by closure_item_rows.created_at)
      from (
        select closure_items.*
        from public.booking_closure_items closure_items
        join public.bookings bookings on bookings.id = closure_items.booking_id
        where bookings.company_id = target_company_id
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
          and bookings.status = 'completed'
      ) closure_rows
    ), '[]'::jsonb),
    'adminBookingCostSummary', jsonb_build_object(
      'assigned', coalesce((
        select jsonb_build_object(
          'booking_count', count(*),
          'total', coalesce(sum(coalesce(services.base_price, nullif(regexp_replace(coalesce(bookings.booking_description, ''), '[^0-9]', '', 'g'), '')::numeric, 0)), 0)
        )
        from public.bookings bookings
        left join public.services services on services.id = bookings.service and services.company_id = target_company_id
        where bookings.company_id = target_company_id
          and bookings.status in ('reserved', 'confirmed')
          and bookings.employee_id is not null
          and bookings.start_at >= month_start
          and bookings.start_at < month_end
      ), jsonb_build_object('booking_count', 0, 'total', 0)),
      'closed', coalesce((
        select jsonb_build_object(
          'booking_count', count(month_rows.booking_id),
          'total', coalesce(sum(month_rows.amount), 0)
        )
        from (
          select
            closure_items.booking_id,
            greatest(
              0,
              coalesce(closure_items.subtotal, 0) - case
                when coalesce(closure_totals.subtotal_total, 0) > 0 then
                  (coalesce(closure_items.subtotal, 0) / closure_totals.subtotal_total) * coalesce(closures.total_discount_total, 0)
                else 0
              end
            ) as amount
          from public.bookings bookings
          join public.booking_closure_items closure_items on closure_items.booking_id = bookings.id
          left join public.booking_closures closures on closures.id = closure_items.closure_id
          join (
            select closure_id, sum(subtotal) as subtotal_total
            from public.booking_closure_items
            group by closure_id
          ) closure_totals on closure_totals.closure_id = closure_items.closure_id
          where bookings.company_id = target_company_id
            and bookings.status = 'completed'
            and bookings.start_at >= month_start
            and bookings.start_at < month_end
        ) month_rows
      ), jsonb_build_object('booking_count', 0, 'total', 0)),
      'pending', coalesce((
        select jsonb_build_object(
          'booking_count', count(*),
          'total', coalesce(sum(coalesce(services.base_price, nullif(regexp_replace(coalesce(bookings.booking_description, ''), '[^0-9]', '', 'g'), '')::numeric, 0)), 0)
        )
        from public.bookings bookings
        left join public.services services on services.id = bookings.service and services.company_id = target_company_id
        where bookings.company_id = target_company_id
          and bookings.status = 'pending_assignment'
          and bookings.start_at >= month_start
          and bookings.start_at < month_end
      ), jsonb_build_object('booking_count', 0, 'total', 0))
    ),
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
            coalesce(closure_items.subtotal, 0) - case
              when coalesce(closure_totals.subtotal_total, 0) > 0 then
                (coalesce(closure_items.subtotal, 0) / closure_totals.subtotal_total) * coalesce(closures.total_discount_total, 0)
              else 0
            end
          ) as amount
        from public.bookings bookings
        join public.booking_closure_items closure_items on closure_items.booking_id = bookings.id
        left join public.booking_closures closures on closures.id = closure_items.closure_id
        join (
          select closure_id, sum(subtotal) as subtotal_total
          from public.booking_closure_items
          group by closure_id
        ) closure_totals on closure_totals.closure_id = closure_items.closure_id
        where bookings.company_id = target_company_id
          and bookings.status = 'completed'
          and bookings.start_at >= month_start
          and bookings.start_at < month_end
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
        where requests.company_id = target_company_id
          and (request_status_value is null or requests.status = request_status_value)
      ) request_rows
    ), '[]'::jsonb)
  ) into payload;

  return payload;
end;
$$;

grant execute on function public.get_admin_panel_data(uuid, text, text, text) to anon, authenticated;

commit;

