-- Add a configurable background image for the client welcome section.
-- Run after 029_employee_workspace_completed_bookings.sql on existing databases.

begin;

alter table public.app_configuration
  add column if not exists welcome_background_data_url text,
  add column if not exists welcome_background_file_name text,
  add column if not exists welcome_background_mime_type text;

alter table public.app_configuration
  drop constraint if exists app_configuration_welcome_background_mime_chk;

alter table public.app_configuration
  add constraint app_configuration_welcome_background_mime_chk check (
    welcome_background_mime_type is null or welcome_background_mime_type in ('image/jpeg', 'image/png')
  );

alter table public.app_configuration
  drop constraint if exists app_configuration_welcome_background_data_chk;

alter table public.app_configuration
  add constraint app_configuration_welcome_background_data_chk check (
    welcome_background_data_url is null
    or welcome_background_data_url like 'data:image/jpeg;base64,%'
    or welcome_background_data_url like 'data:image/png;base64,%'
  );

drop function if exists public.save_admin_app_configuration(text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text);

create or replace function public.get_app_configuration()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'company_name', company_name,
      'welcome_background_data_url', welcome_background_data_url,
      'welcome_background_file_name', welcome_background_file_name,
      'welcome_background_mime_type', welcome_background_mime_type,
      'banner_data_url', banner_data_url,
      'banner_file_name', banner_file_name,
      'banner_mime_type', banner_mime_type,
      'banner_images', banner_images,
      'promotions', promotions,
      'discounts', discounts,
      'client_can_choose_employee', client_can_choose_employee
    )
    from public.app_configuration
    where id = true
    limit 1
  ), jsonb_build_object(
    'company_name', 'Turnos App',
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

create or replace function public.save_admin_app_configuration(
  company_name_value text default 'Turnos App',
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
  session_token_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_company_name text := nullif(trim(coalesce(company_name_value, '')), '');
  next_banner_images jsonb := coalesce(banner_images_value, '[]'::jsonb);
  next_promotions jsonb := coalesce(promotions_value, '[]'::jsonb);
  next_discounts jsonb := coalesce(discounts_value, '[]'::jsonb);
  banner_image jsonb;
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if next_company_name is null then
    next_company_name := 'Turnos App';
  end if;

  if char_length(next_company_name) > 40 then
    raise exception 'El nombre de la empresa debe tener hasta 40 caracteres.';
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
    company_name,
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
    next_company_name,
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
  on conflict (id) do update set
    company_name = excluded.company_name,
    welcome_background_data_url = excluded.welcome_background_data_url,
    welcome_background_file_name = excluded.welcome_background_file_name,
    welcome_background_mime_type = excluded.welcome_background_mime_type,
    banner_data_url = excluded.banner_data_url,
    banner_file_name = excluded.banner_file_name,
    banner_mime_type = excluded.banner_mime_type,
    banner_images = excluded.banner_images,
    promotions = excluded.promotions,
    discounts = excluded.discounts,
    client_can_choose_employee = excluded.client_can_choose_employee;

  return public.get_app_configuration();
end;
$$;

revoke execute on function public.get_app_configuration() from public;
revoke execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text) from public;

grant execute on function public.get_app_configuration() to anon, authenticated;
grant execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text) to anon, authenticated;

commit;