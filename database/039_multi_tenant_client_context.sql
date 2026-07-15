-- Phase 2 multi-company client context and tenant-aware public RPCs.
-- Run after 038_client_promotion_availability_guard.sql.
-- This keeps esteticatopbody as the default tenant for backwards compatibility.

begin;

create or replace function public.get_company_id_by_slug(slug_value text default null)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.companies
  where slug = lower(trim(coalesce(nullif(slug_value, ''), 'esteticatopbody')))
    and status = 'active'
  limit 1
$$;

insert into public.companies (name, slug, status)
values ('Barberia Demo', 'barberia-demo', 'active')
on conflict (slug) do update set
  name = excluded.name,
  status = case
    when public.companies.status in ('cancelled', 'suspended') then public.companies.status
    else excluded.status
  end,
  updated_at = now();

alter table if exists public.app_configuration
  drop constraint if exists app_configuration_singleton_chk;

alter table if exists public.app_configuration
  drop constraint if exists app_configuration_pkey;

alter table if exists public.app_configuration
  drop constraint if exists app_configuration_company_id_key;

alter table if exists public.app_configuration
  add constraint app_configuration_company_id_key unique (company_id);

insert into public.app_configuration (
  id,
  company_id,
  company_name,
  business_hours_text,
  banner_images,
  promotions,
  discounts,
  client_can_choose_employee
)
select
  true,
  companies.id,
  companies.name,
  '',
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  false
from public.companies companies
where companies.slug = 'barberia-demo'
on conflict (company_id) do nothing;

drop function if exists public.get_app_configuration();

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

create or replace function public.get_company_public_context(slug_value text default 'esteticatopbody')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_company as (
    select companies.*
    from public.companies companies
    where companies.slug = lower(trim(coalesce(nullif(slug_value, ''), 'esteticatopbody')))
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
      'banner_images', coalesce(selected_config.banner_images, '[]'::jsonb)
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
    'banner_images', '[]'::jsonb
  ))
$$;

drop function if exists public.get_client_booking_options();

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

drop function if exists public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text);

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
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  next_company_name text := nullif(trim(coalesce(company_name_value, '')), '');
  next_business_hours_text text := trim(coalesce(business_hours_text_value, ''));
  next_banner_images jsonb := coalesce(banner_images_value, '[]'::jsonb);
  next_promotions jsonb := coalesce(promotions_value, '[]'::jsonb);
  next_discounts jsonb := coalesce(discounts_value, '[]'::jsonb);
  banner_image jsonb;
begin
  if target_company_id is null then
    raise exception 'La empresa no está disponible.';
  end if;

  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if next_company_name is null then
    next_company_name := 'Turnos App';
  end if;

  if char_length(next_company_name) > 40 then
    raise exception 'El nombre de la empresa debe tener hasta 40 caracteres.';
  end if;

  if char_length(next_business_hours_text) > 500 then
    raise exception 'El horario de atencion debe tener hasta 500 caracteres.';
  end if;

  if welcome_background_mime_type_value is not null and welcome_background_mime_type_value not in ('image/jpeg', 'image/png') then
    raise exception 'El fondo de bienvenida debe ser JPG o PNG.';
  end if;

  if welcome_background_data_url_value is not null
    and welcome_background_data_url_value not like 'data:image/jpeg;base64,%'
    and welcome_background_data_url_value not like 'data:image/png;base64,%' then
    raise exception 'El fondo de bienvenida debe estar codificado como imagen JPG o PNG.';
  end if;

  if banner_mime_type_value is not null and banner_mime_type_value not in ('image/jpeg', 'image/png') then
    raise exception 'El banner debe ser JPG o PNG.';
  end if;

  if banner_data_url_value is not null
    and banner_data_url_value not like 'data:image/jpeg;base64,%'
    and banner_data_url_value not like 'data:image/png;base64,%' then
    raise exception 'El banner debe estar codificado como imagen JPG o PNG.';
  end if;

  if jsonb_typeof(next_banner_images) <> 'array' then
    raise exception 'Las imagenes del banner deben enviarse como arreglo.';
  end if;

  if jsonb_array_length(next_banner_images) > 4 then
    raise exception 'El carrusel permite hasta 4 imagenes.';
  end if;

  for banner_image in select * from jsonb_array_elements(next_banner_images)
  loop
    if coalesce(banner_image->>'mimeType', '') not in ('image/jpeg', 'image/png') then
      raise exception 'Las imagenes del banner deben ser JPG o PNG.';
    end if;

    if coalesce(banner_image->>'dataUrl', '') not like 'data:image/jpeg;base64,%'
      and coalesce(banner_image->>'dataUrl', '') not like 'data:image/png;base64,%' then
      raise exception 'Las imagenes del banner deben estar codificadas como JPG o PNG.';
    end if;
  end loop;

  if jsonb_typeof(next_promotions) <> 'array' then
    raise exception 'Las promociones deben enviarse como arreglo.';
  end if;

  if jsonb_typeof(next_discounts) <> 'array' then
    raise exception 'Los descuentos deben enviarse como arreglo.';
  end if;

  insert into public.app_configuration (
    id,
    company_id,
    company_name,
    business_hours_text,
    welcome_background_data_url,
    welcome_background_file_name,
    welcome_background_mime_type,
    banner_data_url,
    banner_file_name,
    banner_mime_type,
    banner_images,
    promotions,
    discounts,
    client_can_choose_employee
  ) values (
    true,
    target_company_id,
    next_company_name,
    next_business_hours_text,
    nullif(welcome_background_data_url_value, ''),
    nullif(welcome_background_file_name_value, ''),
    nullif(welcome_background_mime_type_value, ''),
    nullif(banner_data_url_value, ''),
    nullif(banner_file_name_value, ''),
    nullif(banner_mime_type_value, ''),
    next_banner_images,
    next_promotions,
    next_discounts,
    coalesce(client_can_choose_employee_value, false)
  )
  on conflict (company_id) do update set
    company_name = excluded.company_name,
    business_hours_text = excluded.business_hours_text,
    welcome_background_data_url = excluded.welcome_background_data_url,
    welcome_background_file_name = excluded.welcome_background_file_name,
    welcome_background_mime_type = excluded.welcome_background_mime_type,
    banner_data_url = excluded.banner_data_url,
    banner_file_name = excluded.banner_file_name,
    banner_mime_type = excluded.banner_mime_type,
    banner_images = excluded.banner_images,
    promotions = excluded.promotions,
    discounts = excluded.discounts,
    client_can_choose_employee = excluded.client_can_choose_employee,
    updated_at = now();

  return public.get_app_configuration(company_slug_value);
