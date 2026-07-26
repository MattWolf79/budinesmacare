-- ============================================================================
-- Fase 1: RPCs de sucursales (ABM admin) + exposicion en contexto publico
-- ============================================================================
-- Provee lectura/alta/edicion/baja de sucursales para el admin, sincronizando
-- servicios disponibles (branch_services) y empleados (employee_branches).
-- Tambien expone las sucursales activas en get_company_public_context para el
-- flujo de reserva del cliente.
-- Ejecutar despues de 14_sucursales_flag.sql.

begin;

-- -----------------------------------------------------------------------------
-- Listado de sucursales para el admin (incluye servicios y empleados asignados)
-- -----------------------------------------------------------------------------
create or replace function public.get_admin_branches(
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
        'name', b.name,
        'address_street', b.address_street,
        'address_number', b.address_number,
        'address_locality', b.address_locality,
        'phone', b.phone,
        'email', b.email,
        'maps_url', b.maps_url,
        'image_url', b.image_url,
        'active', b.active,
        'sort_order', b.sort_order,
        'service_ids', coalesce((
          select jsonb_agg(bs.service_id order by bs.service_id)
          from public.branch_services bs
          where bs.branch_id = b.id and bs.active
        ), '[]'::jsonb),
        'employee_ids', coalesce((
          select jsonb_agg(eb.employee_id)
          from public.employee_branches eb
          where eb.branch_id = b.id and eb.active
        ), '[]'::jsonb)
      )
      order by b.sort_order, b.name
    )
    from public.branches b
    where b.company_id = target_company_id
  ), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Alta / edicion de sucursal + sincronizacion de servicios y empleados
