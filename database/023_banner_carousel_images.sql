-- Store up to 4 client-home banner images for carousel display.
-- Run after 022_drop_ambiguous_internal_booking_rpcs.sql on existing databases.

begin;

alter table public.app_configuration
  add column if not exists banner_images jsonb not null default '[]'::jsonb;

alter table public.app_configuration
  drop constraint if exists app_configuration_banner_images_array_chk;

alter table public.app_configuration
  add constraint app_configuration_banner_images_array_chk
  check (jsonb_typeof(banner_images) = 'array' and jsonb_array_length(banner_images) <= 4);

update public.app_configuration
set banner_images = jsonb_build_array(jsonb_build_object(
  'dataUrl', banner_data_url,
  'fileName', banner_file_name,
  'mimeType', banner_mime_type
))
where banner_data_url is not null
  and jsonb_array_length(banner_images) = 0;

drop function if exists public.save_admin_app_configuration(text, text, text, jsonb, boolean, uuid, text);

create or replace function public.get_app_configuration()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'banner_data_url', banner_data_url,
      'banner_file_name', banner_file_name,
      'banner_mime_type', banner_mime_type,
      'banner_images', banner_images,
      'promotions', promotions,
      'client_can_choose_employee', client_can_choose_employee
    )
    from public.app_configuration
    where id = true
    limit 1
  ), jsonb_build_object(
    'banner_data_url', null,
    'banner_file_name', null,
    'banner_mime_type', null,
    'banner_images', '[]'::jsonb,
    'promotions', '[]'::jsonb,
    'client_can_choose_employee', false
  ))
$$;

create or replace function public.save_admin_app_configuration(
  banner_data_url_value text default null,
  banner_file_name_value text default null,
  banner_mime_type_value text default null,
  banner_images_value jsonb default '[]'::jsonb,
  promotions_value jsonb default '[]'::jsonb,
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
  next_banner_images jsonb := coalesce(banner_images_value, '[]'::jsonb);
  next_promotions jsonb := coalesce(promotions_value, '[]'::jsonb);
  banner_image jsonb;
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
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
    raise exception 'Las imágenes del banner deben enviarse como arreglo.';
  end if;

  if jsonb_array_length(next_banner_images) > 4 then
    raise exception 'El carrusel permite hasta 4 imágenes.';
  end if;

  for banner_image in select * from jsonb_array_elements(next_banner_images)
  loop
    if coalesce(banner_image->>'mimeType', '') not in ('image/jpeg', 'image/png') then
      raise exception 'Las imágenes del banner deben ser JPG o PNG.';
    end if;

    if coalesce(banner_image->>'dataUrl', '') not like 'data:image/jpeg;base64,%'
      and coalesce(banner_image->>'dataUrl', '') not like 'data:image/png;base64,%' then
      raise exception 'Las imágenes del banner deben estar codificadas como JPG o PNG.';
    end if;
  end loop;

  if jsonb_typeof(next_promotions) <> 'array' then
    raise exception 'Las promociones deben enviarse como arreglo.';
  end if;

  insert into public.app_configuration (
    id,
    banner_data_url,
    banner_file_name,
    banner_mime_type,
    banner_images,
    promotions,
    client_can_choose_employee
  ) values (
    true,
    nullif(banner_data_url_value, ''),
    nullif(banner_file_name_value, ''),
    nullif(banner_mime_type_value, ''),
    next_banner_images,
    next_promotions,
    coalesce(client_can_choose_employee_value, false)
  )
  on conflict (id) do update set
    banner_data_url = excluded.banner_data_url,
    banner_file_name = excluded.banner_file_name,
    banner_mime_type = excluded.banner_mime_type,
    banner_images = excluded.banner_images,
    promotions = excluded.promotions,
    client_can_choose_employee = excluded.client_can_choose_employee;

  return public.get_app_configuration();
end;
$$;

revoke execute on function public.get_app_configuration() from public;
revoke execute on function public.save_admin_app_configuration(text, text, text, jsonb, jsonb, boolean, uuid, text) from public;

grant execute on function public.get_app_configuration() to anon, authenticated;
grant execute on function public.save_admin_app_configuration(text, text, text, jsonb, jsonb, boolean, uuid, text) to anon, authenticated;

commit;
