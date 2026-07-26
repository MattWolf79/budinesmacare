-- -----------------------------------------------------------------------------
-- 21_bundles_rpcs.sql
-- -----------------------------------------------------------------------------
-- Fase 2.2: RPCs de administracion de bundles (packs / promos) y exposicion de
-- los bundles activos en get_company_public_context (para cliente/agenda).
--
-- Patron de auth identico a save_admin_branch: resuelve company por slug y
-- valida admin (is_admin sobre profiles.company_id, o sesion interna admin).
--
-- Ejecutar despues de 20_bundles_base.sql. Idempotente.
-- -----------------------------------------------------------------------------

begin;

-- -----------------------------------------------------------------------------
-- Lectura para ABM admin: todos los bundles (activos e inactivos) con items.
-- -----------------------------------------------------------------------------
create or replace function public.get_admin_bundles(
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
  admin_account public.internal_accounts%rowtype;
begin
  if target_company_id is null then raise exception 'La empresa no esta disponible.'; end if;
  if public.is_admin() then
    if not exists (select 1 from public.profiles profiles where profiles.user_id = auth.uid() and profiles.role = 'admin'::public.app_role and profiles.active is not false and profiles.company_id = target_company_id) then raise exception 'No podes administrar otra empresa.'; end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    if admin_account.company_id is distinct from target_company_id then raise exception 'No podes administrar otra empresa.'; end if;
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', b.id,
        'type', b.type,
        'name', b.name,
        'description', b.description,
        'image_url', b.image_url,
        'valid_from', b.valid_from,
        'valid_until', b.valid_until,
        'active', b.active,
        'sort_order', b.sort_order,
        'items', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', bi.id,
              'service_id', bi.service_id,
              'position', bi.position,
              'price', bi.price
            )
            order by bi.position, bi.id
          )
          from public.bundle_items bi
          where bi.bundle_id = b.id
        ), '[]'::jsonb)
      )
      order by b.sort_order, b.name
    )
    from public.bundles b
    where b.company_id = target_company_id
  ), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Alta / edicion de bundle + sincronizacion de items.
