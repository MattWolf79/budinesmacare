-- App configuration for client home banner, promotions, and booking preferences.
-- Run after 014_internal_security_hardening.sql on existing databases.

begin;

create table if not exists public.app_configuration (
  id boolean primary key default true,
  banner_data_url text,
  banner_file_name text,
  banner_mime_type text,
  promotions jsonb not null default '[]'::jsonb,
  client_can_choose_employee boolean not null default false,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  constraint app_configuration_singleton_chk check (id),
  constraint app_configuration_banner_mime_chk check (
    banner_mime_type is null or banner_mime_type in ('image/jpeg', 'image/png')
  ),
  constraint app_configuration_banner_data_chk check (
    banner_data_url is null
    or banner_data_url like 'data:image/jpeg;base64,%'
    or banner_data_url like 'data:image/png;base64,%'
  ),
  constraint app_configuration_promotions_array_chk check (jsonb_typeof(promotions) = 'array')
);

drop trigger if exists app_configuration_set_updated_at on public.app_configuration;
create trigger app_configuration_set_updated_at
before update on public.app_configuration
for each row execute function public.set_updated_at();

insert into public.app_configuration (id)
values (true)
on conflict (id) do nothing;

alter table public.app_configuration enable row level security;

drop policy if exists "app_configuration_read" on public.app_configuration;
drop policy if exists "app_configuration_no_direct_insert" on public.app_configuration;
drop policy if exists "app_configuration_no_direct_update" on public.app_configuration;
drop policy if exists "app_configuration_no_direct_delete" on public.app_configuration;

create policy "app_configuration_read"
  on public.app_configuration
  for select
  using (true);

create policy "app_configuration_no_direct_insert"
  on public.app_configuration
  for insert
  with check (false);

create policy "app_configuration_no_direct_update"
  on public.app_configuration
  for update
  using (false)
  with check (false);

create policy "app_configuration_no_direct_delete"
  on public.app_configuration
  for delete
  using (false);

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
    'promotions', '[]'::jsonb,
    'client_can_choose_employee', false
  ))
$$;

create or replace function public.save_admin_app_configuration(
  banner_data_url_value text default null,
  banner_file_name_value text default null,
  banner_mime_type_value text default null,
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
  next_promotions jsonb := coalesce(promotions_value, '[]'::jsonb);
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

  if jsonb_typeof(next_promotions) <> 'array' then
    raise exception 'Las promociones deben enviarse como arreglo.';
  end if;

  insert into public.app_configuration (
    id,
    banner_data_url,
    banner_file_name,
    banner_mime_type,
    promotions,
    client_can_choose_employee
  ) values (
    true,
    nullif(banner_data_url_value, ''),
    nullif(banner_file_name_value, ''),
    nullif(banner_mime_type_value, ''),
    next_promotions,
    coalesce(client_can_choose_employee_value, false)
  )
  on conflict (id) do update set
    banner_data_url = excluded.banner_data_url,
    banner_file_name = excluded.banner_file_name,
    banner_mime_type = excluded.banner_mime_type,
    promotions = excluded.promotions,
    client_can_choose_employee = excluded.client_can_choose_employee;

  return public.get_app_configuration();
end;
$$;

revoke execute on function public.get_app_configuration() from public;
revoke execute on function public.save_admin_app_configuration(text, text, text, jsonb, boolean, uuid, text) from public;

grant select on public.app_configuration to anon, authenticated;
grant execute on function public.get_app_configuration() to anon, authenticated;
grant execute on function public.save_admin_app_configuration(text, text, text, jsonb, boolean, uuid, text) to anon, authenticated;

commit;