end;
$$;

drop function if exists public.request_client_booking(bigint, uuid, text, timestamp without time zone, timestamp without time zone, text, text);

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
    raise exception 'La empresa no está disponible.';
  end if;

  if auth.uid() is null then
    raise exception 'Iniciá sesión para solicitar un turno.';
  end if;

  if start_at_value is null or end_at_value is null or end_at_value <= start_at_value then
    raise exception 'El horario seleccionado no es válido.';
  end if;

  if start_at_value < current_business_time then
    raise exception 'No se pueden solicitar turnos en horarios pasados.';
  end if;

  if service_id_value is null and clean_booking_description is null then
    raise exception 'Seleccioná un servicio o promoción.';
  end if;

  if service_id_value is not null and not exists (
    select 1
    from public.services services
    where services.id = service_id_value
      and services.company_id = target_company_id
      and services.active is not false
  ) then
    raise exception 'El servicio seleccionado no está disponible.';
  end if;

  if service_id_value is null then
    select promotion
    into selected_promotion
    from public.app_configuration configuration,
      jsonb_array_elements(coalesce(configuration.promotions, '[]'::jsonb)) promotion
    where configuration.company_id = target_company_id
      and coalesce((promotion->>'enabled')::boolean, false) is true
      and nullif(trim(concat_ws(
        ' · ',
        nullif(trim(coalesce(promotion->>'title', '')), ''),
        nullif(trim(coalesce(promotion->>'description', '')), ''),
        nullif(trim(coalesce(promotion->>'value', '')), '')
      )), '') = clean_booking_description
    limit 1;

    if selected_promotion is null then
      raise exception 'La promoción seleccionada no está disponible.';
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
    raise exception 'Ya tenés un turno o solicitud en ese horario.';
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
      raise exception 'No hay disponibilidad para esa promoción en ese horario.';
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
      raise exception 'El empleado seleccionado no está disponible.';
    end if;

    if service_id_value is not null and not exists (
      select 1
      from public.employee_services relations
      where relations.company_id = target_company_id
        and relations.employee_id = employee_id_value
        and relations.service_id = service_id_value
    ) then
      raise exception 'El empleado no está vinculado a ese servicio.';
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

revoke execute on function public.get_company_id_by_slug(text) from public;
revoke execute on function public.get_app_configuration(text) from public;
revoke execute on function public.get_company_public_context(text) from public;
revoke execute on function public.get_client_booking_options(text) from public;
revoke execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text) from public;
revoke execute on function public.request_client_booking(bigint, uuid, text, timestamp without time zone, timestamp without time zone, text, text, text) from public;

grant execute on function public.get_company_id_by_slug(text) to anon, authenticated;
grant execute on function public.get_app_configuration(text) to anon, authenticated;
grant execute on function public.get_company_public_context(text) to anon, authenticated;
grant execute on function public.get_client_booking_options(text) to anon, authenticated;
grant execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text) to anon, authenticated;
grant execute on function public.request_client_booking(bigint, uuid, text, timestamp without time zone, timestamp without time zone, text, text, text) to anon, authenticated;

commit;