-- items_value: jsonb array [{ service_id, position?, price? }].
--   - pack:  price se ignora (siempre NULL => catalogo).
--   - promo: price propio por item (default 0 si no viene).
-- -----------------------------------------------------------------------------
create or replace function public.save_admin_bundle(
  bundle_id_value uuid default null,
  type_value text default 'pack',
  name_value text default null,
  description_value text default null,
  image_url_value text default null,
  valid_from_value date default null,
  valid_until_value date default null,
  active_value boolean default true,
  sort_order_value integer default 0,
  items_value jsonb default '[]'::jsonb,
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
  admin_account public.internal_accounts%rowtype;
  clean_type text := lower(nullif(trim(coalesce(type_value, '')), ''));
  clean_name text := nullif(trim(coalesce(name_value, '')), '');
  clean_valid_from date := valid_from_value;
  clean_valid_until date := valid_until_value;
  saved_bundle public.bundles%rowtype;
  item_count integer;
  invalid_count integer;
begin
  if target_company_id is null then raise exception 'La empresa no esta disponible.'; end if;
  if public.is_admin() then
    if not exists (select 1 from public.profiles profiles where profiles.user_id = auth.uid() and profiles.role = 'admin'::public.app_role and profiles.active is not false and profiles.company_id = target_company_id) then raise exception 'No podes administrar otra empresa.'; end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    if admin_account.company_id is distinct from target_company_id then raise exception 'No podes administrar otra empresa.'; end if;
  end if;

  if clean_type is null or clean_type not in ('pack', 'promo') then raise exception 'El tipo de combo debe ser pack o promo.'; end if;
  if clean_name is null then raise exception 'El nombre del combo es obligatorio.'; end if;

  -- Los packs no manejan vencimiento.
  if clean_type = 'pack' then
    clean_valid_from := null;
    clean_valid_until := null;
  end if;
  if clean_valid_from is not null and clean_valid_until is not null and clean_valid_until < clean_valid_from then
    raise exception 'La fecha de fin de vigencia no puede ser anterior a la de inicio.';
  end if;

  -- Validar items: deben ser al menos 2 y pertenecer a la empresa.
  select count(*) into item_count
  from jsonb_array_elements(coalesce(items_value, '[]'::jsonb)) elem
  where nullif(trim(elem->>'service_id'), '') is not null;

  if item_count < 2 then raise exception 'El combo debe incluir al menos 2 servicios.'; end if;

  select count(*) into invalid_count
  from jsonb_array_elements(coalesce(items_value, '[]'::jsonb)) elem
  where nullif(trim(elem->>'service_id'), '') is not null
    and not exists (
      select 1 from public.services s
      where s.id = (elem->>'service_id')::bigint and s.company_id = target_company_id
    );

  if invalid_count > 0 then raise exception 'Alguno de los servicios del combo no pertenece a esta empresa.'; end if;

  if bundle_id_value is not null then
    if not exists (select 1 from public.bundles b where b.id = bundle_id_value and b.company_id = target_company_id) then
      raise exception 'El combo no pertenece a esta empresa.';
    end if;
    update public.bundles
    set type = clean_type,
        name = clean_name,
        description = nullif(trim(coalesce(description_value, '')), ''),
        image_url = nullif(trim(coalesce(image_url_value, '')), ''),
        valid_from = clean_valid_from,
        valid_until = clean_valid_until,
        active = coalesce(active_value, true),
        sort_order = coalesce(sort_order_value, 0),
        updated_at = now()
    where id = bundle_id_value
    returning * into saved_bundle;
  else
    insert into public.bundles (
      company_id, type, name, description, image_url, valid_from, valid_until, active, sort_order
    ) values (
      target_company_id,
      clean_type,
      clean_name,
      nullif(trim(coalesce(description_value, '')), ''),
      nullif(trim(coalesce(image_url_value, '')), ''),
      clean_valid_from,
      clean_valid_until,
      coalesce(active_value, true),
      coalesce(sort_order_value, 0)
    )
    returning * into saved_bundle;
  end if;

  -- Reemplazar items (delete + insert es simple y consistente).
  delete from public.bundle_items bi where bi.bundle_id = saved_bundle.id;

  insert into public.bundle_items (bundle_id, service_id, company_id, position, price)
  select saved_bundle.id,
         (elem->>'service_id')::bigint,
         target_company_id,
         coalesce(nullif(trim(elem->>'position'), '')::integer, (ord - 1)::integer),
         case when clean_type = 'pack' then null
              else coalesce(nullif(trim(elem->>'price'), '')::numeric, 0) end
  from jsonb_array_elements(coalesce(items_value, '[]'::jsonb)) with ordinality as t(elem, ord)
  where nullif(trim(elem->>'service_id'), '') is not null;

  return public.get_admin_bundles(account_id_value, session_token_value, company_slug_value);
end;
$$;

-- -----------------------------------------------------------------------------
-- Baja de bundle (los bookings ya reservados quedan con bundle_id NULL por FK).
-- -----------------------------------------------------------------------------
create or replace function public.delete_admin_bundle(
  bundle_id_value uuid,
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
  admin_account public.internal_accounts%rowtype;
begin
  if target_company_id is null then raise exception 'La empresa no esta disponible.'; end if;
  if public.is_admin() then
    if not exists (select 1 from public.profiles profiles where profiles.user_id = auth.uid() and profiles.role = 'admin'::public.app_role and profiles.active is not false and profiles.company_id = target_company_id) then raise exception 'No podes administrar otra empresa.'; end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    if admin_account.company_id is distinct from target_company_id then raise exception 'No podes administrar otra empresa.'; end if;
  end if;

  if not exists (select 1 from public.bundles b where b.id = bundle_id_value and b.company_id = target_company_id) then
    raise exception 'El combo no pertenece a esta empresa.';
  end if;

  delete from public.bundles b where b.id = bundle_id_value and b.company_id = target_company_id;

  return public.get_admin_bundles(account_id_value, session_token_value, company_slug_value);
end;
$$;

revoke execute on function public.get_admin_bundles(uuid, text, text) from public;
revoke execute on function public.save_admin_bundle(uuid, text, text, text, text, date, date, boolean, integer, jsonb, uuid, text, text) from public;
revoke execute on function public.delete_admin_bundle(uuid, uuid, text, text) from public;

grant execute on function public.get_admin_bundles(uuid, text, text) to anon, authenticated;
grant execute on function public.save_admin_bundle(uuid, text, text, text, text, date, date, boolean, integer, jsonb, uuid, text, text) to anon, authenticated;
grant execute on function public.delete_admin_bundle(uuid, uuid, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Exponer bundles activos y vigentes en get_company_public_context.
-- Promo: solo dentro de vigencia (valid_from/valid_until, null = sin limite).
-- Pack: siempre vigente. Cada item resuelve su precio (catalogo o propio) y su
-- duracion desde services. total_price = suma de precios resueltos.
-- -----------------------------------------------------------------------------
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