-- -----------------------------------------------------------------------------
create or replace function public.save_admin_branch(
  branch_id_value uuid default null,
  name_value text default null,
  address_street_value text default null,
  address_number_value text default null,
  address_locality_value text default null,
  phone_value text default null,
  email_value text default null,
  maps_url_value text default null,
  image_url_value text default null,
  active_value boolean default true,
  sort_order_value integer default 0,
  service_ids_value text[] default array[]::text[],
  employee_ids_value uuid[] default array[]::uuid[],
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
  clean_name text := nullif(trim(coalesce(name_value, '')), '');
  clean_email text := nullif(trim(coalesce(email_value, '')), '');
  saved_branch public.branches%rowtype;
  service_id_list bigint[];
begin
  if target_company_id is null then raise exception 'La empresa no esta disponible.'; end if;
  if public.is_admin() then
    if not exists (select 1 from public.profiles profiles where profiles.user_id = auth.uid() and profiles.role = 'admin'::public.app_role and profiles.active is not false and profiles.company_id = target_company_id) then raise exception 'No podes administrar otra empresa.'; end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    if admin_account.company_id is distinct from target_company_id then raise exception 'No podes administrar otra empresa.'; end if;
  end if;

  if clean_name is null then raise exception 'El nombre de la sucursal es obligatorio.'; end if;
  if clean_email is not null and not public.is_valid_email(clean_email) then raise exception 'El email de la sucursal no es valido.'; end if;

  -- Normalizar y validar servicios (deben pertenecer a la empresa).
  select coalesce(array_agg(distinct sid), array[]::bigint[])
  into service_id_list
  from (
    select nullif(trim(unnest_val), '')::bigint as sid
    from unnest(coalesce(service_ids_value, array[]::text[])) as unnest_val
    where nullif(trim(unnest_val), '') is not null
  ) parsed;

  if branch_id_value is not null then
    if not exists (select 1 from public.branches b where b.id = branch_id_value and b.company_id = target_company_id) then
      raise exception 'La sucursal no pertenece a esta empresa.';
    end if;
    update public.branches
    set name = clean_name,
        address_street = nullif(trim(coalesce(address_street_value, '')), ''),
        address_number = nullif(trim(coalesce(address_number_value, '')), ''),
        address_locality = nullif(trim(coalesce(address_locality_value, '')), ''),
        phone = nullif(trim(coalesce(phone_value, '')), ''),
        email = clean_email,
        maps_url = nullif(trim(coalesce(maps_url_value, '')), ''),
        image_url = nullif(trim(coalesce(image_url_value, '')), ''),
        active = coalesce(active_value, true),
        sort_order = coalesce(sort_order_value, 0),
        updated_at = now()
    where id = branch_id_value
    returning * into saved_branch;
  else
    insert into public.branches (
      company_id, name, address_street, address_number, address_locality,
      phone, email, maps_url, image_url, active, sort_order
    ) values (
      target_company_id,
      clean_name,
      nullif(trim(coalesce(address_street_value, '')), ''),
      nullif(trim(coalesce(address_number_value, '')), ''),
      nullif(trim(coalesce(address_locality_value, '')), ''),
      nullif(trim(coalesce(phone_value, '')), ''),
      clean_email,
      nullif(trim(coalesce(maps_url_value, '')), ''),
      nullif(trim(coalesce(image_url_value, '')), ''),
      coalesce(active_value, true),
      coalesce(sort_order_value, 0)
    )
    returning * into saved_branch;
  end if;

  -- Sincronizar servicios disponibles en la sucursal.
  delete from public.branch_services bs
  where bs.branch_id = saved_branch.id
    and not (bs.service_id = any (service_id_list));

  insert into public.branch_services (branch_id, service_id, company_id, active)
  select saved_branch.id, s.id, target_company_id, true
  from public.services s
  where s.company_id = target_company_id
    and s.id = any (service_id_list)
  on conflict (branch_id, service_id) do update set active = true, updated_at = now();

  -- Sincronizar empleados de la sucursal.
  delete from public.employee_branches eb
  where eb.branch_id = saved_branch.id
    and not (eb.employee_id = any (coalesce(employee_ids_value, array[]::uuid[])));

  insert into public.employee_branches (employee_id, branch_id, company_id, active)
  select e.id, saved_branch.id, target_company_id, true
  from public.employees e
  where e.company_id = target_company_id
    and e.deleted_at is null
    and e.id = any (coalesce(employee_ids_value, array[]::uuid[]))
  on conflict (employee_id, branch_id) do update set active = true, updated_at = now();

  return public.get_admin_branches(account_id_value, session_token_value, company_slug_value);
end;
$$;

-- -----------------------------------------------------------------------------
-- Baja de sucursal (con guardas de seguridad)
-- -----------------------------------------------------------------------------
create or replace function public.delete_admin_branch(
  branch_id_value uuid,
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
  branch_count integer;
begin
  if target_company_id is null then raise exception 'La empresa no esta disponible.'; end if;
  if public.is_admin() then
    if not exists (select 1 from public.profiles profiles where profiles.user_id = auth.uid() and profiles.role = 'admin'::public.app_role and profiles.active is not false and profiles.company_id = target_company_id) then raise exception 'No podes administrar otra empresa.'; end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    if admin_account.company_id is distinct from target_company_id then raise exception 'No podes administrar otra empresa.'; end if;
  end if;

  if not exists (select 1 from public.branches b where b.id = branch_id_value and b.company_id = target_company_id) then
    raise exception 'La sucursal no pertenece a esta empresa.';
  end if;

  select count(*) into branch_count from public.branches b where b.company_id = target_company_id;
  if branch_count <= 1 then
    raise exception 'No podes eliminar la unica sucursal de la empresa.';
  end if;

  if exists (select 1 from public.bookings bk where bk.branch_id = branch_id_value) then
    raise exception 'No podes eliminar una sucursal con turnos asociados. Desactivala en su lugar.';
  end if;

  delete from public.branches b where b.id = branch_id_value and b.company_id = target_company_id;

  return public.get_admin_branches(account_id_value, session_token_value, company_slug_value);
end;
$$;

grant execute on function public.get_admin_branches(uuid, text, text) to anon, authenticated;
grant execute on function public.save_admin_branch(uuid, text, text, text, text, text, text, text, text, boolean, integer, text[], uuid[], uuid, text, text) to anon, authenticated;
grant execute on function public.delete_admin_branch(uuid, uuid, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Exponer sucursales activas en el contexto publico (para reservar)
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
      'configuracion_operativa', coalesce(public.obtener_configuracion_operativa(selected_config), jsonb_build_object(
        'precios_habilitados', true,
        'descuentos_habilitados', true,
        'promociones_habilitadas', true,
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
    'configuracion_operativa', jsonb_build_object(
      'precios_habilitados', true,
      'descuentos_habilitados', true,
      'promociones_habilitadas', true,
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
