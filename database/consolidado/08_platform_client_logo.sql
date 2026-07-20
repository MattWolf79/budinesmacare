-- Logo configurable del portal cliente por empresa.
-- Ejecutar despues de 05_operativa_slug_visibilidad_permisos_066_074.sql.

begin;

alter table public.app_configuration
  add column if not exists client_logo_data_url text,
  add column if not exists client_logo_file_name text,
  add column if not exists client_logo_mime_type text;

alter table public.app_configuration
  drop constraint if exists app_configuration_client_logo_mime_chk;

alter table public.app_configuration
  add constraint app_configuration_client_logo_mime_chk
  check (
    client_logo_mime_type is null
    or client_logo_mime_type in ('image/jpeg', 'image/png', 'image/webp')
  );

alter table public.app_configuration
  drop constraint if exists app_configuration_client_logo_data_chk;

alter table public.app_configuration
  add constraint app_configuration_client_logo_data_chk
  check (
    client_logo_data_url is null
    or char_length(client_logo_data_url) <= 1200000
  );

drop function if exists public.platform_create_company_admin(uuid, text, text, text, text, text, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text, text, boolean, boolean);

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
  promociones_habilitadas_valor boolean default true,
  client_logo_data_url_valor text default null,
  client_logo_file_name_valor text default null,
  client_logo_mime_type_valor text default null
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
  clean_logo_data_url text := nullif(trim(coalesce(client_logo_data_url_valor, '')), '');
  clean_logo_file_name text := nullif(trim(coalesce(client_logo_file_name_valor, '')), '');
  clean_logo_mime_type text := nullif(trim(coalesce(client_logo_mime_type_valor, '')), '');
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
  if clean_logo_mime_type is not null and clean_logo_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'El logo debe ser JPG, PNG o WEBP.'; end if;
  if clean_logo_data_url is not null and char_length(clean_logo_data_url) > 1200000 then raise exception 'El logo no puede superar el tamano permitido.'; end if;

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
    pdf_detalle_turno_habilitado,
    client_logo_data_url,
    client_logo_file_name,
    client_logo_mime_type
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
    coalesce(pdf_detalle_turno_habilitado_valor, false),
    clean_logo_data_url,
    clean_logo_file_name,
    clean_logo_mime_type
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
    client_logo_data_url = excluded.client_logo_data_url,
    client_logo_file_name = excluded.client_logo_file_name,
    client_logo_mime_type = excluded.client_logo_mime_type,
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

grant execute on function public.platform_create_company_admin(uuid, text, text, text, text, text, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text, text, boolean, boolean, text, text, text) to anon, authenticated;

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
      'client_logo_data_url', selected_config.client_logo_data_url,
      'client_logo_file_name', selected_config.client_logo_file_name,
      'client_logo_mime_type', selected_config.client_logo_mime_type,
      'banner_images', coalesce(selected_config.banner_images, '[]'::jsonb),
      'configuracion_operativa', coalesce(public.obtener_configuracion_operativa(selected_config), jsonb_build_object(
        'precios_habilitados', true,
        'descuentos_habilitados', true,
        'promociones_habilitadas', true,
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
    'client_logo_data_url', null,
    'client_logo_file_name', null,
    'client_logo_mime_type', null,
    'banner_images', '[]'::jsonb,
    'configuracion_operativa', jsonb_build_object(
      'precios_habilitados', true,
      'descuentos_habilitados', true,
      'promociones_habilitadas', true,
      'turnos_superpuestos_habilitados', true,
      'intervalo_grilla_minutos', 30,
      'empleados_pueden_reservar', true,
      'empleados_ven_agenda_completa', true,
      'visibilidad_turnos_empleado', 'completa',
      'pdf_detalle_turno_habilitado', false
    )
  ));
$$;

drop function if exists public.plataforma_actualizar_configuracion_empresa(uuid, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text, text, text, boolean, boolean);

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
  promociones_habilitadas_valor boolean default true,
  client_logo_data_url_valor text default null,
  client_logo_file_name_valor text default null,
  client_logo_mime_type_valor text default null
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
  clean_logo_data_url text := nullif(trim(coalesce(client_logo_data_url_valor, '')), '');
  clean_logo_file_name text := nullif(trim(coalesce(client_logo_file_name_valor, '')), '');
  clean_logo_mime_type text := nullif(trim(coalesce(client_logo_mime_type_valor, '')), '');
begin
  platform_account := public.validate_platform_admin_session(cuenta_plataforma_id_valor, token_sesion_valor);

  if clean_intervalo not in (15, 30, 45, 60) then raise exception 'El intervalo de grilla debe ser 15, 30, 45 o 60 minutos.'; end if;
  if clean_visibilidad not in ('completa', 'cliente_servicio', 'solo_ocupado', 'cliente_sin_empleado', 'solo_propios') then raise exception 'La visibilidad de turnos del empleado no es valida.'; end if;
  if clean_cancelacion not in ('propios', 'todos', 'ninguno') then raise exception 'La configuracion de cancelacion de empleados no es valida.'; end if;
  if clean_detalle not in ('propios', 'todos', 'ninguno') then raise exception 'La configuracion de detalle de empleados no es valida.'; end if;
  if clean_slug_url !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then raise exception 'El slug URL debe tener entre 3 y 63 caracteres, con letras minusculas, numeros o guion.'; end if;
  if clean_slug_url = 'plataforma' then raise exception 'Ese slug URL esta reservado para administracion plataforma.'; end if;
  if clean_logo_mime_type is not null and clean_logo_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'El logo debe ser JPG, PNG o WEBP.'; end if;
  if clean_logo_data_url is not null and char_length(clean_logo_data_url) > 1200000 then raise exception 'El logo no puede superar el tamano permitido.'; end if;

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
    pdf_detalle_turno_habilitado,
    client_logo_data_url,
    client_logo_file_name,
    client_logo_mime_type
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
    coalesce(pdf_detalle_turno_habilitado_valor, false),
    clean_logo_data_url,
    clean_logo_file_name,
    clean_logo_mime_type
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
    client_logo_data_url = excluded.client_logo_data_url,
    client_logo_file_name = excluded.client_logo_file_name,
    client_logo_mime_type = excluded.client_logo_mime_type,
    updated_at = now();

  return public.plataforma_obtener_configuracion_empresa(cuenta_plataforma_id_valor, token_sesion_valor, target_company.slug);
end;
$$;

grant execute on function public.plataforma_actualizar_configuracion_empresa(uuid, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text, text, text, boolean, boolean, text, text, text) to anon, authenticated;

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
    'client_logo_data_url', target_config.client_logo_data_url,
    'client_logo_file_name', target_config.client_logo_file_name,
    'client_logo_mime_type', target_config.client_logo_mime_type,
    'configuracion_operativa', coalesce(public.obtener_configuracion_operativa(target_config), jsonb_build_object(
      'precios_habilitados', true,
      'descuentos_habilitados', true,
      'promociones_habilitadas', true,
      'turnos_superpuestos_habilitados', true,
      'intervalo_grilla_minutos', 30,
      'empleados_pueden_reservar', true,
      'empleados_ven_agenda_completa', true,
      'visibilidad_turnos_empleado', 'completa',
      'empleados_cancelan_turnos', 'propios',
      'empleados_ven_detalle_turnos', 'propios',
      'pdf_detalle_turno_habilitado', false
    ))
  );
end;
$$;

grant execute on function public.plataforma_obtener_configuracion_empresa(uuid, text, text) to anon, authenticated;

commit;
