-- ============================================================================
-- 31_company_landing.sql
-- ============================================================================
-- Landing pública por empresa (ruta /{slug}). El contenido editable se guarda
-- en un unico jsonb `landing_config` en app_configuration (campos fijos):
--   habilitada (bool), titulo, subtitulo, descripcion,
--   hero_image_data_url (+ mime/nombre opcional), cta_texto,
--   beneficios (array de textos, max 4),
--   direccion, telefono, whatsapp, instagram,
--   mostrar_acceso_interno (bool)
-- Se expone via get_company_public_context (clave `landing`) y se edita desde
-- Plataforma con plataforma_actualizar_configuracion_empresa / _obtener_.
-- Ejecutar despues de 30_client_self_profile_gender_photo_notes.sql.

begin;

-- 1) Columna de configuracion de landing (jsonb unico).
alter table public.app_configuration
  add column if not exists landing_config jsonb not null default '{}'::jsonb;

-- Limite de tamano (incluye la imagen hero embebida como data URL).
alter table public.app_configuration
  drop constraint if exists app_configuration_landing_config_size_chk;

alter table public.app_configuration
  add constraint app_configuration_landing_config_size_chk
  check (char_length(landing_config::text) <= 1600000);

-- ----------------------------------------------------------------------------
-- 2) get_company_public_context: agregar la clave `landing`.
--    (Reproduce la version vigente de 21_bundles_rpcs.sql sumando `landing`.)
-- ----------------------------------------------------------------------------
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
      'landing', coalesce(selected_config.landing_config, '{}'::jsonb),
      'branches', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', b.id,
            'name', b.name,
            'address_street', b.address_street,
            'address_number', b.address_number,
            'address_locality', b.address_locality,
            'phone', b.phone,
            'email', b.email,
            'maps_url', b.maps_url,
            'image_url', b.image_url,
            'sort_order', b.sort_order
          )
          order by b.sort_order, b.name
        )
        from public.branches b
        where b.company_id = selected_company.id and b.active
      ), '[]'::jsonb),
      'bundles', coalesce((
        select jsonb_agg(bundle_obj order by bundle_sort, bundle_name)
        from (
          select
            b.sort_order as bundle_sort,
            b.name as bundle_name,
            jsonb_build_object(
              'id', b.id,
              'type', b.type,
              'name', b.name,
              'description', b.description,
              'image_url', b.image_url,
              'valid_from', b.valid_from,
              'valid_until', b.valid_until,
              'sort_order', b.sort_order,
              'items', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'service_id', bi.service_id,
                    'name', s.name,
                    'icon', s.icon,
                    'color', s.color,
                    'default_duration', s.default_duration,
                    'position', bi.position,
                    'price', case when b.type = 'pack' then s.base_price else coalesce(bi.price, 0) end
                  )
                  order by bi.position, bi.id
                )
                from public.bundle_items bi
                join public.services s on s.id = bi.service_id
                where bi.bundle_id = b.id
              ), '[]'::jsonb),
              'total_price', coalesce((
                select sum(case when b.type = 'pack' then s.base_price else coalesce(bi.price, 0) end)
                from public.bundle_items bi
                join public.services s on s.id = bi.service_id
                where bi.bundle_id = b.id
              ), 0),
              'total_duration', coalesce((
                select sum(s.default_duration)
                from public.bundle_items bi
                join public.services s on s.id = bi.service_id
                where bi.bundle_id = b.id
              ), 0)
            ) as bundle_obj
          from public.bundles b
          where b.company_id = selected_company.id
            and b.active
            and (b.valid_from is null or b.valid_from <= current_date)
            and (b.valid_until is null or b.valid_until >= current_date)
        ) bundles_source
      ), '[]'::jsonb),
      'configuracion_operativa', coalesce(public.obtener_configuracion_operativa(selected_config), jsonb_build_object(
        'precios_habilitados', true,
        'descuentos_habilitados', true,
        'promociones_habilitadas', true,
        'packs_habilitados', false,
        'sucursales_habilitadas', false,
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
    'landing', '{}'::jsonb,
    'branches', '[]'::jsonb,
    'bundles', '[]'::jsonb,
    'configuracion_operativa', jsonb_build_object(
      'precios_habilitados', true,
      'descuentos_habilitados', true,
      'promociones_habilitadas', true,
      'packs_habilitados', false,
      'sucursales_habilitadas', false,
      'turnos_superpuestos_habilitados', true,
      'intervalo_grilla_minutos', 30,
      'empleados_pueden_reservar', true,
      'empleados_ven_agenda_completa', true,
      'visibilidad_turnos_empleado', 'completa',
      'pdf_detalle_turno_habilitado', false
    )
  ));
$$;

grant execute on function public.get_company_public_context(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3) plataforma_obtener_configuracion_empresa: devolver landing_config.
--    (Misma firma; solo agrega la clave al jsonb de salida.)
-- ----------------------------------------------------------------------------
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
    'landing_config', coalesce(target_config.landing_config, '{}'::jsonb),
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

-- ----------------------------------------------------------------------------
-- 4) plataforma_actualizar_configuracion_empresa: aceptar landing_config_valor.
--    (Reproduce la version de 22_packs_flag.sql sumando el jsonb de landing.)
-- ----------------------------------------------------------------------------
drop function if exists public.plataforma_actualizar_configuracion_empresa(uuid, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text, text, text, boolean, boolean, text, text, text, boolean, boolean, boolean);

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
  client_logo_mime_type_valor text default null,
  recargos_habilitados_valor boolean default true,
  sucursales_habilitadas_valor boolean default false,
  packs_habilitados_valor boolean default false,
  landing_config_valor jsonb default null
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
  clean_landing_config jsonb := coalesce(landing_config_valor, '{}'::jsonb);
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
  if jsonb_typeof(clean_landing_config) <> 'object' then raise exception 'La configuracion de la landing no es valida.'; end if;
  if char_length(clean_landing_config::text) > 1600000 then raise exception 'La imagen de la landing supera el tamano permitido.'; end if;

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
    recargos_habilitados,
    promociones_habilitadas,
    sucursales_habilitadas,
    packs_habilitados,
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
    client_logo_mime_type,
    landing_config
  ) values (
    true,
    target_company.id,
    target_company.name,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    coalesce(precios_habilitados_valor, true),
    coalesce(descuentos_habilitados_valor, true),
    coalesce(recargos_habilitados_valor, true),
    coalesce(promociones_habilitadas_valor, true),
    coalesce(sucursales_habilitadas_valor, false),
    coalesce(packs_habilitados_valor, false),
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
    clean_logo_mime_type,
    clean_landing_config
  )
  on conflict on constraint app_configuration_company_id_key do update set
    precios_habilitados = excluded.precios_habilitados,
    descuentos_habilitados = excluded.descuentos_habilitados,
    recargos_habilitados = excluded.recargos_habilitados,
    promociones_habilitadas = excluded.promociones_habilitadas,
    sucursales_habilitadas = excluded.sucursales_habilitadas,
    packs_habilitados = excluded.packs_habilitados,
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
    landing_config = excluded.landing_config,
    updated_at = now();

  return public.plataforma_obtener_configuracion_empresa(cuenta_plataforma_id_valor, token_sesion_valor, target_company.slug);
end;
$$;

grant execute on function public.plataforma_actualizar_configuracion_empresa(uuid, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text, text, text, boolean, boolean, text, text, text, boolean, boolean, boolean, jsonb) to anon, authenticated;

commit;
