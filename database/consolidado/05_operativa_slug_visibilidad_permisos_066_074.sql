-- Archivo consolidado generado desde database/*.sql
-- Uso: ejecutar los 5 archivos consolidados en orden numerico.
-- No reemplaza las migraciones originales; es una copia de portabilidad/bootstrap.
-- Rango incluido: 066-074


-- ============================================================================
-- Source: database/066_configuracion_operativa_empresa.sql
-- ============================================================================

-- Configuracion operativa por empresa para precios, agenda, permisos de empleados y PDF.
-- Run after 065_admin_monthly_completed_summary.sql.

begin;

alter table public.app_configuration
  add column if not exists precios_habilitados boolean not null default true,
  add column if not exists turnos_superpuestos_habilitados boolean not null default true,
  add column if not exists intervalo_grilla_minutos integer not null default 30,
  add column if not exists empleados_pueden_reservar boolean not null default true,
  add column if not exists empleados_ven_agenda_completa boolean not null default true,
  add column if not exists visibilidad_turnos_empleado text not null default 'completa',
  add column if not exists pdf_detalle_turno_habilitado boolean not null default false;

alter table public.app_configuration
  drop constraint if exists app_configuration_intervalo_grilla_minutos_chk;

alter table public.app_configuration
  add constraint app_configuration_intervalo_grilla_minutos_chk
  check (intervalo_grilla_minutos in (15, 30, 45, 60));

alter table public.app_configuration
  drop constraint if exists app_configuration_visibilidad_turnos_empleado_chk;

alter table public.app_configuration
  add constraint app_configuration_visibilidad_turnos_empleado_chk
  check (visibilidad_turnos_empleado in ('completa', 'cliente_servicio', 'solo_ocupado', 'cliente_sin_empleado', 'solo_propios'));

create or replace function public.obtener_configuracion_operativa(configuracion public.app_configuration)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'precios_habilitados', coalesce(configuracion.precios_habilitados, true),
    'turnos_superpuestos_habilitados', coalesce(configuracion.turnos_superpuestos_habilitados, true),
    'intervalo_grilla_minutos', coalesce(configuracion.intervalo_grilla_minutos, 30),
    'empleados_pueden_reservar', coalesce(configuracion.empleados_pueden_reservar, true),
    'empleados_ven_agenda_completa', coalesce(configuracion.empleados_ven_agenda_completa, true),
    'visibilidad_turnos_empleado', coalesce(configuracion.visibilidad_turnos_empleado, 'completa'),
    'pdf_detalle_turno_habilitado', coalesce(configuracion.pdf_detalle_turno_habilitado, false)
  )
$$;

create or replace function public.get_company_public_context(slug_value text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_company as (
    select companies.*
    from public.companies companies
    where companies.slug = lower(trim(coalesce(slug_value, '')))
    limit 1
  ), selected_config as (
    select config.*
    from public.app_configuration config
    join selected_company on selected_company.id = config.company_id
    limit 1
  )
  select coalesce((
    select jsonb_build_object(
      'id', selected_company.id,
      'name', selected_company.name,
      'slug', selected_company.slug,
      'status', selected_company.status,
      'active', selected_company.status = 'active',
      'company_name', coalesce(nullif(selected_config.company_name, ''), selected_company.name),
      'business_hours_text', coalesce(selected_config.business_hours_text, ''),
      'welcome_background_data_url', selected_config.welcome_background_data_url,
      'banner_images', coalesce(selected_config.banner_images, '[]'::jsonb),
      'configuracion_operativa', coalesce(public.obtener_configuracion_operativa(selected_config), jsonb_build_object(
        'precios_habilitados', true,
        'turnos_superpuestos_habilitados', true,
        'intervalo_grilla_minutos', 30,
        'empleados_pueden_reservar', true,
        'empleados_ven_agenda_completa', true,
        'visibilidad_turnos_empleado', 'completa',
        'pdf_detalle_turno_habilitado', false
      ))
    )
    from selected_company
    left join selected_config on true
  ), jsonb_build_object(
    'id', null,
    'name', null,
    'slug', lower(trim(coalesce(slug_value, ''))),
    'status', 'not_found',
    'active', false,
    'company_name', null,
    'business_hours_text', '',
    'welcome_background_data_url', null,
    'banner_images', '[]'::jsonb,
    'configuracion_operativa', jsonb_build_object(
      'precios_habilitados', true,
      'turnos_superpuestos_habilitados', true,
      'intervalo_grilla_minutos', 30,
      'empleados_pueden_reservar', true,
      'empleados_ven_agenda_completa', true,
      'visibilidad_turnos_empleado', 'completa',
      'pdf_detalle_turno_habilitado', false
    )
  ))
$$;

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
      'client_can_choose_employee', coalesce(config.client_can_choose_employee, false),
      'configuracion_operativa', coalesce(public.obtener_configuracion_operativa(config), jsonb_build_object(
        'precios_habilitados', true,
        'turnos_superpuestos_habilitados', true,
        'intervalo_grilla_minutos', 30,
        'empleados_pueden_reservar', true,
        'empleados_ven_agenda_completa', true,
        'visibilidad_turnos_empleado', 'completa',
        'pdf_detalle_turno_habilitado', false
      ))
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
    'client_can_choose_employee', false,
    'configuracion_operativa', jsonb_build_object(
      'precios_habilitados', true,
      'turnos_superpuestos_habilitados', true,
      'intervalo_grilla_minutos', 30,
      'empleados_pueden_reservar', true,
      'empleados_ven_agenda_completa', true,
      'visibilidad_turnos_empleado', 'completa',
      'pdf_detalle_turno_habilitado', false
    )
  ))
$$;

drop function if exists public.platform_create_company_admin(uuid, text, text, text, text, text, text, text);

create or replace function public.platform_create_company_admin(
  platform_account_id_value uuid,
  session_token_value text,
  company_name_value text,
  company_slug_value text,
  admin_username_value text,
  admin_first_name_value text default null,
  admin_last_name_value text default null,
  admin_email_value text default null,
  precios_habilitados_valor boolean default true,
  turnos_superpuestos_habilitados_valor boolean default true,
  intervalo_grilla_minutos_valor integer default 30,
  empleados_pueden_reservar_valor boolean default true,
  empleados_ven_agenda_completa_valor boolean default true,
  visibilidad_turnos_empleado_valor text default 'completa',
  pdf_detalle_turno_habilitado_valor boolean default false
)
returns table (
  company_id uuid,
  company_name text,
  company_slug text,
  admin_account_id uuid,
  admin_username text,
  temporary_password text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_account public.internal_accounts%rowtype;
  clean_company_name text := nullif(trim(coalesce(company_name_value, '')), '');
  clean_company_slug text := lower(regexp_replace(trim(coalesce(company_slug_value, '')), '[^a-zA-Z0-9-]', '', 'g'));
  clean_admin_username text := trim(coalesce(admin_username_value, ''));
  clean_admin_first_name text := nullif(trim(coalesce(admin_first_name_value, '')), '');
  clean_admin_last_name text := nullif(trim(coalesce(admin_last_name_value, '')), '');
  clean_admin_email text := lower(nullif(trim(coalesce(admin_email_value, '')), ''));
  clean_visibilidad text := coalesce(nullif(trim(visibilidad_turnos_empleado_valor), ''), 'completa');
  clean_intervalo integer := coalesce(intervalo_grilla_minutos_valor, 30);
  next_display_name text;
  saved_company public.companies%rowtype;
  saved_account public.internal_accounts%rowtype;
  temp_password text := '123456';
begin
  platform_account := public.validate_platform_admin_session(platform_account_id_value, session_token_value);

  if clean_company_name is null then raise exception 'IngresÃ¡ el nombre de la empresa.'; end if;
  if clean_company_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then raise exception 'El slug debe tener entre 3 y 63 caracteres, con letras minÃºsculas, nÃºmeros o guion.'; end if;
  if clean_company_slug = 'plataforma' then raise exception 'Ese slug estÃ¡ reservado para administraciÃ³n plataforma.'; end if;
  if length(clean_admin_username) < 3 or clean_admin_username !~ '^[A-Za-z0-9._-]+$' then raise exception 'El usuario administrador debe tener al menos 3 caracteres y solo puede usar letras, nÃºmeros, punto, guion o guion bajo.'; end if;
  if clean_admin_email is not null and not public.is_valid_email(clean_admin_email) then raise exception 'IngresÃ¡ un mail vÃ¡lido para el administrador.'; end if;
  if clean_intervalo not in (15, 30, 45, 60) then raise exception 'El intervalo de grilla debe ser 15, 30, 45 o 60 minutos.'; end if;
  if clean_visibilidad not in ('completa', 'cliente_servicio', 'solo_ocupado', 'cliente_sin_empleado', 'solo_propios') then raise exception 'La visibilidad de turnos del empleado no es vÃ¡lida.'; end if;

  next_display_name := trim(concat_ws(' ', clean_admin_first_name, clean_admin_last_name));
  if next_display_name = '' then next_display_name := clean_admin_username; end if;

  insert into public.companies (name, slug, status, owner_email, contact_email)
  values (clean_company_name, clean_company_slug, 'active', clean_admin_email, clean_admin_email)
  on conflict (slug) do update set
    name = excluded.name,
    status = 'active',
    owner_email = coalesce(excluded.owner_email, public.companies.owner_email),
    contact_email = coalesce(excluded.contact_email, public.companies.contact_email),
    updated_at = now()
  returning * into saved_company;

  insert into public.app_configuration (
    id,
    company_id,
    company_name,
    business_hours_text,
    banner_images,
    promotions,
    discounts,
    client_can_choose_employee,
    precios_habilitados,
    turnos_superpuestos_habilitados,
    intervalo_grilla_minutos,
    empleados_pueden_reservar,
    empleados_ven_agenda_completa,
    visibilidad_turnos_empleado,
    pdf_detalle_turno_habilitado
  ) values (
    true,
    saved_company.id,
    clean_company_name,
    '',
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    false,
    coalesce(precios_habilitados_valor, true),
    coalesce(turnos_superpuestos_habilitados_valor, true),
    clean_intervalo,
    coalesce(empleados_pueden_reservar_valor, true),
    clean_visibilidad <> 'solo_propios',
    clean_visibilidad,
    coalesce(pdf_detalle_turno_habilitado_valor, false)
  )
  on conflict on constraint app_configuration_company_id_key do update set
    company_name = excluded.company_name,
    precios_habilitados = excluded.precios_habilitados,
    turnos_superpuestos_habilitados = excluded.turnos_superpuestos_habilitados,
    intervalo_grilla_minutos = excluded.intervalo_grilla_minutos,
    empleados_pueden_reservar = excluded.empleados_pueden_reservar,
    empleados_ven_agenda_completa = excluded.empleados_ven_agenda_completa,
    visibilidad_turnos_empleado = excluded.visibilidad_turnos_empleado,
    pdf_detalle_turno_habilitado = excluded.pdf_detalle_turno_habilitado,
    updated_at = now();

  select *
  into saved_account
  from public.internal_accounts accounts
  where accounts.company_id = saved_company.id
    and accounts.username_normalized = public.normalize_text(clean_admin_username)
  limit 1;

  if saved_account.id is null then
    insert into public.internal_accounts (
      company_id,
      role,
      username,
      display_name,
      first_name,
      last_name,
      username_normalized,
      password_hash,
      employee_id,
      active,
      must_change_password
    ) values (
      saved_company.id,
      'admin'::public.app_role,
      clean_admin_username,
      next_display_name,
      clean_admin_first_name,
      clean_admin_last_name,
      public.normalize_text(clean_admin_username),
      extensions.crypt(temp_password, extensions.gen_salt('bf')),
      null,
      true,
      true
    )
    returning * into saved_account;
  else
    update public.internal_accounts
    set role = 'admin'::public.app_role,
        display_name = next_display_name,
        first_name = clean_admin_first_name,
        last_name = clean_admin_last_name,
        active = true,
        must_change_password = true,
        password_hash = extensions.crypt(temp_password, extensions.gen_salt('bf')),
        updated_at = now()
    where id = saved_account.id
    returning * into saved_account;
  end if;

  company_id := saved_company.id;
  company_name := saved_company.name;
  company_slug := saved_company.slug;
  admin_account_id := saved_account.id;
  admin_username := saved_account.username;
  temporary_password := temp_password;
  return next;
end;
$$;

create or replace function public.plataforma_obtener_configuracion_empresa(
  cuenta_plataforma_id_valor uuid,
  token_sesion_valor text,
  slug_empresa_valor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_account public.internal_accounts%rowtype;
  target_company public.companies%rowtype;
  target_config public.app_configuration%rowtype;
begin
  platform_account := public.validate_platform_admin_session(cuenta_plataforma_id_valor, token_sesion_valor);

  select * into target_company
  from public.companies companies
  where companies.slug = lower(trim(coalesce(slug_empresa_valor, '')))
  limit 1;

  if target_company.id is null then
    raise exception 'La empresa no existe.';
  end if;

  select * into target_config
  from public.app_configuration configurations
  where configurations.company_id = target_company.id
  limit 1;

  return jsonb_build_object(
    'company_id', target_company.id,
    'company_name', target_company.name,
    'company_slug', target_company.slug,
    'company_status', target_company.status,
    'configuracion_operativa', coalesce(public.obtener_configuracion_operativa(target_config), jsonb_build_object(
      'precios_habilitados', true,
      'turnos_superpuestos_habilitados', true,
      'intervalo_grilla_minutos', 30,
      'empleados_pueden_reservar', true,
      'empleados_ven_agenda_completa', true,
      'visibilidad_turnos_empleado', 'completa',
      'pdf_detalle_turno_habilitado', false
    ))
  );
end;
$$;

create or replace function public.plataforma_actualizar_configuracion_empresa(
  cuenta_plataforma_id_valor uuid,
  token_sesion_valor text,
  slug_empresa_valor text,
  precios_habilitados_valor boolean default true,
  turnos_superpuestos_habilitados_valor boolean default true,
  intervalo_grilla_minutos_valor integer default 30,
  empleados_pueden_reservar_valor boolean default true,
  empleados_ven_agenda_completa_valor boolean default true,
  visibilidad_turnos_empleado_valor text default 'completa',
  pdf_detalle_turno_habilitado_valor boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_account public.internal_accounts%rowtype;
  target_company public.companies%rowtype;
  clean_intervalo integer := coalesce(intervalo_grilla_minutos_valor, 30);
  clean_visibilidad text := coalesce(nullif(trim(visibilidad_turnos_empleado_valor), ''), 'completa');
begin
  platform_account := public.validate_platform_admin_session(cuenta_plataforma_id_valor, token_sesion_valor);

  if clean_intervalo not in (15, 30, 45, 60) then raise exception 'El intervalo de grilla debe ser 15, 30, 45 o 60 minutos.'; end if;
  if clean_visibilidad not in ('completa', 'cliente_servicio', 'solo_ocupado', 'cliente_sin_empleado', 'solo_propios') then raise exception 'La visibilidad de turnos del empleado no es vÃ¡lida.'; end if;

  select * into target_company
  from public.companies companies
  where companies.slug = lower(trim(coalesce(slug_empresa_valor, '')))
  limit 1;

  if target_company.id is null then
    raise exception 'La empresa no existe.';
  end if;

  insert into public.app_configuration (
    id,
    company_id,
    company_name,
    banner_images,
    promotions,
    discounts,
    precios_habilitados,
    turnos_superpuestos_habilitados,
    intervalo_grilla_minutos,
    empleados_pueden_reservar,
    empleados_ven_agenda_completa,
    visibilidad_turnos_empleado,
    pdf_detalle_turno_habilitado
  ) values (
    true,
    target_company.id,
    target_company.name,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    coalesce(precios_habilitados_valor, true),
    coalesce(turnos_superpuestos_habilitados_valor, true),
    clean_intervalo,
    coalesce(empleados_pueden_reservar_valor, true),
    coalesce(empleados_ven_agenda_completa_valor, true),
    clean_visibilidad,
    coalesce(pdf_detalle_turno_habilitado_valor, false)
  )
  on conflict on constraint app_configuration_company_id_key do update set
    precios_habilitados = excluded.precios_habilitados,
    turnos_superpuestos_habilitados = excluded.turnos_superpuestos_habilitados,
    intervalo_grilla_minutos = excluded.intervalo_grilla_minutos,
    empleados_pueden_reservar = excluded.empleados_pueden_reservar,
    empleados_ven_agenda_completa = excluded.empleados_ven_agenda_completa,
    visibilidad_turnos_empleado = excluded.visibilidad_turnos_empleado,
    pdf_detalle_turno_habilitado = excluded.pdf_detalle_turno_habilitado,
    updated_at = now();

  return public.plataforma_obtener_configuracion_empresa(cuenta_plataforma_id_valor, token_sesion_valor, target_company.slug);
end;
$$;

create or replace function public.validar_turno_superpuesto_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  superpuestos_habilitados boolean := true;
begin
  if NEW.company_id is null or NEW.status not in ('reserved', 'confirmed', 'pending_assignment') then
    return NEW;
  end if;

  select coalesce(configurations.turnos_superpuestos_habilitados, true)
  into superpuestos_habilitados
  from public.app_configuration configurations
  where configurations.company_id = NEW.company_id
  limit 1;

  if superpuestos_habilitados is false and exists (
    select 1
    from public.bookings bookings
    where bookings.company_id = NEW.company_id
      and bookings.id is distinct from NEW.id
      and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
      and bookings.start_at < NEW.end_at
      and bookings.end_at > NEW.start_at
    limit 1
  ) then
    raise exception 'Ese horario ya estÃ¡ ocupado. La empresa no permite turnos superpuestos.';
  end if;

  return NEW;
end;
$$;

drop trigger if exists bookings_validar_turno_superpuesto_empresa on public.bookings;
create trigger bookings_validar_turno_superpuesto_empresa
before insert or update of start_at, end_at, status, company_id on public.bookings
for each row
execute function public.validar_turno_superpuesto_empresa();

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
  empleados_ven_todo boolean := true;
  visibilidad text := 'completa';
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), account_record.company_id);

  if target_company_id is null or account_record.company_id is distinct from target_company_id or account_record.employee_id is null then
    raise exception 'La cuenta interna no pertenece a esta empresa.';
  end if;

  select
    coalesce(configurations.empleados_ven_agenda_completa, true),
    coalesce(configurations.visibilidad_turnos_empleado, 'completa')
  into empleados_ven_todo, visibilidad
  from public.app_configuration configurations
  where configurations.company_id = target_company_id
  limit 1;

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
          and (
            visibilidad = 'completa'
            or employees.id = account_record.employee_id
          )
      ) employee_rows
    ), '[]'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(booking_rows.booking_payload order by booking_rows.start_at)
      from (
        select
          bookings.start_at,
          case
            when bookings.employee_id = account_record.employee_id or visibilidad = 'completa' then to_jsonb(bookings)
            when visibilidad = 'cliente_sin_empleado' then to_jsonb(bookings) - 'employee_id'
            when visibilidad = 'solo_ocupado' then jsonb_build_object(
              'id', bookings.id,
              'company_id', bookings.company_id,
              'start_at', bookings.start_at,
              'end_at', bookings.end_at,
              'status', bookings.status,
              'employee_id', null,
              'service', null,
              'booking_description', null,
              'customer_name', null,
              'user_email', null
            )
            else to_jsonb(bookings)
          end as booking_payload
        from public.bookings bookings
        where bookings.company_id = target_company_id
          and bookings.status in ('reserved', 'confirmed', 'pending_assignment', 'completed')
          and (
            (empleados_ven_todo is true and visibilidad <> 'solo_propios')
            or bookings.employee_id = account_record.employee_id
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
  empleados_pueden_reservar_config boolean := true;
begin
  employee_account := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), employee_account.company_id);

  if target_company_id is null or employee_account.company_id is distinct from target_company_id then
    raise exception 'No podÃ©s crear turnos para otra empresa.';
  end if;

  select coalesce(configurations.empleados_pueden_reservar, true)
  into empleados_pueden_reservar_config
  from public.app_configuration configurations
  where configurations.company_id = target_company_id
  limit 1;

  if empleados_pueden_reservar_config is false then
    raise exception 'Los empleados no tienen habilitada la reserva de turnos.';
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

grant execute on function public.platform_create_company_admin(uuid, text, text, text, text, text, text, text, boolean, boolean, integer, boolean, boolean, text, boolean) to anon, authenticated;
grant execute on function public.plataforma_obtener_configuracion_empresa(uuid, text, text) to anon, authenticated;
grant execute on function public.plataforma_actualizar_configuracion_empresa(uuid, text, text, boolean, boolean, integer, boolean, boolean, text, boolean) to anon, authenticated;
grant execute on function public.get_internal_employee_workspace(uuid, text, text) to anon, authenticated;
grant execute on function public.create_internal_employee_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/067_usuario_empleado_por_empresa.sql
-- ============================================================================

-- Generar usuarios de empleados por empresa, sin colisiones globales entre tenants.
-- Run after 066_configuracion_operativa_empresa.sql.

begin;

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
  email_value text default null,
  company_slug_value text default null
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
  target_company_id uuid;
  admin_account public.internal_accounts%rowtype;
  saved_employee public.employees%rowtype;
  clean_first_name text := nullif(trim(coalesce(first_name_value, '')), '');
  clean_last_name text := nullif(trim(coalesce(last_name_value, '')), '');
  clean_display_name text := trim(concat_ws(' ', nullif(trim(coalesce(first_name_value, '')), ''), nullif(trim(coalesce(last_name_value, '')), '')));
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
  clean_code text := nullif(trim(coalesce(code_value, '')), '');
  base_username text;
  candidate_username text;
  suffix integer := -1;
  service_id_value text;
  welcome_message text;
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null then
    raise exception 'La empresa no estÃ¡ disponible.';
  end if;

  if admin_account.company_id is distinct from target_company_id then
    raise exception 'No podÃ©s administrar otra empresa.';
  end if;

  if clean_first_name is null or clean_last_name is null then
    raise exception 'IngresÃ¡ nombre y apellido para generar el usuario.';
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'IngresÃ¡ un mail vÃ¡lido para el empleado.';
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

  insert into public.employees (
    company_id,
    name,
    first_name,
    last_name,
    birth_date,
    phone,
    email,
    address_street,
    address_number,
    address_locality,
    photo_url,
    code,
    active
  ) values (
    target_company_id,
    candidate_username,
    clean_first_name,
    clean_last_name,
    birth_date_value,
    nullif(trim(coalesce(phone_value, '')), ''),
    clean_email,
    nullif(trim(coalesce(address_street_value, '')), ''),
    nullif(trim(coalesce(address_number_value, '')), ''),
    nullif(trim(coalesce(address_locality_value, '')), ''),
    nullif(photo_url_value, ''),
    clean_code,
    true
  )
  returning * into saved_employee;

  insert into public.internal_accounts (
    company_id,
    role,
    username,
    display_name,
    first_name,
    last_name,
    birth_date,
    phone,
    address_street,
    address_number,
    address_locality,
    photo_url,
    username_normalized,
    password_hash,
    employee_id,
    active,
    must_change_password
  ) values (
    target_company_id,
    case when is_admin_value then 'admin'::public.app_role else 'employee'::public.app_role end,
    candidate_username,
    clean_display_name,
    clean_first_name,
    clean_last_name,
    birth_date_value,
    nullif(trim(coalesce(phone_value, '')), ''),
    nullif(trim(coalesce(address_street_value, '')), ''),
    nullif(trim(coalesce(address_number_value, '')), ''),
    nullif(trim(coalesce(address_locality_value, '')), ''),
    nullif(photo_url_value, ''),
    public.normalize_text(candidate_username),
    extensions.crypt('123456', extensions.gen_salt('bf')),
    saved_employee.id,
    true,
    true
  );

  foreach service_id_value in array coalesce(service_ids_value, array[]::text[]) loop
    insert into public.employee_services (company_id, employee_id, service_id)
    values (target_company_id, saved_employee.id, service_id_value::bigint)
    on conflict do nothing;
  end loop;

  welcome_message := concat_ws(E'\n',
    'Tu acceso interno fue creado.',
    'Usuario: ' || candidate_username,
    'ContraseÃ±a inicial: 123456',
    'Al ingresar se te va a pedir cambiar la contraseÃ±a.',
    'Este es un mensaje automÃ¡tico, no respondas este mail.'
  );

  perform public.send_resend_email(
    clean_email::text,
    'Tu acceso interno fue creado'::text,
    welcome_message::text,
    'Quiero Turno App - No responder'::text,
    null::text,
    null::text,
    target_company_id::uuid
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
    candidate_username,
    is_admin_value;
end;
$$;

revoke execute on function public.create_admin_employee(text, text, text, date, text, text, text, text, text, text, text[], boolean, uuid, text, text, text) from public;
grant execute on function public.create_admin_employee(text, text, text, date, text, text, text, text, text, text, text[], boolean, uuid, text, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/068_bloquear_turnos_superpuestos_empresa.sql
-- ============================================================================

-- Reforzar bloqueo de turnos superpuestos por empresa cuando la configuracion lo deshabilita.
-- Run after 067_usuario_empleado_por_empresa.sql.

begin;

create or replace function public.empresa_permite_turnos_superpuestos(company_id_value uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select configurations.turnos_superpuestos_habilitados
    from public.app_configuration configurations
    where configurations.company_id = company_id_value
    limit 1
  ), true)
$$;

create or replace function public.validar_turno_superpuesto_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := NEW.company_id;
begin
  if target_company_id is null then
    target_company_id := coalesce(
      (
        select employees.company_id
        from public.employees employees
        where employees.id = NEW.employee_id
        limit 1
      ),
      (
        select services.company_id
        from public.services services
        where services.id = NEW.service
        limit 1
      )
    );
  end if;

  if target_company_id is null or NEW.status not in ('reserved', 'confirmed', 'pending_assignment') then
    return NEW;
  end if;

  if public.empresa_permite_turnos_superpuestos(target_company_id) is false and exists (
    select 1
    from public.bookings bookings
    where bookings.company_id = target_company_id
      and bookings.id is distinct from NEW.id
      and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
      and bookings.start_at < NEW.end_at
      and bookings.end_at > NEW.start_at
    limit 1
  ) then
    raise exception 'Ese horario ya estÃ¡ ocupado. La empresa no permite turnos superpuestos.';
  end if;

  return NEW;
end;
$$;

drop trigger if exists bookings_validar_turno_superpuesto_empresa on public.bookings;
create trigger bookings_validar_turno_superpuesto_empresa
before insert or update of start_at, end_at, status, company_id, employee_id, service on public.bookings
for each row
execute function public.validar_turno_superpuesto_empresa();

commit;


-- ============================================================================
-- Source: database/069_platform_update_company_url_slug.sql
-- ============================================================================

-- Permitir cambiar el slug URL de una empresa desde plataforma.
-- Run after 068_bloquear_turnos_superpuestos_empresa.sql.

begin;

drop function if exists public.plataforma_actualizar_configuracion_empresa(uuid, text, text, boolean, boolean, integer, boolean, boolean, text, boolean);

create or replace function public.plataforma_actualizar_configuracion_empresa(
  cuenta_plataforma_id_valor uuid,
  token_sesion_valor text,
  slug_empresa_valor text,
  precios_habilitados_valor boolean default true,
  turnos_superpuestos_habilitados_valor boolean default true,
  intervalo_grilla_minutos_valor integer default 30,
  empleados_pueden_reservar_valor boolean default true,
  empleados_ven_agenda_completa_valor boolean default true,
  visibilidad_turnos_empleado_valor text default 'completa',
  pdf_detalle_turno_habilitado_valor boolean default false,
  slug_url_valor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_account public.internal_accounts%rowtype;
  target_company public.companies%rowtype;
  clean_intervalo integer := coalesce(intervalo_grilla_minutos_valor, 30);
  clean_visibilidad text := coalesce(nullif(trim(visibilidad_turnos_empleado_valor), ''), 'completa');
  clean_slug_url text := lower(regexp_replace(trim(coalesce(slug_url_valor, slug_empresa_valor, '')), '[^a-zA-Z0-9-]', '', 'g'));
begin
  platform_account := public.validate_platform_admin_session(cuenta_plataforma_id_valor, token_sesion_valor);

  if clean_intervalo not in (15, 30, 45, 60) then raise exception 'El intervalo de grilla debe ser 15, 30, 45 o 60 minutos.'; end if;
  if clean_visibilidad not in ('completa', 'cliente_servicio', 'solo_ocupado', 'cliente_sin_empleado', 'solo_propios') then raise exception 'La visibilidad de turnos del empleado no es vÃ¡lida.'; end if;
  if clean_slug_url !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then raise exception 'El slug URL debe tener entre 3 y 63 caracteres, con letras minÃºsculas, nÃºmeros o guion.'; end if;
  if clean_slug_url = 'plataforma' then raise exception 'Ese slug URL estÃ¡ reservado para administraciÃ³n plataforma.'; end if;

  select * into target_company
  from public.companies companies
  where companies.slug = lower(trim(coalesce(slug_empresa_valor, '')))
  limit 1;

  if target_company.id is null then
    raise exception 'La empresa no existe.';
  end if;

  if clean_slug_url <> target_company.slug and exists (
    select 1
    from public.companies companies
    where companies.slug = clean_slug_url
      and companies.id is distinct from target_company.id
    limit 1
  ) then
    raise exception 'Ya existe una empresa con ese slug URL.';
  end if;

  update public.companies companies
  set slug = clean_slug_url,
      updated_at = now()
  where companies.id = target_company.id
  returning * into target_company;

  insert into public.app_configuration (
    id,
    company_id,
    company_name,
    banner_images,
    promotions,
    discounts,
    precios_habilitados,
    turnos_superpuestos_habilitados,
    intervalo_grilla_minutos,
    empleados_pueden_reservar,
    empleados_ven_agenda_completa,
    visibilidad_turnos_empleado,
    pdf_detalle_turno_habilitado
  ) values (
    true,
    target_company.id,
    target_company.name,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    coalesce(precios_habilitados_valor, true),
    coalesce(turnos_superpuestos_habilitados_valor, true),
    clean_intervalo,
    coalesce(empleados_pueden_reservar_valor, true),
    clean_visibilidad <> 'solo_propios',
    clean_visibilidad,
    coalesce(pdf_detalle_turno_habilitado_valor, false)
  )
  on conflict on constraint app_configuration_company_id_key do update set
    precios_habilitados = excluded.precios_habilitados,
    turnos_superpuestos_habilitados = excluded.turnos_superpuestos_habilitados,
    intervalo_grilla_minutos = excluded.intervalo_grilla_minutos,
    empleados_pueden_reservar = excluded.empleados_pueden_reservar,
    empleados_ven_agenda_completa = excluded.empleados_ven_agenda_completa,
    visibilidad_turnos_empleado = excluded.visibilidad_turnos_empleado,
    pdf_detalle_turno_habilitado = excluded.pdf_detalle_turno_habilitado,
    updated_at = now();

  return public.plataforma_obtener_configuracion_empresa(cuenta_plataforma_id_valor, token_sesion_valor, target_company.slug);
end;
$$;

grant execute on function public.plataforma_actualizar_configuracion_empresa(uuid, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/070_employee_visibility_single_source.sql
-- ============================================================================

-- Unificar visibilidad de empleado: visibilidad_turnos_empleado define si ve agenda completa o solo propia.
-- Run after 069_platform_update_company_url_slug.sql.

begin;

alter table public.app_configuration
  drop constraint if exists app_configuration_visibilidad_turnos_empleado_chk;

alter table public.app_configuration
  add constraint app_configuration_visibilidad_turnos_empleado_chk
  check (visibilidad_turnos_empleado in ('completa', 'cliente_servicio', 'solo_ocupado', 'cliente_sin_empleado', 'solo_propios'));

update public.app_configuration
set empleados_ven_agenda_completa = visibilidad_turnos_empleado <> 'solo_propios'
where empleados_ven_agenda_completa is distinct from (visibilidad_turnos_empleado <> 'solo_propios');

create or replace function public.obtener_configuracion_operativa(configuracion public.app_configuration)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'precios_habilitados', coalesce(configuracion.precios_habilitados, true),
    'turnos_superpuestos_habilitados', coalesce(configuracion.turnos_superpuestos_habilitados, true),
    'intervalo_grilla_minutos', coalesce(configuracion.intervalo_grilla_minutos, 30),
    'empleados_pueden_reservar', coalesce(configuracion.empleados_pueden_reservar, true),
    'empleados_ven_agenda_completa', coalesce(configuracion.visibilidad_turnos_empleado, 'completa') <> 'solo_propios',
    'visibilidad_turnos_empleado', coalesce(configuracion.visibilidad_turnos_empleado, 'completa'),
    'pdf_detalle_turno_habilitado', coalesce(configuracion.pdf_detalle_turno_habilitado, false)
  )
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
  visibilidad text := 'completa';
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), account_record.company_id);

  if target_company_id is null or account_record.company_id is distinct from target_company_id or account_record.employee_id is null then
    raise exception 'La cuenta interna no pertenece a esta empresa.';
  end if;

  select coalesce(configurations.visibilidad_turnos_empleado, 'completa')
  into visibilidad
  from public.app_configuration configurations
  where configurations.company_id = target_company_id
  limit 1;

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
          and (
            visibilidad <> 'solo_propios'
            or employees.id = account_record.employee_id
          )
      ) employee_rows
    ), '[]'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(booking_rows.booking_payload order by booking_rows.start_at)
      from (
        select
          bookings.start_at,
          case
            when bookings.employee_id = account_record.employee_id or visibilidad = 'completa' then to_jsonb(bookings)
            when visibilidad = 'cliente_servicio' then jsonb_build_object(
              'id', bookings.id,
              'company_id', bookings.company_id,
              'start_at', bookings.start_at,
              'end_at', bookings.end_at,
              'status', bookings.status,
              'employee_id', null,
              'service', bookings.service,
              'booking_description', bookings.booking_description,
              'customer_name', bookings.customer_name,
              'user_email', null
            )
            when visibilidad = 'cliente_sin_empleado' then to_jsonb(bookings) - 'employee_id'
            when visibilidad = 'solo_ocupado' then jsonb_build_object(
              'id', bookings.id,
              'company_id', bookings.company_id,
              'start_at', bookings.start_at,
              'end_at', bookings.end_at,
              'status', bookings.status,
              'employee_id', null,
              'service', null,
              'booking_description', null,
              'customer_name', null,
              'user_email', null
            )
            else to_jsonb(bookings)
          end as booking_payload
        from public.bookings bookings
        where bookings.company_id = target_company_id
          and bookings.status in ('reserved', 'confirmed', 'pending_assignment', 'completed')
          and (
            visibilidad <> 'solo_propios'
            or bookings.employee_id = account_record.employee_id
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
-- Source: database/071_platform_create_company_cliente_servicio.sql
-- ============================================================================

-- Permitir Cliente/Servicio en alta inicial de empresas desde plataforma.
-- Run after 070_employee_visibility_single_source.sql.

begin;

create or replace function public.platform_create_company_admin(
  platform_account_id_value uuid,
  session_token_value text,
  company_name_value text,
  company_slug_value text,
  admin_username_value text,
  admin_first_name_value text default null,
  admin_last_name_value text default null,
  admin_email_value text default null,
  precios_habilitados_valor boolean default true,
  turnos_superpuestos_habilitados_valor boolean default true,
  intervalo_grilla_minutos_valor integer default 30,
  empleados_pueden_reservar_valor boolean default true,
  empleados_ven_agenda_completa_valor boolean default true,
  visibilidad_turnos_empleado_valor text default 'completa',
  pdf_detalle_turno_habilitado_valor boolean default false
)
returns table (
  company_id uuid,
  company_name text,
  company_slug text,
  admin_account_id uuid,
  admin_username text,
  temporary_password text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_account public.internal_accounts%rowtype;
  clean_company_name text := nullif(trim(coalesce(company_name_value, '')), '');
  clean_company_slug text := lower(regexp_replace(trim(coalesce(company_slug_value, '')), '[^a-zA-Z0-9-]', '', 'g'));
  clean_admin_username text := trim(coalesce(admin_username_value, ''));
  clean_admin_first_name text := nullif(trim(coalesce(admin_first_name_value, '')), '');
  clean_admin_last_name text := nullif(trim(coalesce(admin_last_name_value, '')), '');
  clean_admin_email text := lower(nullif(trim(coalesce(admin_email_value, '')), ''));
  clean_visibilidad text := coalesce(nullif(trim(visibilidad_turnos_empleado_valor), ''), 'completa');
  clean_intervalo integer := coalesce(intervalo_grilla_minutos_valor, 30);
  next_display_name text;
  saved_company public.companies%rowtype;
  saved_account public.internal_accounts%rowtype;
  temp_password text := '123456';
begin
  platform_account := public.validate_platform_admin_session(platform_account_id_value, session_token_value);

  if clean_company_name is null then raise exception 'IngresÃ¡ el nombre de la empresa.'; end if;
  if clean_company_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then raise exception 'El slug debe tener entre 3 y 63 caracteres, con letras minÃºsculas, nÃºmeros o guion.'; end if;
  if clean_company_slug = 'plataforma' then raise exception 'Ese slug estÃ¡ reservado para administraciÃ³n plataforma.'; end if;
  if length(clean_admin_username) < 3 or clean_admin_username !~ '^[A-Za-z0-9._-]+$' then raise exception 'El usuario administrador debe tener al menos 3 caracteres y solo puede usar letras, nÃºmeros, punto, guion o guion bajo.'; end if;
  if clean_admin_email is not null and not public.is_valid_email(clean_admin_email) then raise exception 'IngresÃ¡ un mail vÃ¡lido para el administrador.'; end if;
  if clean_intervalo not in (15, 30, 45, 60) then raise exception 'El intervalo de grilla debe ser 15, 30, 45 o 60 minutos.'; end if;
  if clean_visibilidad not in ('completa', 'cliente_servicio', 'solo_ocupado', 'cliente_sin_empleado', 'solo_propios') then raise exception 'La visibilidad de turnos del empleado no es vÃ¡lida.'; end if;

  next_display_name := trim(concat_ws(' ', clean_admin_first_name, clean_admin_last_name));
  if next_display_name = '' then next_display_name := clean_admin_username; end if;

  insert into public.companies (name, slug, status, owner_email, contact_email)
  values (clean_company_name, clean_company_slug, 'active', clean_admin_email, clean_admin_email)
  on conflict (slug) do update set
    name = excluded.name,
    status = 'active',
    owner_email = coalesce(excluded.owner_email, public.companies.owner_email),
    contact_email = coalesce(excluded.contact_email, public.companies.contact_email),
    updated_at = now()
  returning * into saved_company;

  insert into public.app_configuration (
    id,
    company_id,
    company_name,
    business_hours_text,
    banner_images,
    promotions,
    discounts,
    client_can_choose_employee,
    precios_habilitados,
    turnos_superpuestos_habilitados,
    intervalo_grilla_minutos,
    empleados_pueden_reservar,
    empleados_ven_agenda_completa,
    visibilidad_turnos_empleado,
    pdf_detalle_turno_habilitado
  ) values (
    true,
    saved_company.id,
    clean_company_name,
    '',
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    false,
    coalesce(precios_habilitados_valor, true),
    coalesce(turnos_superpuestos_habilitados_valor, true),
    clean_intervalo,
    coalesce(empleados_pueden_reservar_valor, true),
    clean_visibilidad <> 'solo_propios',
    clean_visibilidad,
    coalesce(pdf_detalle_turno_habilitado_valor, false)
  )
  on conflict on constraint app_configuration_company_id_key do update set
    company_name = excluded.company_name,
    precios_habilitados = excluded.precios_habilitados,
    turnos_superpuestos_habilitados = excluded.turnos_superpuestos_habilitados,
    intervalo_grilla_minutos = excluded.intervalo_grilla_minutos,
    empleados_pueden_reservar = excluded.empleados_pueden_reservar,
    empleados_ven_agenda_completa = excluded.empleados_ven_agenda_completa,
    visibilidad_turnos_empleado = excluded.visibilidad_turnos_empleado,
    pdf_detalle_turno_habilitado = excluded.pdf_detalle_turno_habilitado,
    updated_at = now();

  select *
  into saved_account
  from public.internal_accounts accounts
  where accounts.company_id = saved_company.id
    and accounts.username_normalized = public.normalize_text(clean_admin_username)
  limit 1;

  if saved_account.id is null then
    insert into public.internal_accounts (
      company_id,
      role,
      username,
      display_name,
      first_name,
      last_name,
      username_normalized,
      password_hash,
      employee_id,
      active,
      must_change_password
    ) values (
      saved_company.id,
      'admin'::public.app_role,
      clean_admin_username,
      next_display_name,
      clean_admin_first_name,
      clean_admin_last_name,
      public.normalize_text(clean_admin_username),
      extensions.crypt(temp_password, extensions.gen_salt('bf')),
      null,
      true,
      true
    )
    returning * into saved_account;
  else
    update public.internal_accounts
    set role = 'admin'::public.app_role,
        display_name = next_display_name,
        first_name = clean_admin_first_name,
        last_name = clean_admin_last_name,
        active = true,
        must_change_password = true,
        password_hash = extensions.crypt(temp_password, extensions.gen_salt('bf')),
        updated_at = now()
    where id = saved_account.id
    returning * into saved_account;
  end if;

  company_id := saved_company.id;
  company_name := saved_company.name;
  company_slug := saved_company.slug;
  admin_account_id := saved_account.id;
  admin_username := saved_account.username;
  temporary_password := temp_password;
  return next;
end;
$$;

grant execute on function public.platform_create_company_admin(uuid, text, text, text, text, text, text, text, boolean, boolean, integer, boolean, boolean, text, boolean) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/072_employee_booking_modification_guard.sql
-- ============================================================================

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
  if target_company_id is null then raise exception 'La empresa no estÃ¡ disponible.'; end if;

  select * into saved_booking from public.bookings where id = booking_id_value and company_id = target_company_id limit 1;
  if saved_booking.id is null then raise exception 'El turno no pertenece a esta empresa.'; end if;

  if account_id_value is not null then
    account_record := public.validate_internal_session(account_id_value, session_token_value, null);
    if account_record.company_id is distinct from target_company_id then raise exception 'El turno no pertenece a esta empresa.'; end if;

    if account_record.role = 'employee'::public.app_role then
      if saved_booking.employee_id is distinct from account_record.employee_id then raise exception 'Solo podÃ©s cancelar turnos asignados a tu empleado.'; end if;

      select coalesce(configurations.empleados_pueden_reservar, true)
      into empleados_pueden_modificar
      from public.app_configuration configurations
      where configurations.company_id = target_company_id
      limit 1;

      if empleados_pueden_modificar is false then
        raise exception 'Los empleados no tienen habilitada la modificaciÃ³n de turnos.';
      end if;
    end if;
  elsif auth.uid() is null or saved_booking.user_id is distinct from auth.uid() then
    raise exception 'Solo podÃ©s cancelar turnos propios.';
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

  if account_record.role = 'employee'::public.app_role then
    if booking_record.employee_id is distinct from account_record.employee_id then
      raise exception 'Solo podÃ©s editar turnos asignados a tu empleado.';
    end if;

    select coalesce(configurations.empleados_pueden_reservar, true)
    into empleados_pueden_modificar
    from public.app_configuration configurations
    where configurations.company_id = target_company_id
    limit 1;

    if empleados_pueden_modificar is false then
      raise exception 'Los empleados no tienen habilitada la modificaciÃ³n de turnos.';
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


-- ============================================================================
-- Source: database/073_employee_cancel_detail_scopes.sql
-- ============================================================================

-- Alcances configurables para cancelacion y detalle de turnos en perfil empleado.
-- Run after 072_employee_booking_modification_guard.sql.

begin;

alter table public.app_configuration
  add column if not exists empleados_cancelan_turnos text not null default 'propios',
  add column if not exists empleados_ven_detalle_turnos text not null default 'propios';

alter table public.app_configuration
  drop constraint if exists app_configuration_empleados_cancelan_turnos_chk;

alter table public.app_configuration
  add constraint app_configuration_empleados_cancelan_turnos_chk
  check (empleados_cancelan_turnos in ('propios', 'todos', 'ninguno'));

alter table public.app_configuration
  drop constraint if exists app_configuration_empleados_ven_detalle_turnos_chk;

alter table public.app_configuration
  add constraint app_configuration_empleados_ven_detalle_turnos_chk
  check (empleados_ven_detalle_turnos in ('propios', 'todos', 'ninguno'));

create or replace function public.obtener_configuracion_operativa(configuracion public.app_configuration)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'precios_habilitados', coalesce(configuracion.precios_habilitados, true),
    'turnos_superpuestos_habilitados', coalesce(configuracion.turnos_superpuestos_habilitados, true),
    'intervalo_grilla_minutos', coalesce(configuracion.intervalo_grilla_minutos, 30),
    'empleados_pueden_reservar', coalesce(configuracion.empleados_pueden_reservar, true),
    'empleados_ven_agenda_completa', coalesce(configuracion.visibilidad_turnos_empleado, 'completa') <> 'solo_propios',
    'visibilidad_turnos_empleado', coalesce(configuracion.visibilidad_turnos_empleado, 'completa'),
    'empleados_cancelan_turnos', coalesce(configuracion.empleados_cancelan_turnos, 'propios'),
    'empleados_ven_detalle_turnos', coalesce(configuracion.empleados_ven_detalle_turnos, 'propios'),
    'pdf_detalle_turno_habilitado', coalesce(configuracion.pdf_detalle_turno_habilitado, false)
  )
$$;

drop function if exists public.plataforma_actualizar_configuracion_empresa(uuid, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text);

create or replace function public.plataforma_actualizar_configuracion_empresa(
  cuenta_plataforma_id_valor uuid,
  token_sesion_valor text,
  slug_empresa_valor text,
  precios_habilitados_valor boolean default true,
  turnos_superpuestos_habilitados_valor boolean default true,
  intervalo_grilla_minutos_valor integer default 30,
  empleados_pueden_reservar_valor boolean default true,
  empleados_ven_agenda_completa_valor boolean default true,
  visibilidad_turnos_empleado_valor text default 'completa',
  pdf_detalle_turno_habilitado_valor boolean default false,
  slug_url_valor text default null,
  empleados_cancelan_turnos_valor text default 'propios',
  empleados_ven_detalle_turnos_valor text default 'propios'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_account public.internal_accounts%rowtype;
  target_company public.companies%rowtype;
  clean_intervalo integer := coalesce(intervalo_grilla_minutos_valor, 30);
  clean_visibilidad text := coalesce(nullif(trim(visibilidad_turnos_empleado_valor), ''), 'completa');
  clean_slug_url text := lower(regexp_replace(trim(coalesce(slug_url_valor, slug_empresa_valor, '')), '[^a-zA-Z0-9-]', '', 'g'));
  clean_cancelacion text := coalesce(nullif(trim(empleados_cancelan_turnos_valor), ''), 'propios');
  clean_detalle text := coalesce(nullif(trim(empleados_ven_detalle_turnos_valor), ''), 'propios');
begin
  platform_account := public.validate_platform_admin_session(cuenta_plataforma_id_valor, token_sesion_valor);

  if clean_intervalo not in (15, 30, 45, 60) then raise exception 'El intervalo de grilla debe ser 15, 30, 45 o 60 minutos.'; end if;
  if clean_visibilidad not in ('completa', 'cliente_servicio', 'solo_ocupado', 'cliente_sin_empleado', 'solo_propios') then raise exception 'La visibilidad de turnos del empleado no es vÃ¡lida.'; end if;
  if clean_cancelacion not in ('propios', 'todos', 'ninguno') then raise exception 'La configuraciÃ³n de cancelaciÃ³n de empleados no es vÃ¡lida.'; end if;
  if clean_detalle not in ('propios', 'todos', 'ninguno') then raise exception 'La configuraciÃ³n de detalle de empleados no es vÃ¡lida.'; end if;
  if clean_slug_url !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then raise exception 'El slug URL debe tener entre 3 y 63 caracteres, con letras minÃºsculas, nÃºmeros o guion.'; end if;
  if clean_slug_url = 'plataforma' then raise exception 'Ese slug URL estÃ¡ reservado para administraciÃ³n plataforma.'; end if;

  select * into target_company
  from public.companies companies
  where companies.slug = lower(trim(coalesce(slug_empresa_valor, '')))
  limit 1;

  if target_company.id is null then
    raise exception 'La empresa no existe.';
  end if;

  if clean_slug_url <> target_company.slug and exists (
    select 1
    from public.companies companies
    where companies.slug = clean_slug_url
      and companies.id is distinct from target_company.id
    limit 1
  ) then
    raise exception 'Ya existe una empresa con ese slug URL.';
  end if;

  update public.companies companies
  set slug = clean_slug_url,
      updated_at = now()
  where companies.id = target_company.id
  returning * into target_company;

  insert into public.app_configuration (
    id,
    company_id,
    company_name,
    banner_images,
    promotions,
    discounts,
    precios_habilitados,
    turnos_superpuestos_habilitados,
    intervalo_grilla_minutos,
    empleados_pueden_reservar,
    empleados_ven_agenda_completa,
    visibilidad_turnos_empleado,
    empleados_cancelan_turnos,
    empleados_ven_detalle_turnos,
    pdf_detalle_turno_habilitado
  ) values (
    true,
    target_company.id,
    target_company.name,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    coalesce(precios_habilitados_valor, true),
    coalesce(turnos_superpuestos_habilitados_valor, true),
    clean_intervalo,
    coalesce(empleados_pueden_reservar_valor, true),
    clean_visibilidad <> 'solo_propios',
    clean_visibilidad,
    clean_cancelacion,
    clean_detalle,
    coalesce(pdf_detalle_turno_habilitado_valor, false)
  )
  on conflict on constraint app_configuration_company_id_key do update set
    precios_habilitados = excluded.precios_habilitados,
    turnos_superpuestos_habilitados = excluded.turnos_superpuestos_habilitados,
    intervalo_grilla_minutos = excluded.intervalo_grilla_minutos,
    empleados_pueden_reservar = excluded.empleados_pueden_reservar,
    empleados_ven_agenda_completa = excluded.empleados_ven_agenda_completa,
    visibilidad_turnos_empleado = excluded.visibilidad_turnos_empleado,
    empleados_cancelan_turnos = excluded.empleados_cancelan_turnos,
    empleados_ven_detalle_turnos = excluded.empleados_ven_detalle_turnos,
    pdf_detalle_turno_habilitado = excluded.pdf_detalle_turno_habilitado,
    updated_at = now();

  return public.plataforma_obtener_configuracion_empresa(cuenta_plataforma_id_valor, token_sesion_valor, target_company.slug);
end;
$$;

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
  if target_company_id is null then raise exception 'La empresa no estÃ¡ disponible.'; end if;

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
        raise exception 'Los empleados no tienen habilitada la cancelaciÃ³n de turnos.';
      end if;

      if alcance_cancelacion = 'propios' and saved_booking.employee_id is distinct from account_record.employee_id then
        raise exception 'Solo podÃ©s cancelar turnos asignados a tu empleado.';
      end if;
    end if;
  elsif auth.uid() is null or saved_booking.user_id is distinct from auth.uid() then
    raise exception 'Solo podÃ©s cancelar turnos propios.';
  end if;

  update public.bookings
  set status = 'cancelled', updated_at = now()
  where id = saved_booking.id
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

grant execute on function public.plataforma_actualizar_configuracion_empresa(uuid, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text, text, text) to anon, authenticated;

drop function if exists public.platform_create_company_admin(uuid, text, text, text, text, text, text, text, boolean, boolean, integer, boolean, boolean, text, boolean);

create or replace function public.platform_create_company_admin(
  platform_account_id_value uuid,
  session_token_value text,
  company_name_value text,
  company_slug_value text,
  admin_username_value text,
  admin_first_name_value text default null,
  admin_last_name_value text default null,
  admin_email_value text default null,
  precios_habilitados_valor boolean default true,
  turnos_superpuestos_habilitados_valor boolean default true,
  intervalo_grilla_minutos_valor integer default 30,
  empleados_pueden_reservar_valor boolean default true,
  empleados_ven_agenda_completa_valor boolean default true,
  visibilidad_turnos_empleado_valor text default 'completa',
  pdf_detalle_turno_habilitado_valor boolean default false,
  empleados_cancelan_turnos_valor text default 'propios',
  empleados_ven_detalle_turnos_valor text default 'propios'
)
returns table (
  company_id uuid,
  company_name text,
  company_slug text,
  admin_account_id uuid,
  admin_username text,
  temporary_password text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_account public.internal_accounts%rowtype;
  clean_company_name text := nullif(trim(coalesce(company_name_value, '')), '');
  clean_company_slug text := lower(regexp_replace(trim(coalesce(company_slug_value, '')), '[^a-zA-Z0-9-]', '', 'g'));
  clean_admin_username text := trim(coalesce(admin_username_value, ''));
  clean_admin_first_name text := nullif(trim(coalesce(admin_first_name_value, '')), '');
  clean_admin_last_name text := nullif(trim(coalesce(admin_last_name_value, '')), '');
  clean_admin_email text := lower(nullif(trim(coalesce(admin_email_value, '')), ''));
  clean_visibilidad text := coalesce(nullif(trim(visibilidad_turnos_empleado_valor), ''), 'completa');
  clean_cancelacion text := coalesce(nullif(trim(empleados_cancelan_turnos_valor), ''), 'propios');
  clean_detalle text := coalesce(nullif(trim(empleados_ven_detalle_turnos_valor), ''), 'propios');
  clean_intervalo integer := coalesce(intervalo_grilla_minutos_valor, 30);
  next_display_name text;
  saved_company public.companies%rowtype;
  saved_account public.internal_accounts%rowtype;
  temp_password text := '123456';
begin
  platform_account := public.validate_platform_admin_session(platform_account_id_value, session_token_value);

  if clean_company_name is null then raise exception 'IngresÃ¡ el nombre de la empresa.'; end if;
  if clean_company_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then raise exception 'El slug debe tener entre 3 y 63 caracteres, con letras minÃºsculas, nÃºmeros o guion.'; end if;
  if clean_company_slug = 'plataforma' then raise exception 'Ese slug estÃ¡ reservado para administraciÃ³n plataforma.'; end if;
  if length(clean_admin_username) < 3 or clean_admin_username !~ '^[A-Za-z0-9._-]+$' then raise exception 'El usuario administrador debe tener al menos 3 caracteres y solo puede usar letras, nÃºmeros, punto, guion o guion bajo.'; end if;
  if clean_admin_email is not null and not public.is_valid_email(clean_admin_email) then raise exception 'IngresÃ¡ un mail vÃ¡lido para el administrador.'; end if;
  if clean_intervalo not in (15, 30, 45, 60) then raise exception 'El intervalo de grilla debe ser 15, 30, 45 o 60 minutos.'; end if;
  if clean_visibilidad not in ('completa', 'cliente_servicio', 'solo_ocupado', 'cliente_sin_empleado', 'solo_propios') then raise exception 'La visibilidad de turnos del empleado no es vÃ¡lida.'; end if;
  if clean_cancelacion not in ('propios', 'todos', 'ninguno') then raise exception 'La configuraciÃ³n de cancelaciÃ³n de empleados no es vÃ¡lida.'; end if;
  if clean_detalle not in ('propios', 'todos', 'ninguno') then raise exception 'La configuraciÃ³n de detalle de empleados no es vÃ¡lida.'; end if;

  next_display_name := trim(concat_ws(' ', clean_admin_first_name, clean_admin_last_name));
  if next_display_name = '' then next_display_name := clean_admin_username; end if;

  insert into public.companies (name, slug, status, owner_email, contact_email)
  values (clean_company_name, clean_company_slug, 'active', clean_admin_email, clean_admin_email)
  on conflict (slug) do update set
    name = excluded.name,
    status = 'active',
    owner_email = coalesce(excluded.owner_email, public.companies.owner_email),
    contact_email = coalesce(excluded.contact_email, public.companies.contact_email),
    updated_at = now()
  returning * into saved_company;

  insert into public.app_configuration (
    id,
    company_id,
    company_name,
    business_hours_text,
    banner_images,
    promotions,
    discounts,
    client_can_choose_employee,
    precios_habilitados,
    turnos_superpuestos_habilitados,
    intervalo_grilla_minutos,
    empleados_pueden_reservar,
    empleados_ven_agenda_completa,
    visibilidad_turnos_empleado,
    empleados_cancelan_turnos,
    empleados_ven_detalle_turnos,
    pdf_detalle_turno_habilitado
  ) values (
    true,
    saved_company.id,
    clean_company_name,
    '',
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    false,
    coalesce(precios_habilitados_valor, true),
    coalesce(turnos_superpuestos_habilitados_valor, true),
    clean_intervalo,
    coalesce(empleados_pueden_reservar_valor, true),
    clean_visibilidad <> 'solo_propios',
    clean_visibilidad,
    clean_cancelacion,
    clean_detalle,
    coalesce(pdf_detalle_turno_habilitado_valor, false)
  )
  on conflict on constraint app_configuration_company_id_key do update set
    company_name = excluded.company_name,
    precios_habilitados = excluded.precios_habilitados,
    turnos_superpuestos_habilitados = excluded.turnos_superpuestos_habilitados,
    intervalo_grilla_minutos = excluded.intervalo_grilla_minutos,
    empleados_pueden_reservar = excluded.empleados_pueden_reservar,
    empleados_ven_agenda_completa = excluded.empleados_ven_agenda_completa,
    visibilidad_turnos_empleado = excluded.visibilidad_turnos_empleado,
    empleados_cancelan_turnos = excluded.empleados_cancelan_turnos,
    empleados_ven_detalle_turnos = excluded.empleados_ven_detalle_turnos,
    pdf_detalle_turno_habilitado = excluded.pdf_detalle_turno_habilitado,
    updated_at = now();

  select *
  into saved_account
  from public.internal_accounts accounts
  where accounts.company_id = saved_company.id
    and accounts.username_normalized = public.normalize_text(clean_admin_username)
  limit 1;

  if saved_account.id is null then
    insert into public.internal_accounts (
      company_id,
      role,
      username,
      display_name,
      first_name,
      last_name,
      username_normalized,
      password_hash,
      employee_id,
      active,
      must_change_password
    ) values (
      saved_company.id,
      'admin'::public.app_role,
      clean_admin_username,
      next_display_name,
      clean_admin_first_name,
      clean_admin_last_name,
      public.normalize_text(clean_admin_username),
      extensions.crypt(temp_password, extensions.gen_salt('bf')),
      null,
      true,
      true
    )
    returning * into saved_account;
  else
    update public.internal_accounts
    set role = 'admin'::public.app_role,
        display_name = next_display_name,
        first_name = clean_admin_first_name,
        last_name = clean_admin_last_name,
        active = true,
        must_change_password = true,
        password_hash = extensions.crypt(temp_password, extensions.gen_salt('bf')),
        updated_at = now()
    where id = saved_account.id
    returning * into saved_account;
  end if;

  company_id := saved_company.id;
  company_name := saved_company.name;
  company_slug := saved_company.slug;
  admin_account_id := saved_account.id;
  admin_username := saved_account.username;
  temporary_password := temp_password;
  return next;
end;
$$;

grant execute on function public.platform_create_company_admin(uuid, text, text, text, text, text, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text, text) to anon, authenticated;
grant execute on function public.cancel_booking(uuid, uuid, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/074_discount_promotion_enablement.sql
-- ============================================================================

-- Habilitacion global de descuentos y promociones por empresa.
-- Run after 073_employee_cancel_detail_scopes.sql.

begin;

alter table public.app_configuration
  add column if not exists descuentos_habilitados boolean not null default true,
  add column if not exists promociones_habilitadas boolean not null default true;

create or replace function public.obtener_configuracion_operativa(configuracion public.app_configuration)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'precios_habilitados', coalesce(configuracion.precios_habilitados, true),
    'descuentos_habilitados', coalesce(configuracion.descuentos_habilitados, true),
    'promociones_habilitadas', coalesce(configuracion.promociones_habilitadas, true),
    'turnos_superpuestos_habilitados', coalesce(configuracion.turnos_superpuestos_habilitados, true),
    'intervalo_grilla_minutos', coalesce(configuracion.intervalo_grilla_minutos, 30),
    'empleados_pueden_reservar', coalesce(configuracion.empleados_pueden_reservar, true),
    'empleados_ven_agenda_completa', coalesce(configuracion.visibilidad_turnos_empleado, 'completa') <> 'solo_propios',
    'visibilidad_turnos_empleado', coalesce(configuracion.visibilidad_turnos_empleado, 'completa'),
    'empleados_cancelan_turnos', coalesce(configuracion.empleados_cancelan_turnos, 'propios'),
    'empleados_ven_detalle_turnos', coalesce(configuracion.empleados_ven_detalle_turnos, 'propios'),
    'pdf_detalle_turno_habilitado', coalesce(configuracion.pdf_detalle_turno_habilitado, false)
  )
$$;

drop function if exists public.plataforma_actualizar_configuracion_empresa(uuid, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text, text, text);

create or replace function public.plataforma_actualizar_configuracion_empresa(
  cuenta_plataforma_id_valor uuid,
  token_sesion_valor text,
  slug_empresa_valor text,
  precios_habilitados_valor boolean default true,
  turnos_superpuestos_habilitados_valor boolean default true,
  intervalo_grilla_minutos_valor integer default 30,
  empleados_pueden_reservar_valor boolean default true,
  empleados_ven_agenda_completa_valor boolean default true,
  visibilidad_turnos_empleado_valor text default 'completa',
  pdf_detalle_turno_habilitado_valor boolean default false,
  slug_url_valor text default null,
  empleados_cancelan_turnos_valor text default 'propios',
  empleados_ven_detalle_turnos_valor text default 'propios',
  descuentos_habilitados_valor boolean default true,
  promociones_habilitadas_valor boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_account public.internal_accounts%rowtype;
  target_company public.companies%rowtype;
  clean_intervalo integer := coalesce(intervalo_grilla_minutos_valor, 30);
  clean_visibilidad text := coalesce(nullif(trim(visibilidad_turnos_empleado_valor), ''), 'completa');
  clean_slug_url text := lower(regexp_replace(trim(coalesce(slug_url_valor, slug_empresa_valor, '')), '[^a-zA-Z0-9-]', '', 'g'));
  clean_cancelacion text := coalesce(nullif(trim(empleados_cancelan_turnos_valor), ''), 'propios');
  clean_detalle text := coalesce(nullif(trim(empleados_ven_detalle_turnos_valor), ''), 'propios');
begin
  platform_account := public.validate_platform_admin_session(cuenta_plataforma_id_valor, token_sesion_valor);

  if clean_intervalo not in (15, 30, 45, 60) then raise exception 'El intervalo de grilla debe ser 15, 30, 45 o 60 minutos.'; end if;
  if clean_visibilidad not in ('completa', 'cliente_servicio', 'solo_ocupado', 'cliente_sin_empleado', 'solo_propios') then raise exception 'La visibilidad de turnos del empleado no es válida.'; end if;
  if clean_cancelacion not in ('propios', 'todos', 'ninguno') then raise exception 'La configuración de cancelación de empleados no es válida.'; end if;
  if clean_detalle not in ('propios', 'todos', 'ninguno') then raise exception 'La configuración de detalle de empleados no es válida.'; end if;
  if clean_slug_url !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then raise exception 'El slug URL debe tener entre 3 y 63 caracteres, con letras minúsculas, números o guion.'; end if;
  if clean_slug_url = 'plataforma' then raise exception 'Ese slug URL está reservado para administración plataforma.'; end if;

  select * into target_company
  from public.companies companies
  where companies.slug = lower(trim(coalesce(slug_empresa_valor, '')))
  limit 1;

  if target_company.id is null then
    raise exception 'La empresa no existe.';
  end if;

  if clean_slug_url <> target_company.slug and exists (
    select 1
    from public.companies companies
    where companies.slug = clean_slug_url
      and companies.id is distinct from target_company.id
    limit 1
  ) then
    raise exception 'Ya existe una empresa con ese slug URL.';
  end if;

  update public.companies companies
  set slug = clean_slug_url,
      updated_at = now()
  where companies.id = target_company.id
  returning * into target_company;

  insert into public.app_configuration (
    id,
    company_id,
    company_name,
    banner_images,
    promotions,
    discounts,
    precios_habilitados,
    descuentos_habilitados,
    promociones_habilitadas,
    turnos_superpuestos_habilitados,
    intervalo_grilla_minutos,
    empleados_pueden_reservar,
    empleados_ven_agenda_completa,
    visibilidad_turnos_empleado,
    empleados_cancelan_turnos,
    empleados_ven_detalle_turnos,
    pdf_detalle_turno_habilitado
  ) values (
    true,
    target_company.id,
    target_company.name,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    coalesce(precios_habilitados_valor, true),
    coalesce(descuentos_habilitados_valor, true),
    coalesce(promociones_habilitadas_valor, true),
    coalesce(turnos_superpuestos_habilitados_valor, true),
    clean_intervalo,
    coalesce(empleados_pueden_reservar_valor, true),
    clean_visibilidad <> 'solo_propios',
    clean_visibilidad,
    clean_cancelacion,
    clean_detalle,
    coalesce(pdf_detalle_turno_habilitado_valor, false)
  )
  on conflict on constraint app_configuration_company_id_key do update set
    precios_habilitados = excluded.precios_habilitados,
    descuentos_habilitados = excluded.descuentos_habilitados,
    promociones_habilitadas = excluded.promociones_habilitadas,
    turnos_superpuestos_habilitados = excluded.turnos_superpuestos_habilitados,
    intervalo_grilla_minutos = excluded.intervalo_grilla_minutos,
    empleados_pueden_reservar = excluded.empleados_pueden_reservar,
    empleados_ven_agenda_completa = excluded.empleados_ven_agenda_completa,
    visibilidad_turnos_empleado = excluded.visibilidad_turnos_empleado,
    empleados_cancelan_turnos = excluded.empleados_cancelan_turnos,
    empleados_ven_detalle_turnos = excluded.empleados_ven_detalle_turnos,
    pdf_detalle_turno_habilitado = excluded.pdf_detalle_turno_habilitado,
    updated_at = now();

  return public.plataforma_obtener_configuracion_empresa(cuenta_plataforma_id_valor, token_sesion_valor, target_company.slug);
end;
$$;

drop function if exists public.platform_create_company_admin(uuid, text, text, text, text, text, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text, text);

create or replace function public.platform_create_company_admin(
  platform_account_id_value uuid,
  session_token_value text,
  company_name_value text,
  company_slug_value text,
  admin_username_value text,
  admin_first_name_value text default null,
  admin_last_name_value text default null,
  admin_email_value text default null,
  precios_habilitados_valor boolean default true,
  turnos_superpuestos_habilitados_valor boolean default true,
  intervalo_grilla_minutos_valor integer default 30,
  empleados_pueden_reservar_valor boolean default true,
  empleados_ven_agenda_completa_valor boolean default true,
  visibilidad_turnos_empleado_valor text default 'completa',
  pdf_detalle_turno_habilitado_valor boolean default false,
  empleados_cancelan_turnos_valor text default 'propios',
  empleados_ven_detalle_turnos_valor text default 'propios',
  descuentos_habilitados_valor boolean default true,
  promociones_habilitadas_valor boolean default true
)
returns table (
  company_id uuid,
  company_name text,
  company_slug text,
  admin_account_id uuid,
  admin_username text,
  temporary_password text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_account public.internal_accounts%rowtype;
  clean_company_name text := nullif(trim(coalesce(company_name_value, '')), '');
  clean_company_slug text := lower(regexp_replace(trim(coalesce(company_slug_value, '')), '[^a-zA-Z0-9-]', '', 'g'));
  clean_admin_username text := trim(coalesce(admin_username_value, ''));
  clean_admin_first_name text := nullif(trim(coalesce(admin_first_name_value, '')), '');
  clean_admin_last_name text := nullif(trim(coalesce(admin_last_name_value, '')), '');
  clean_admin_email text := lower(nullif(trim(coalesce(admin_email_value, '')), ''));
  clean_visibilidad text := coalesce(nullif(trim(visibilidad_turnos_empleado_valor), ''), 'completa');
  clean_cancelacion text := coalesce(nullif(trim(empleados_cancelan_turnos_valor), ''), 'propios');
  clean_detalle text := coalesce(nullif(trim(empleados_ven_detalle_turnos_valor), ''), 'propios');
  clean_intervalo integer := coalesce(intervalo_grilla_minutos_valor, 30);
  next_display_name text;
  saved_company public.companies%rowtype;
  saved_account public.internal_accounts%rowtype;
  temp_password text := '123456';
begin
  platform_account := public.validate_platform_admin_session(platform_account_id_value, session_token_value);

  if clean_company_name is null then raise exception 'Ingresá el nombre de la empresa.'; end if;
  if clean_company_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then raise exception 'El slug debe tener entre 3 y 63 caracteres, con letras minúsculas, números o guion.'; end if;
  if clean_company_slug = 'plataforma' then raise exception 'Ese slug está reservado para administración plataforma.'; end if;
  if length(clean_admin_username) < 3 or clean_admin_username !~ '^[A-Za-z0-9._-]+$' then raise exception 'El usuario administrador debe tener al menos 3 caracteres y solo puede usar letras, números, punto, guion o guion bajo.'; end if;
  if clean_admin_email is not null and not public.is_valid_email(clean_admin_email) then raise exception 'Ingresá un mail válido para el administrador.'; end if;
  if clean_intervalo not in (15, 30, 45, 60) then raise exception 'El intervalo de grilla debe ser 15, 30, 45 o 60 minutos.'; end if;
  if clean_visibilidad not in ('completa', 'cliente_servicio', 'solo_ocupado', 'cliente_sin_empleado', 'solo_propios') then raise exception 'La visibilidad de turnos del empleado no es válida.'; end if;
  if clean_cancelacion not in ('propios', 'todos', 'ninguno') then raise exception 'La configuración de cancelación de empleados no es válida.'; end if;
  if clean_detalle not in ('propios', 'todos', 'ninguno') then raise exception 'La configuración de detalle de empleados no es válida.'; end if;

  next_display_name := trim(concat_ws(' ', clean_admin_first_name, clean_admin_last_name));
  if next_display_name = '' then next_display_name := clean_admin_username; end if;

  insert into public.companies (name, slug, status, owner_email, contact_email)
  values (clean_company_name, clean_company_slug, 'active', clean_admin_email, clean_admin_email)
  on conflict (slug) do update set
    name = excluded.name,
    status = 'active',
    owner_email = coalesce(excluded.owner_email, public.companies.owner_email),
    contact_email = coalesce(excluded.contact_email, public.companies.contact_email),
    updated_at = now()
  returning * into saved_company;

  insert into public.app_configuration (
    id,
    company_id,
    company_name,
    business_hours_text,
    banner_images,
    promotions,
    discounts,
    client_can_choose_employee,
    precios_habilitados,
    descuentos_habilitados,
    promociones_habilitadas,
    turnos_superpuestos_habilitados,
    intervalo_grilla_minutos,
    empleados_pueden_reservar,
    empleados_ven_agenda_completa,
    visibilidad_turnos_empleado,
    empleados_cancelan_turnos,
    empleados_ven_detalle_turnos,
    pdf_detalle_turno_habilitado
  ) values (
    true,
    saved_company.id,
    clean_company_name,
    '',
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    false,
    coalesce(precios_habilitados_valor, true),
    coalesce(descuentos_habilitados_valor, true),
    coalesce(promociones_habilitadas_valor, true),
    coalesce(turnos_superpuestos_habilitados_valor, true),
    clean_intervalo,
    coalesce(empleados_pueden_reservar_valor, true),
    clean_visibilidad <> 'solo_propios',
    clean_visibilidad,
    clean_cancelacion,
    clean_detalle,
    coalesce(pdf_detalle_turno_habilitado_valor, false)
  )
  on conflict on constraint app_configuration_company_id_key do update set
    company_name = excluded.company_name,
    precios_habilitados = excluded.precios_habilitados,
    descuentos_habilitados = excluded.descuentos_habilitados,
    promociones_habilitadas = excluded.promociones_habilitadas,
    turnos_superpuestos_habilitados = excluded.turnos_superpuestos_habilitados,
    intervalo_grilla_minutos = excluded.intervalo_grilla_minutos,
    empleados_pueden_reservar = excluded.empleados_pueden_reservar,
    empleados_ven_agenda_completa = excluded.empleados_ven_agenda_completa,
    visibilidad_turnos_empleado = excluded.visibilidad_turnos_empleado,
    empleados_cancelan_turnos = excluded.empleados_cancelan_turnos,
    empleados_ven_detalle_turnos = excluded.empleados_ven_detalle_turnos,
    pdf_detalle_turno_habilitado = excluded.pdf_detalle_turno_habilitado,
    updated_at = now();

  select *
  into saved_account
  from public.internal_accounts accounts
  where accounts.company_id = saved_company.id
    and accounts.username_normalized = public.normalize_text(clean_admin_username)
  limit 1;

  if saved_account.id is null then
    insert into public.internal_accounts (
      company_id,
      role,
      username,
      display_name,
      first_name,
      last_name,
      username_normalized,
      password_hash,
      employee_id,
      active,
      must_change_password
    ) values (
      saved_company.id,
      'admin'::public.app_role,
      clean_admin_username,
      next_display_name,
      clean_admin_first_name,
      clean_admin_last_name,
      public.normalize_text(clean_admin_username),
      extensions.crypt(temp_password, extensions.gen_salt('bf')),
      null,
      true,
      true
    )
    returning * into saved_account;
  else
    update public.internal_accounts
    set role = 'admin'::public.app_role,
        display_name = next_display_name,
        first_name = clean_admin_first_name,
        last_name = clean_admin_last_name,
        active = true,
        must_change_password = true,
        password_hash = extensions.crypt(temp_password, extensions.gen_salt('bf')),
        updated_at = now()
    where id = saved_account.id
    returning * into saved_account;
  end if;

  company_id := saved_company.id;
  company_name := saved_company.name;
  company_slug := saved_company.slug;
  admin_account_id := saved_account.id;
  admin_username := saved_account.username;
  temporary_password := temp_password;
  return next;
end;
$$;

grant execute on function public.plataforma_actualizar_configuracion_empresa(uuid, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text, text, text, boolean, boolean) to anon, authenticated;
grant execute on function public.platform_create_company_admin(uuid, text, text, text, text, text, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text, text, boolean, boolean) to anon, authenticated;

create or replace function public.plataforma_listar_empresas(
  cuenta_plataforma_id_valor uuid,
  token_sesion_valor text
)
returns table (
  company_id uuid,
  company_name text,
  company_slug text,
  company_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_account public.internal_accounts%rowtype;
begin
  platform_account := public.validate_platform_admin_session(cuenta_plataforma_id_valor, token_sesion_valor);

  return query
  select
    companies.id,
    companies.name,
    companies.slug,
    companies.status
  from public.companies companies
  order by companies.name, companies.slug;
end;
$$;

grant execute on function public.plataforma_listar_empresas(uuid, text) to anon, authenticated;

commit;

