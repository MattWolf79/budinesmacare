begin;

alter table public.app_configuration
  add column if not exists appearance jsonb not null default '{"palette":"gold"}'::jsonb;

alter table public.app_configuration
  drop constraint if exists app_configuration_appearance_object_chk;

alter table public.app_configuration
  add constraint app_configuration_appearance_object_chk
  check (jsonb_typeof(appearance) = 'object');

alter table public.app_configuration
  drop constraint if exists app_configuration_appearance_palette_chk;

alter table public.app_configuration
  add constraint app_configuration_appearance_palette_chk
  check (
    coalesce(appearance->>'palette', 'gold') in (
      'gold', 'red', 'rose', 'violet', 'blue', 'cyan', 'teal',
      'green', 'lime', 'yellow', 'orange', 'brown', 'gray'
    )
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
      'client_logo_data_url', config.client_logo_data_url,
      'client_logo_file_name', config.client_logo_file_name,
      'client_logo_mime_type', config.client_logo_mime_type,
      'banner_data_url', config.banner_data_url,
      'banner_file_name', config.banner_file_name,
      'banner_mime_type', config.banner_mime_type,
      'banner_images', coalesce(config.banner_images, '[]'::jsonb),
      'promotions', coalesce(config.promotions, '[]'::jsonb),
      'discounts', coalesce(config.discounts, '[]'::jsonb),
      'surcharges', coalesce(config.surcharges, '[]'::jsonb),
      'appearance', coalesce(config.appearance, '{"palette":"gold"}'::jsonb),
      'client_can_choose_employee', coalesce(config.client_can_choose_employee, false),
      'configuracion_operativa', coalesce(public.obtener_configuracion_operativa(config), jsonb_build_object(
        'precios_habilitados', true,
        'descuentos_habilitados', true,
        'recargos_habilitados', true,
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
    'client_logo_data_url', null,
    'client_logo_file_name', null,
    'client_logo_mime_type', null,
    'banner_data_url', null,
    'banner_file_name', null,
    'banner_mime_type', null,
    'banner_images', '[]'::jsonb,
    'promotions', '[]'::jsonb,
    'discounts', '[]'::jsonb,
    'surcharges', '[]'::jsonb,
    'appearance', '{"palette":"gold"}'::jsonb,
    'client_can_choose_employee', false,
    'configuracion_operativa', jsonb_build_object(
      'precios_habilitados', true,
      'descuentos_habilitados', true,
      'recargos_habilitados', true,
      'promociones_habilitadas', true,
      'turnos_superpuestos_habilitados', true,
      'intervalo_grilla_minutos', 30,
      'empleados_pueden_reservar', true,
      'empleados_ven_agenda_completa', true,
      'visibilidad_turnos_empleado', 'completa',
      'empleados_cancelan_turnos', 'propios',
      'empleados_ven_detalle_turnos', 'propios',
      'pdf_detalle_turno_habilitado', false
    )
  ))
$$;

drop function if exists public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, boolean, uuid, text, text, text);

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
  surcharges_value jsonb default '[]'::jsonb,
  appearance_value jsonb default '{"palette":"gold"}'::jsonb,
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
  clean_public_url text := nullif(trim(coalesce(welcome_background_public_url_value, '')), '');
  clean_appearance jsonb := coalesce(appearance_value, '{"palette":"gold"}'::jsonb);
begin
  if target_company_id is null then
    raise exception 'La empresa no esta disponible.';
  end if;

  if jsonb_typeof(coalesce(surcharges_value, '[]'::jsonb)) <> 'array' then
    raise exception 'Los recargos deben enviarse como arreglo.';
  end if;

  if jsonb_typeof(clean_appearance) <> 'object' then
    raise exception 'La apariencia debe enviarse como objeto.';
  end if;

  if coalesce(clean_appearance->>'palette', 'gold') not in (
    'gold', 'red', 'rose', 'violet', 'blue', 'cyan', 'teal',
    'green', 'lime', 'yellow', 'orange', 'brown', 'gray'
  ) then
    raise exception 'El color seleccionado no esta disponible.';
  end if;

  clean_appearance := jsonb_build_object('palette', coalesce(clean_appearance->>'palette', 'gold'));

  if clean_public_url is not null and clean_public_url not like 'https://%' then
    raise exception 'La imagen para mails debe tener una URL publica HTTPS.';
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
      raise exception 'No podes administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);

    if admin_account.company_id is distinct from target_company_id then
      raise exception 'No podes administrar otra empresa.';
    end if;
  end if;

  perform public.save_admin_app_configuration_039(
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
      surcharges = coalesce(surcharges_value, '[]'::jsonb),
      appearance = clean_appearance,
      updated_at = now()
  where configurations.company_id = target_company_id;

  return public.get_app_configuration(company_slug_value);
end;
$$;

grant execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, uuid, text, text, text) to anon, authenticated;

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
      'appearance', coalesce(selected_config.appearance, '{"palette":"gold"}'::jsonb),
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
    'appearance', '{"palette":"gold"}'::jsonb,
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

commit;
