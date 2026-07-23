-- ============================================================================
-- Source: database/075_client_login_usuario_dni.sql
-- ============================================================================

-- Habilita el acceso cliente con usuario + DNI + contraseña,
-- manteniendo la opción de login con Google.

begin;

alter table public.bookings
  add column if not exists client_account_id uuid references public.internal_accounts(id) on delete set null;

create index if not exists bookings_company_client_account_idx
  on public.bookings(company_id, client_account_id);

alter table public.internal_accounts
  add column if not exists email text,
  add column if not exists client_dni text,
  add column if not exists client_dni_normalized text;

alter table public.internal_accounts
  drop constraint if exists internal_accounts_role_chk;

alter table public.internal_accounts
  add constraint internal_accounts_role_chk
  check (role in ('admin'::public.app_role, 'employee'::public.app_role, 'client'::public.app_role));

alter table public.internal_accounts
  drop constraint if exists internal_accounts_employee_link_chk;

alter table public.internal_accounts
  add constraint internal_accounts_employee_link_chk
  check (
    (role = 'employee'::public.app_role and employee_id is not null)
    or (role = 'admin'::public.app_role)
    or (role = 'client'::public.app_role and employee_id is null)
  );

alter table public.internal_accounts
  drop constraint if exists internal_accounts_client_dni_required_chk;

alter table public.internal_accounts
  add constraint internal_accounts_client_dni_required_chk
  check (
    (
      role = 'client'::public.app_role
      and client_dni_normalized is not null
      and client_dni_normalized ~ '^[0-9]{7,10}$'
    )
    or
    (
      role <> 'client'::public.app_role
      and client_dni is null
      and client_dni_normalized is null
    )
  );

alter table public.internal_accounts
  drop constraint if exists internal_accounts_client_dni_normalized_chk;

alter table public.internal_accounts
  add constraint internal_accounts_client_dni_normalized_chk
  check (
    (client_dni is null and client_dni_normalized is null)
    or client_dni_normalized = regexp_replace(client_dni, '[^0-9]+', '', 'g')
  );

create unique index if not exists internal_accounts_company_client_dni_uidx
  on public.internal_accounts(company_id, client_dni_normalized)
  where role = 'client'::public.app_role
    and active = true
    and company_id is not null
    and client_dni_normalized is not null;

