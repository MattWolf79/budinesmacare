-- Brand booking notification emails by tenant so shared inboxes can distinguish companies.
-- Run after 052_employee_pending_and_internal_past_guard.sql.

begin;

create or replace function public.get_company_mail_display_name(company_id_value uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim((
      select configurations.company_name
      from public.app_configuration configurations
      where configurations.company_id = company_id_value
      limit 1
    )), ''),
    nullif(trim((
      select companies.name
      from public.companies companies
      where companies.id = company_id_value
      limit 1
    )), ''),
    nullif(trim((
      select companies.slug
      from public.companies companies
      where companies.id = company_id_value
      limit 1
    )), ''),
    'Quiero Turno App'
  )
$$;

create or replace function public.format_company_mail_subject(company_id_value uuid, subject_value text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when company_id_value is null then coalesce(subject_value, '')
    when coalesce(subject_value, '') ilike '[' || public.get_company_mail_display_name(company_id_value) || ']%' then coalesce(subject_value, '')
    else '[' || public.get_company_mail_display_name(company_id_value) || '] ' || coalesce(subject_value, '')
  end
$$;

create or replace function public.format_company_mail_sender_name(company_id_value uuid, from_name_value text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when company_id_value is null then nullif(trim(coalesce(from_name_value, '')), '')
    when nullif(trim(coalesce(from_name_value, '')), '') is null then public.get_company_mail_display_name(company_id_value) || ' - No responder'
    when trim(from_name_value) ilike 'quiero turno app%' then public.get_company_mail_display_name(company_id_value) || ' - No responder'
    else trim(from_name_value)
  end
$$;

create or replace function public.format_booking_notification_message(booking_value public.bookings, event_label text)
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

  return concat_ws(E'\n',
    event_label,
    'Empresa: ' || company_name,
    'Cliente: ' || coalesce(nullif(booking_value.customer_name, ''), nullif(booking_value.user_email, ''), 'Cliente sin datos'),
    case when public.is_valid_email(booking_value.user_email) then 'Mail cliente: ' || booking_value.user_email else null end,
    'Servicio: ' || coalesce(nullif(booking_value.booking_description, ''), service_name, 'Turno'),
    case when employee_name is not null then 'Profesional: ' || employee_name else 'Profesional: pendiente de asignación' end,
    'Inicio: ' || to_char(booking_value.start_at, 'DD/MM/YYYY HH24:MI'),
    'Fin: ' || to_char(booking_value.end_at, 'DD/MM/YYYY HH24:MI')
  );
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
  header_background_data_url text;
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

  select nullif(trim(configurations.welcome_background_data_url), '')
  into header_background_data_url
  from public.app_configuration configurations
  where configurations.company_id = booking_value.company_id
    and configurations.welcome_background_data_url like 'data:image/%'
  limit 1;

  header_style := 'padding:24px 26px;background:#26313a;color:#ffffff';

  if header_background_data_url is not null then
    header_style := 'padding:24px 26px;color:#ffffff;background-color:#26313a;background-image:linear-gradient(rgba(23,31,39,.78),rgba(23,31,39,.82)),url(''' || replace(header_background_data_url, '''', '%27') || ''');background-size:cover;background-position:center;background-repeat:no-repeat';
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
    || '<tr><td style="' || header_style || '">'
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

create or replace function public.send_resend_email(
  to_email_value text,
  subject_value text,
  message_value text,
  from_name_value text,
  reply_to_value text,
  html_message_value text,
  company_id_value uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_to_email text := lower(trim(coalesce(to_email_value, '')));
  clean_reply_to text := lower(trim(coalesce(reply_to_value, '')));
  settings public.mail_settings%rowtype;
  sender_name text;
  effective_subject text;
begin
  if not public.is_valid_email(clean_to_email) then
    return;
  end if;

  settings := public.get_mail_settings(company_id_value);

  if settings.resend_api_key is null then
    return;
  end if;

  sender_name := public.format_company_mail_sender_name(company_id_value, from_name_value);
  if sender_name is null then
    sender_name := settings.from_name;
  end if;

  effective_subject := public.format_company_mail_subject(company_id_value, subject_value);

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || settings.resend_api_key
    ),
    body := jsonb_strip_nulls(jsonb_build_object(
      'from', sender_name || ' <' || settings.from_email || '>',
      'to', jsonb_build_array(clean_to_email),
      'subject', effective_subject,
      'text', message_value,
      'html', nullif(html_message_value, ''),
      'reply_to', case when public.is_valid_email(clean_reply_to) then clean_reply_to else settings.from_email end
    )),
    timeout_milliseconds := 5000
  );
end;
$$;

create or replace function public.build_mail_app_link(company_id_value uuid default null, hash_value text default '')
returns text
language sql
stable
security definer
set search_path = public
as $$
  with selected_company as (
    select companies.slug
    from public.companies companies
    where companies.id = company_id_value
    limit 1
  ), base_url as (
    select regexp_replace(public.get_mail_app_url(company_id_value), '/+$', '') as value
  ), normalized_hash as (
    select trim(coalesce(hash_value, '')) as value
  )
  select (select value from base_url) ||
    coalesce('/' || (select slug from selected_company), '') ||
    case
      when nullif((select value from normalized_hash), '') is null then ''
      when (select value from normalized_hash) in ('admin-agenda', 'employee-agenda') then '/admin#' || (select value from normalized_hash)
      when left((select value from normalized_hash), 1) = '#' then (select value from normalized_hash)
      else '#' || (select value from normalized_hash)
    end
$$;

revoke execute on function public.get_company_mail_display_name(uuid) from public;
revoke execute on function public.format_company_mail_subject(uuid, text) from public;
revoke execute on function public.format_company_mail_sender_name(uuid, text) from public;
revoke execute on function public.format_booking_notification_message(public.bookings, text) from public;
revoke execute on function public.format_booking_notification_html(public.bookings, text, text, text) from public;
revoke execute on function public.send_resend_email(text, text, text, text, text, text, uuid) from public;
revoke execute on function public.build_mail_app_link(uuid, text) from public;

commit;
