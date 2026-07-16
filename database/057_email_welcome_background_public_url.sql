-- Store welcome background as a public HTTPS image so email clients can render it.
-- Run after 056_regenerate_employee_username_on_update.sql.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-mail-assets', 'company-mail-assets', true, 1048576, array['image/jpeg', 'image/png'])
on conflict (id) do update set
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = array['image/jpeg', 'image/png'],
  updated_at = now();

drop policy if exists company_mail_assets_read on storage.objects;
create policy company_mail_assets_read
  on storage.objects for select
  to public
  using (bucket_id = 'company-mail-assets');

drop policy if exists company_mail_assets_insert on storage.objects;
create policy company_mail_assets_insert
  on storage.objects for insert
  to public
  with check (bucket_id = 'company-mail-assets');

drop policy if exists company_mail_assets_update on storage.objects;
create policy company_mail_assets_update
  on storage.objects for update
  to public
  using (bucket_id = 'company-mail-assets')
  with check (bucket_id = 'company-mail-assets');

alter table public.app_configuration
  add column if not exists welcome_background_public_url text;

alter table public.app_configuration
  drop constraint if exists app_configuration_welcome_background_public_url_chk;

alter table public.app_configuration
  add constraint app_configuration_welcome_background_public_url_chk check (
    welcome_background_public_url is null
    or welcome_background_public_url like 'https://%'
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
    'welcome_background_public_url', null,
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

drop function if exists public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text);

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
  saved_config jsonb;
  clean_public_url text := nullif(trim(coalesce(welcome_background_public_url_value, '')), '');