create or replace function public.register_client_access(
  first_name_value text,
  last_name_value text,
  dni_value text,
  phone_value text,
  email_value text,
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
  clean_first_name text := trim(coalesce(first_name_value, ''));
  clean_last_name text := trim(coalesce(last_name_value, ''));
  clean_display_name text := trim(concat_ws(' ', nullif(trim(coalesce(first_name_value, '')), ''), nullif(trim(coalesce(last_name_value, '')), '')));
  clean_phone text := nullif(trim(coalesce(phone_value, '')), '');
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
  clean_password text := trim(coalesce(password_value, ''));
  clean_dni text := regexp_replace(trim(coalesce(dni_value, '')), '[^0-9]+', '', 'g');
  base_username text;
  candidate_username text;
  suffix integer := -1;
  inserted_account public.internal_accounts%rowtype;
begin
  if target_company_id is null then
    raise exception 'La empresa no está disponible.';
  end if;

  if length(clean_first_name) < 2 or length(clean_last_name) < 2 then
    raise exception 'Ingresá nombre y apellido.';
  end if;

  if clean_phone is null then
    raise exception 'Ingresá un celular de contacto.';
  end if;

  if clean_dni !~ '^[0-9]{7,10}$' then
    raise exception 'Ingresá un DNI válido de 7 a 10 dígitos.';
  end if;

  if clean_email is not null and not public.is_valid_email(clean_email) then
    raise exception 'Si ingresás mail, debe tener un formato válido.';
  end if;

  if length(clean_password) < 6 or clean_password !~ '^[A-Za-z0-9]+$' then
    raise exception 'La contraseña debe ser alfanumérica y tener al menos 6 caracteres.';
  end if;

  if exists (
    select 1
    from public.internal_accounts accounts
    where accounts.company_id = target_company_id
      and accounts.role = 'client'::public.app_role
      and accounts.active = true
      and accounts.client_dni_normalized = clean_dni
  ) then
    raise exception 'Ya existe una cuenta cliente con ese DNI.';
  end if;

  base_username := regexp_replace(
    substring(public.normalize_text(clean_first_name) from 1 for 1) || public.normalize_text(clean_last_name),
    '[^a-z0-9]+',
    '',
    'g'
  );

  if length(base_username) < 3 then
    raise exception 'No se pudo generar un usuario válido con ese nombre y apellido.';
  end if;

  candidate_username := base_username;

  while exists (
    select 1
    from public.internal_accounts accounts
    where accounts.company_id = target_company_id
      and accounts.username_normalized = public.normalize_text(candidate_username)
  ) loop
    suffix := suffix + 1;
    candidate_username := base_username || lpad(suffix::text, 2, '0');
  end loop;

  insert into public.internal_accounts (
    company_id,
    role,
    username,
    display_name,
    first_name,
    last_name,
    phone,
    email,
    username_normalized,
    password_hash,
    employee_id,
    must_change_password,
    client_dni,
    client_dni_normalized,
    active
  ) values (
    target_company_id,
    'client'::public.app_role,
    candidate_username,
    clean_display_name,
    clean_first_name,
    clean_last_name,
    clean_phone,
    clean_email,
    public.normalize_text(candidate_username),
    extensions.crypt(clean_password, extensions.gen_salt('bf')),
    null,
    false,
    clean_dni,
    clean_dni,
    true
  )
  returning * into inserted_account;

  return query
  select
    inserted_account.id,
    inserted_account.role,
    inserted_account.username,
    inserted_account.display_name,
    inserted_account.first_name,
    inserted_account.last_name,
    inserted_account.photo_url,
    inserted_account.employee_id,
    inserted_account.must_change_password,
    public.create_internal_session(inserted_account.id);
end;
$$;

drop function if exists public.verify_client_login(text, text, text, text);

create or replace function public.verify_client_login(
  dni_value text,
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
  clean_dni text := regexp_replace(trim(coalesce(dni_value, '')), '[^0-9]+', '', 'g');
  account_record public.internal_accounts%rowtype;
begin
  if target_company_id is null then
    raise exception 'La empresa no está disponible.';
  end if;

  if clean_dni !~ '^[0-9]{7,10}$' then
    raise exception 'Ingresá un DNI válido de 7 a 10 dígitos.';
  end if;

  select *
  into account_record
  from public.internal_accounts
  where internal_accounts.company_id = target_company_id
    and internal_accounts.role = 'client'::public.app_role
    and internal_accounts.client_dni_normalized = clean_dni
    and internal_accounts.active = true
  limit 1;

  if account_record.id is null or account_record.password_hash <> extensions.crypt(trim(coalesce(password_value, '')), account_record.password_hash) then
    raise exception 'DNI o contraseña inválidos.';
  end if;

  update public.internal_accounts
  set last_login_at = now(),
      updated_at = now()
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

revoke execute on function public.register_client_access(text, text, text, text, text, text, text) from public;
revoke execute on function public.verify_client_login(text, text, text) from public;

grant execute on function public.register_client_access(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.verify_client_login(text, text, text) to anon, authenticated;

drop function if exists public.request_client_booking(bigint, uuid, text, timestamp without time zone, timestamp without time zone, text, text, text);

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
      raise exception 'No hay disponibilidad para esa promocion en ese horario.';
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
  alcance_cancelacion text := 'propios';
begin
  if target_company_id is null then raise exception 'La empresa no está disponible.'; end if;

  select * into saved_booking from public.bookings where id = booking_id_value and company_id = target_company_id limit 1;
  if saved_booking.id is null then raise exception 'El turno no pertenece a esta empresa.'; end if;

  if account_id_value is not null then
    account_record := public.validate_internal_session(account_id_value, session_token_value, null);
    if account_record.company_id is distinct from target_company_id then raise exception 'El turno no pertenece a esta empresa.'; end if;

    if account_record.role = 'employee'::public.app_role then
      select coalesce(configurations.empleados_cancelan_turnos, 'propios')
      into alcance_cancelacion
      from public.app_configuration configurations
      where configurations.company_id = target_company_id
      limit 1;

      if alcance_cancelacion = 'ninguno' then
        raise exception 'Los empleados no tienen habilitada la cancelación de turnos.';
      end if;

      if alcance_cancelacion = 'propios' and saved_booking.employee_id is distinct from account_record.employee_id then
        raise exception 'Solo podés cancelar turnos asignados a tu empleado.';
      end if;
    elsif account_record.role = 'client'::public.app_role then
      if saved_booking.client_account_id is distinct from account_record.id then
        raise exception 'Solo podés cancelar turnos propios.';
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

commit;

-- Incluye turnos en opciones de cliente para que la grilla muestre ocupacion y reservas propias.
create or replace function public.get_client_booking_options(company_slug_value text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_company as (
    select public.get_company_id_by_slug(company_slug_value) as id
  )
  select jsonb_build_object(
    'companyId', (select id from selected_company),
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(booking_rows) order by booking_rows.start_at)
      from (
        select bookings.*
        from public.bookings bookings, selected_company
        where bookings.company_id = selected_company.id
          and bookings.status in ('confirmed', 'reserved', 'pending_assignment', 'completed', 'closed')
      ) booking_rows
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(to_jsonb(service_rows) order by service_rows.id)
      from (
        select services.*
        from public.services services, selected_company
        where services.company_id = selected_company.id
          and services.active is not false
        order by services.id
      ) service_rows
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(to_jsonb(employee_rows) order by employee_rows.name)
      from (
        select
          employees.id,
          employees.name,
          employees.first_name,
          employees.last_name,
          employees.photo_url,
          employees.active,
          employees.deleted_at
        from public.employees employees, selected_company
        where employees.company_id = selected_company.id
          and employees.active is not false
          and employees.deleted_at is null
        order by employees.name
      ) employee_rows
    ), '[]'::jsonb),
    'employeeServices', coalesce((
      select jsonb_agg(to_jsonb(relation_rows))
      from (
        select relations.*
        from public.employee_services relations
        join public.services services on services.id = relations.service_id
        join public.employees employees on employees.id = relations.employee_id
        join selected_company on selected_company.id = relations.company_id
        where services.company_id = selected_company.id
          and employees.company_id = selected_company.id
          and services.active is not false
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
        join selected_company on selected_company.id = availability.company_id
        where employees.company_id = selected_company.id
          and availability.active is true
          and employees.active is not false
          and employees.deleted_at is null
      ) availability_rows
    ), '[]'::jsonb)
  )
$$;