begin
  if target_company_id is null then
    raise exception 'La empresa no está disponible.';
  end if;

  if clean_public_url is not null and clean_public_url not like 'https://%' then
    raise exception 'La imagen para mails debe tener una URL pública HTTPS.';
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
      raise exception 'No podés administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);

    if admin_account.company_id is distinct from target_company_id then
      raise exception 'No podés administrar otra empresa.';
    end if;
  end if;

  saved_config := public.save_admin_app_configuration_039(
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
      updated_at = now()
  where configurations.company_id = target_company_id;

  return public.get_app_configuration(company_slug_value);
end;
$$;

create or replace function public.format_booking_notification_html(
  booking_value public.bookings,
  event_label text,
  cta_label text default null,
  cta_url text default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  service_name text;
  employee_name text;
  company_name text := public.get_company_mail_display_name(booking_value.company_id);
  header_background_url text;
  header_style text;
  activity_name text;
  client_name text;
  event_intro text;
  badge_label text;
  clean_cta_label text := nullif(trim(coalesce(cta_label, '')), '');
  clean_cta_url text := nullif(trim(coalesce(cta_url, '')), '');
begin
  select services.name into service_name
  from public.services services
  where services.id = booking_value.service
    and services.company_id = booking_value.company_id;

  select coalesce(nullif(trim(concat_ws(' ', employees.first_name, employees.last_name)), ''), employees.name)
  into employee_name
  from public.employees employees
  where employees.id = booking_value.employee_id
    and employees.company_id = booking_value.company_id;

  activity_name := coalesce(nullif(booking_value.booking_description, ''), service_name, 'Turno');
  client_name := coalesce(nullif(booking_value.customer_name, ''), nullif(booking_value.user_email, ''), 'Cliente sin datos');

  select nullif(trim(configurations.welcome_background_public_url), '')
  into header_background_url
  from public.app_configuration configurations
  where configurations.company_id = booking_value.company_id
    and configurations.welcome_background_public_url like 'https://%'
  limit 1;

  header_style := 'padding:24px 26px;background:#26313a;color:#ffffff';

  if header_background_url is not null then
    header_style := 'padding:24px 26px;color:#ffffff;background-color:#26313a;background-image:linear-gradient(rgba(23,31,39,.78),rgba(23,31,39,.82)),url(''' || replace(header_background_url, '''', '%27') || ''');background-size:cover;background-position:center;background-repeat:no-repeat';
  end if;

  event_intro := case
    when event_label ilike '%recordatorio%' then 'Te esperamos pronto. Te dejamos los datos del turno para que los tengas a mano.'
    when event_label ilike '%confirmado%' then 'Tu reserva ya tiene profesional asignado. Guardá este detalle para llegar con tranquilidad.'
    when event_label ilike '%pendiente%' then 'Hay una solicitud esperando asignación de profesional. Revisala desde la agenda para confirmar el turno.'
    when event_label ilike '%asignado%' then 'Se agregó un nuevo turno a tu agenda laboral. Revisá los datos antes de la atención.'
    when event_label ilike '%canceló%' then 'Te avisamos que este turno fue cancelado y ya no figura como atención pendiente.'
    else 'Te compartimos el detalle actualizado del turno.'
  end;

  badge_label := case
    when event_label ilike '%recordatorio%' then 'Recordatorio'
    when event_label ilike '%confirmado%' then 'Confirmación'
    when event_label ilike '%pendiente%' then 'Acción requerida'
    when event_label ilike '%asignado%' then 'Agenda'
    when event_label ilike '%canceló%' then 'Cancelación'
    else 'Quiero Turno App'
  end;

  return '<div style="margin:0;padding:0;background:#eef7f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937">'
    || '<div style="display:none;max-height:0;overflow:hidden;color:#eef7f8">' || public.html_escape(company_name || ' - ' || event_intro) || '</div>'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#eef7f8;padding:0;margin:0"><tr><td align="center" style="padding:28px 12px">'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:620px;background:#ffffff;border:1px solid #d6e7ea;border-radius:16px;overflow:hidden;box-shadow:0 14px 34px rgba(15,23,42,0.10)">'
    || '<tr><td background="' || public.html_escape(coalesce(header_background_url, '')) || '" style="' || header_style || '">'
    || '<div style="font-size:12px;line-height:1;text-transform:uppercase;letter-spacing:.08em;color:#8de1e8;font-weight:700">Quiero Turno App</div>'
    || '<div style="margin-top:10px;color:#ffffff;font-size:21px;line-height:1.2;font-weight:900">' || public.html_escape(company_name) || '</div>'
    || '<div style="margin-top:12px;display:inline-block;border:1px solid rgba(141,225,232,.55);border-radius:999px;padding:6px 10px;color:#dffcff;background:rgba(36,174,187,.16);font-size:12px;font-weight:700">' || public.html_escape(badge_label) || '</div>'
    || '<h1 style="margin:14px 0 0;color:#ffffff;font-size:24px;line-height:1.22;font-weight:800">' || public.html_escape(event_label) || '</h1>'
    || '<p style="margin:10px 0 0;color:#d7e4e8;font-size:15px;line-height:1.55">' || public.html_escape(event_intro) || '</p>'
    || '</td></tr>'
    || '<tr><td style="padding:24px 26px 8px">'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;width:100%">'
    || '<tr><td style="width:42%;padding:12px 14px;background:#eefbfc;border:1px solid #b9e8ed;border-right:0;border-radius:10px 0 0 10px;color:#0f6d78;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Empresa</td><td style="padding:12px 14px;background:#eefbfc;border:1px solid #b9e8ed;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:800">' || public.html_escape(company_name) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Cliente</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(client_name) || '</td></tr>'
    || case when public.is_valid_email(booking_value.user_email) then '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Mail</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(booking_value.user_email) || '</td></tr>' else '' end
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Servicio</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(activity_name) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Profesional</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(coalesce(employee_name, 'Pendiente de asignación')) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Inicio</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(to_char(booking_value.start_at, 'DD/MM/YYYY HH24:MI')) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Fin</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(to_char(booking_value.end_at, 'DD/MM/YYYY HH24:MI')) || '</td></tr>'
    || '</table>'
    || case when clean_cta_label is not null and clean_cta_url is not null then
      '<div style="padding:10px 0 22px;text-align:center"><a href="' || public.html_escape(clean_cta_url) || '" style="display:inline-block;background:#24aebb;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 20px;font-size:15px;font-weight:800;box-shadow:0 8px 18px rgba(36,174,187,.22)">' || public.html_escape(clean_cta_label) || '</a></div>'
      else '' end
    || '</td></tr>'
    || '<tr><td style="padding:18px 26px;background:#f6fbfc;border-top:1px solid #e3edf0;color:#64748b;font-size:13px;line-height:1.5;text-align:center">Este es un mensaje automático de ' || public.html_escape(company_name) || ' enviado mediante Quiero Turno App. No respondas este mail.</td></tr>'
    || '</table>'
    || '</td></tr></table>'
    || '</div>';
end;
$$;

revoke execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text, text) from public;
revoke execute on function public.format_booking_notification_html(public.bookings, text, text, text) from public;
grant execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text, text) to anon, authenticated;

commit;