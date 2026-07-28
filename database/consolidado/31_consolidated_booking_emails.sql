-- ============================================================================
-- 31_consolidated_booking_emails.sql
-- ============================================================================
-- Un solo mail por evento de reserva (con TODOS los servicios) en vez de uno
-- por servicio, y un unico REF (booking_group_id) por reserva.
--
--   * CLIENTE: un mail con todos los servicios de la reserva.
--   * ADMIN: un mail de "pendientes de asignar" (link a la agenda de admin),
--     listando solo los servicios sin profesional.
--   * EMPLEADO: un mail por empleado, con SOLO sus servicios de la reserva.
--
-- Aplica a la reserva nueva (INSERT) y a la reprogramacion (que crea turnos
-- nuevos por el mismo camino del cliente). La cancelacion NO cambia.
--
-- Ademas: el mail de "Tu turno fue actualizado" (editar datos del cliente) ahora
-- muestra el REF, porque tiene el boton "Ir al Turno".
--
-- Idempotente. Ejecutar UNA vez en el SQL Editor de Supabase, despues de
-- 28_client_booking_waitlist.sql (y 27_admin_booking_client_link.sql).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Tabla de deduplicacion: garantiza que cada grupo notifique una sola vez.
-- ----------------------------------------------------------------------------
create table if not exists public.booking_group_email_log (
  group_id uuid primary key,
  notified_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 1. REF corto y legible a partir de un uuid.
-- ----------------------------------------------------------------------------
create or replace function public.format_booking_ref(id_value uuid)
returns text
language sql
immutable
as $$
  select case
    when id_value is null then ''
    else '#' || upper(substr(replace(id_value::text, '-', ''), 1, 8))
  end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Template de mail de UN turno (single) + fila "Referencia".
--    Reproduce la version de 04_turnos_empleados_rendiciones_050_065.sql
--    agregando el REF (booking_group_id o, si no hay grupo, el id del turno).
-- ----------------------------------------------------------------------------
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
  booking_ref text := public.format_booking_ref(coalesce(booking_value.booking_group_id, booking_value.id));
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
    when event_label ilike '%confirmado%' then 'Tu reserva ya tiene profesional asignado. Guarda este detalle para llegar con tranquilidad.'
    when event_label ilike '%pendiente%' then 'Hay una solicitud esperando asignación de profesional. Revisala desde la agenda para confirmar el turno.'
    when event_label ilike '%asignado%' then 'Se agregó un nuevo turno a tu agenda laboral. Revisa los datos antes de la atención.'
    when event_label ilike '%cancelado%' then 'Te avisamos que este turno fue cancelado y ya no figura como atención pendiente.'
    when event_label ilike '%actualizado%' then 'Actualizamos los datos de tu turno. Guardá este detalle para tenerlo a mano.'
    else 'Te compartimos el detalle actualizado del turno.'
  end;

  badge_label := case
    when event_label ilike '%recordatorio%' then 'Recordatorio'
    when event_label ilike '%confirmado%' then 'Confirmación'
    when event_label ilike '%pendiente%' then 'Acción requerida'
    when event_label ilike '%asignado%' then 'Agenda'
    when event_label ilike '%cancelado%' then 'Cancelación'
    when event_label ilike '%actualizado%' then 'Actualización'
    else 'Quiero Turno App'
  end;

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;background:#eef7f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937">'
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
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Referencia</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:800">' || public.html_escape(booking_ref) || '</td></tr>'
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
    || '</body></html>';
end;
$$;

revoke execute on function public.format_booking_notification_html(public.bookings, text, text, text) from public;

-- ----------------------------------------------------------------------------
-- 3. Template consolidado: lista TODOS los servicios del grupo. Un unico REF.
--    Filtros opcionales: por empleado (mail de empleado) y solo pendientes
--    (mail de admin).
-- ----------------------------------------------------------------------------
create or replace function public.format_booking_group_notification_html(
  group_id_value uuid,
  event_label text,
  cta_label text default null,
  cta_url text default null,
  employee_id_filter uuid default null,
  pending_only boolean default false
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  company_id_value uuid;
  company_name text;
  header_background_url text;
  header_style text;
  event_intro text;
  badge_label text;
  client_name text;
  client_email text;
  booking_ref text := public.format_booking_ref(group_id_value);
  clean_cta_label text := nullif(trim(coalesce(cta_label, '')), '');
  clean_cta_url text := nullif(trim(coalesce(cta_url, '')), '');
  services_html text := '';
  svc record;
  svc_activity text;
begin
  select b.company_id,
         (select bx.customer_name from public.bookings bx where bx.booking_group_id = group_id_value and nullif(trim(coalesce(bx.customer_name, '')), '') is not null limit 1),
         (select bx.user_email from public.bookings bx where bx.booking_group_id = group_id_value and bx.user_email is not null limit 1)
  into company_id_value, client_name, client_email
  from public.bookings b
  where b.booking_group_id = group_id_value
  limit 1;

  if company_id_value is null then
    return '';
  end if;

  company_name := public.get_company_mail_display_name(company_id_value);
  client_name := coalesce(nullif(trim(coalesce(client_name, '')), ''), nullif(client_email, ''), 'Cliente sin datos');

  select nullif(trim(configurations.welcome_background_public_url), '')
  into header_background_url
  from public.app_configuration configurations
  where configurations.company_id = company_id_value
    and configurations.welcome_background_public_url like 'https://%'
  limit 1;

  header_style := 'padding:24px 26px;background:#26313a;color:#ffffff';
  if header_background_url is not null then
    header_style := 'padding:24px 26px;color:#ffffff;background-color:#26313a;background-image:linear-gradient(rgba(23,31,39,.78),rgba(23,31,39,.82)),url(''' || replace(header_background_url, '''', '%27') || ''');background-size:cover;background-position:center;background-repeat:no-repeat';
  end if;

  event_intro := case
    when event_label ilike '%reprogram%' then 'Actualizamos los datos de tu turno. Guardá este detalle para tenerlo a mano.'
    when event_label ilike '%confirmad%' then 'Tu reserva ya tiene profesional asignado. Guardá este detalle para llegar con tranquilidad.'
    when event_label ilike '%pendiente%' then 'Hay solicitudes esperando asignación de profesional. Revisalas desde la agenda para confirmar los turnos.'
    when event_label ilike '%asignad%' then 'Se agregaron nuevos turnos a tu agenda laboral. Revisá los datos antes de la atención.'
    when event_label ilike '%registrad%' then 'Recibimos tu reserva. Te compartimos el detalle de los servicios.'
    else 'Te compartimos el detalle de la reserva.'
  end;

  badge_label := case
    when event_label ilike '%reprogram%' then 'Reprogramación'
    when event_label ilike '%confirmad%' then 'Confirmación'
    when event_label ilike '%pendiente%' then 'Acción requerida'
    when event_label ilike '%asignad%' then 'Agenda'
    when event_label ilike '%registrad%' then 'Reserva'
    else 'Quiero Turno App'
  end;

  for svc in
    select bk.service, bk.booking_description, bk.start_at, bk.end_at, bk.employee_id,
           svs.name as service_name,
           coalesce(nullif(trim(concat_ws(' ', emp.first_name, emp.last_name)), ''), emp.name) as employee_name
    from public.bookings bk
    left join public.services svs on svs.id = bk.service and svs.company_id = bk.company_id
    left join public.employees emp on emp.id = bk.employee_id and emp.company_id = bk.company_id
    where bk.booking_group_id = group_id_value
      and (employee_id_filter is null or bk.employee_id = employee_id_filter)
      and (pending_only is not true or bk.employee_id is null)
    order by bk.start_at
  loop
    svc_activity := coalesce(nullif(trim(coalesce(svc.booking_description, '')), ''), svc.service_name, 'Turno');
    services_html := services_html
      || '<tr><td colspan="2" style="padding:14px 16px;background:#f8fafc;border:1px solid #e3edf0;border-radius:12px">'
      || '<div style="font-size:15px;font-weight:800;color:#0f172a">' || public.html_escape(svc_activity) || '</div>'
      || '<div style="margin-top:6px;font-size:13px;color:#475569">Horario: ' || public.html_escape(to_char(svc.start_at, 'DD/MM/YYYY HH24:MI')) || ' - ' || public.html_escape(to_char(svc.end_at, 'HH24:MI')) || '</div>'
      || '<div style="margin-top:2px;font-size:13px;color:#475569">Profesional: ' || public.html_escape(coalesce(svc.employee_name, 'Pendiente de asignación')) || '</div>'
      || '</td></tr>';
  end loop;

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;background:#eef7f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937">'
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
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Referencia</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:800">' || public.html_escape(booking_ref) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Cliente</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(client_name) || '</td></tr>'
    || case when public.is_valid_email(client_email) then '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Mail</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(client_email) || '</td></tr>' else '' end
    || '<tr><td colspan="2" style="padding:8px 2px 0;color:#0f6d78;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Servicios</td></tr>'
    || services_html
    || '</table>'
    || case when clean_cta_label is not null and clean_cta_url is not null then
      '<div style="padding:10px 0 22px;text-align:center"><a href="' || public.html_escape(clean_cta_url) || '" style="display:inline-block;background:#24aebb;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 20px;font-size:15px;font-weight:800;box-shadow:0 8px 18px rgba(36,174,187,.22)">' || public.html_escape(clean_cta_label) || '</a></div>'
      else '' end
    || '</td></tr>'
    || '<tr><td style="padding:18px 26px;background:#f6fbfc;border-top:1px solid #e3edf0;color:#64748b;font-size:13px;line-height:1.5;text-align:center">Este es un mensaje automático de ' || public.html_escape(company_name) || ' enviado mediante Quiero Turno App. No respondas este mail.</td></tr>'
    || '</table>'
    || '</td></tr></table>'
    || '</body></html>';
end;
$$;

revoke execute on function public.format_booking_group_notification_html(uuid, text, text, text, uuid, boolean) from public;

-- ----------------------------------------------------------------------------
-- 4. Notificador consolidado por grupo de reserva.
--    Envia: 1 mail al cliente (todos los servicios), 1 mail a admin si hay
--    pendientes de asignar, y 1 mail por empleado (solo sus servicios).
--    Deduplica por booking_group_email_log => se envia una sola vez por grupo.
-- ----------------------------------------------------------------------------
create or replace function public.send_booking_group_notifications(
  group_id_value uuid,
  event_kind text default 'new'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  grp_company uuid;
  grp_email text;
  has_pending boolean;
  employee_agenda_url text;
  admin_assignment_url text;
  client_booking_url text;
  client_label text;
  client_html text;
  client_text text;
  admin_html text;
  admin_text text;
  admin_email text;
  emp record;
  emp_email text;
  emp_html text;
  emp_text text;
begin
  if group_id_value is null then
    return;
  end if;

  -- Deduplicacion: solo la primera vez para este grupo.
  insert into public.booking_group_email_log(group_id) values (group_id_value) on conflict do nothing;
  if not found then
    return;
  end if;

  select b.company_id,
         (select bx.user_email from public.bookings bx where bx.booking_group_id = group_id_value and bx.user_email is not null limit 1)
  into grp_company, grp_email
  from public.bookings b
  where b.booking_group_id = group_id_value
  limit 1;

  if grp_company is null then
    return;
  end if;

  select exists (
    select 1 from public.bookings b
    where b.booking_group_id = group_id_value
      and b.employee_id is null
      and b.status in ('pending_assignment', 'waitlist')
  ) into has_pending;

  employee_agenda_url := public.build_mail_app_link(grp_company, 'employee-agenda');
  admin_assignment_url := public.build_mail_app_link(grp_company, 'admin-agenda');
  client_booking_url := public.build_client_booking_link(grp_company);

  -- ---- Cliente: un solo mail con todos los servicios ----
  if public.is_valid_email(grp_email) then
    if event_kind = 'reschedule' then
      client_label := 'Tu turno fue reprogramado.';
    elsif has_pending then
      client_label := 'Tu reserva fue registrada.';
    else
      client_label := 'Tu turno fue confirmado.';
    end if;
    client_html := public.format_booking_group_notification_html(group_id_value, client_label, 'Ir al Turno', client_booking_url);
    client_text := client_label || E'\n\nIr al Turno: ' || client_booking_url;
    perform public.send_resend_email(grp_email, client_label, client_text, 'Quiero Turno App - No responder', null, client_html, grp_company);
  end if;

  -- ---- Admin: un solo mail con los servicios pendientes de asignar ----
  if has_pending then
    admin_html := public.format_booking_group_notification_html(group_id_value, 'Hay turnos pendientes de asignar.', 'Asignar turno', admin_assignment_url, null, true);
    admin_text := 'Hay turnos pendientes de asignar.' || E'\n\nAsignar turno: ' || admin_assignment_url;
    for admin_email in
      select distinct lower(trim(employees.email))
      from public.employees employees
      join public.internal_accounts accounts
        on accounts.employee_id = employees.id
        and accounts.role = 'admin'::public.app_role
        and accounts.active = true
        and accounts.company_id = grp_company
      where employees.company_id = grp_company
        and employees.active is not false
        and employees.deleted_at is null
        and public.is_valid_email(employees.email)
    loop
      perform public.send_resend_email(admin_email, 'Hay turnos pendientes de asignar', admin_text, 'Quiero Turno App - No responder', grp_email, admin_html, grp_company);
    end loop;
  end if;

  -- ---- Empleados: un mail por empleado, solo con sus servicios ----
  for emp in
    select distinct b.employee_id
    from public.bookings b
    where b.booking_group_id = group_id_value
      and b.employee_id is not null
      and b.status in ('reserved', 'confirmed', 'pending_assignment')
  loop
    select employees.email into emp_email
    from public.employees employees
    where employees.id = emp.employee_id
      and employees.company_id = grp_company;

    if public.is_valid_email(emp_email) then
      emp_html := public.format_booking_group_notification_html(group_id_value, 'Tenés nuevos turnos asignados.', 'Ir a Agenda', employee_agenda_url, emp.employee_id, false);
      emp_text := 'Tenés nuevos turnos asignados.' || E'\n\nIr a Agenda: ' || employee_agenda_url;
      perform public.send_resend_email(emp_email, 'Tenés nuevos turnos asignados', emp_text, 'Quiero Turno App - No responder', grp_email, emp_html, grp_company);
    end if;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Trigger por fila: NO enviar mail en INSERT cuando el turno pertenece a un
--    grupo (booking_group_id no nulo). Esos los envia el notificador consolidado.
--    Las ramas de UPDATE (asignacion, cancelacion) se mantienen igual.
-- ----------------------------------------------------------------------------
create or replace function public.send_booking_email_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_email text;
  client_message text;
  admin_message text;
  employee_message text;
  client_html text;
  admin_html text;
  employee_html text;
  employee_agenda_url text := public.build_mail_app_link(NEW.company_id, 'employee-agenda');
  admin_assignment_url text := public.build_mail_app_link(NEW.company_id, 'admin-agenda');
  client_booking_url text := public.build_client_booking_link(NEW.company_id);
begin
  if TG_OP = 'INSERT' and NEW.booking_group_id is null and NEW.status in ('reserved', 'confirmed', 'pending_assignment') then
    if NEW.status = 'pending_assignment' or NEW.employee_id is null then
      admin_message := public.format_booking_notification_message(NEW, 'Hay un turno pendiente para asignar.') || E'\n\nAsignar turno: ' || admin_assignment_url;
      admin_html := public.format_booking_notification_html(NEW, 'Hay un turno pendiente para asignar.', 'Asignar turno', admin_assignment_url);

      for employee_email in
        select distinct lower(trim(employees.email))
        from public.employees employees
        join public.internal_accounts accounts
          on accounts.employee_id = employees.id
          and accounts.role = 'admin'::public.app_role
          and accounts.active = true
          and accounts.company_id = NEW.company_id
        where employees.company_id = NEW.company_id
          and employees.active is not false
          and employees.deleted_at is null
          and public.is_valid_email(employees.email)
      loop
        perform public.send_resend_email(employee_email, 'Hay un turno pendiente para asignar', admin_message, 'Quiero Turno App - No responder', NEW.user_email, admin_html, NEW.company_id);
      end loop;
    end if;

    if NEW.employee_id is not null then
      if public.is_valid_email(NEW.user_email) then
        client_message := public.format_booking_notification_message(NEW, 'Tu turno fue confirmado.') || E'\n\nIr al Turno: ' || client_booking_url;
        client_html := public.format_booking_notification_html(NEW, 'Tu turno fue confirmado.', 'Ir al Turno', client_booking_url);
        perform public.send_resend_email(NEW.user_email, 'Tu turno fue confirmado', client_message, 'Quiero Turno App - No responder', null, client_html, NEW.company_id);
      end if;

      select employees.email into employee_email
      from public.employees employees
      where employees.id = NEW.employee_id
        and employees.company_id = NEW.company_id;

      employee_message := public.format_booking_notification_message(NEW, 'Tenés un nuevo turno asignado.') || E'\n\nIr a Agenda: ' || employee_agenda_url;
      employee_html := public.format_booking_notification_html(NEW, 'Tenés un nuevo turno asignado.', 'Ir a Agenda', employee_agenda_url);
      perform public.send_resend_email(employee_email, 'Tenés un nuevo turno asignado', employee_message, 'Quiero Turno App - No responder', NEW.user_email, employee_html, NEW.company_id);
    end if;
  end if;

  if TG_OP = 'UPDATE'
    and NEW.status in ('reserved', 'confirmed')
    and NEW.employee_id is not null
    and (OLD.employee_id is distinct from NEW.employee_id or OLD.status = 'pending_assignment') then
    if public.is_valid_email(NEW.user_email) then
      client_message := public.format_booking_notification_message(NEW, 'Tu turno fue confirmado.') || E'\n\nIr al Turno: ' || client_booking_url;
      client_html := public.format_booking_notification_html(NEW, 'Tu turno fue confirmado.', 'Ir al Turno', client_booking_url);
      perform public.send_resend_email(NEW.user_email, 'Tu turno fue confirmado', client_message, 'Quiero Turno App - No responder', null, client_html, NEW.company_id);
    end if;

    select employees.email into employee_email
    from public.employees employees
    where employees.id = NEW.employee_id
      and employees.company_id = NEW.company_id;

    employee_message := public.format_booking_notification_message(NEW, 'Tenés un nuevo turno asignado.') || E'\n\nIr a Agenda: ' || employee_agenda_url;
    employee_html := public.format_booking_notification_html(NEW, 'Tenés un nuevo turno asignado.', 'Ir a Agenda', employee_agenda_url);
    perform public.send_resend_email(employee_email, 'Tenés un nuevo turno asignado', employee_message, 'Quiero Turno App - No responder', NEW.user_email, employee_html, NEW.company_id);
  end if;

  if TG_OP = 'UPDATE'
    and NEW.status = 'cancelled'
    and OLD.status is distinct from NEW.status
    and NEW.employee_id is not null then
    select employees.email into employee_email
    from public.employees employees
    where employees.id = NEW.employee_id
      and employees.company_id = NEW.company_id;

    employee_message := public.format_booking_notification_message(NEW, 'Se canceló este turno.') || E'\n\nIr a Agenda: ' || employee_agenda_url;
    employee_html := public.format_booking_notification_html(NEW, 'Se canceló este turno.', 'Ir a Agenda', employee_agenda_url);
    perform public.send_resend_email(employee_email, 'Se canceló un turno', employee_message, 'Quiero Turno App - No responder', NEW.user_email, employee_html, NEW.company_id);
  end if;

  return NEW;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. request_client_booking: aceptar booking_group_id_value para agrupar los
--    servicios de una misma reserva del cliente.
-- ----------------------------------------------------------------------------
drop function if exists public.request_client_booking(bigint, uuid, text, timestamp without time zone, timestamp without time zone, text, text, text, uuid, text);

create or replace function public.request_client_booking(
  service_id_value bigint default null,
  employee_id_value uuid default null,
  booking_description_value text default null,
  start_at_value timestamp without time zone default null,
  end_at_value timestamp without time zone default null,
  customer_name_value text default null,
  customer_email_value text default null,
  company_slug_value text default null,
  account_id_value uuid default null,
  session_token_value text default null,
  booking_group_id_value uuid default null
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
  clean_customer_name text := nullif(trim(coalesce(customer_name_value, '')), '');
  selected_promotion jsonb;
  current_business_time timestamp without time zone := timezone('America/Argentina/Buenos_Aires', now());
  client_account public.internal_accounts%rowtype;
  resolved_auth_user_id uuid := auth.uid();
  resolved_client_account_id uuid := null;
begin
  if target_company_id is null then
    raise exception 'La empresa no esta disponible.';
  end if;

  if resolved_auth_user_id is null then
    if account_id_value is null or nullif(trim(coalesce(session_token_value, '')), '') is null then
      raise exception 'Inicia sesion para solicitar un turno.';
    end if;

    client_account := public.validate_internal_session(account_id_value, session_token_value, 'client'::public.app_role);

    if client_account.company_id is distinct from target_company_id then
      raise exception 'La empresa no esta disponible.';
    end if;

    resolved_client_account_id := client_account.id;
    clean_customer_email := coalesce(clean_customer_email, nullif(trim(coalesce(client_account.email, '')), ''));
    clean_customer_name := coalesce(clean_customer_name, nullif(trim(coalesce(client_account.display_name, '')), ''));
  end if;

  if start_at_value is null or end_at_value is null or end_at_value <= start_at_value then
    raise exception 'El horario seleccionado no es valido.';
  end if;

  if start_at_value < current_business_time then
    raise exception 'No se pueden solicitar turnos en horarios pasados.';
  end if;

  if service_id_value is null and clean_booking_description is null then
    raise exception 'Selecciona un servicio o promocion.';
  end if;

  if service_id_value is not null and not exists (
    select 1
    from public.services services
    where services.id = service_id_value
      and services.company_id = target_company_id
      and services.active is not false
  ) then
    raise exception 'El servicio seleccionado no esta disponible.';
  end if;

  if service_id_value is null then
    select promotion
    into selected_promotion
    from public.app_configuration configuration,
      jsonb_array_elements(coalesce(configuration.promotions, '[]'::jsonb)) with ordinality promotion_item(promotion, position)
    where configuration.company_id = target_company_id
      and coalesce((promotion->>'enabled')::boolean, false) is true
      and (
        nullif(trim(concat_ws(
          ' · ',
          nullif(trim(coalesce(promotion->>'title', '')), ''),
          nullif(trim(coalesce(promotion->>'description', '')), ''),
          nullif(trim(coalesce(promotion->>'value', '')), '')
        )), '') = clean_booking_description
        or format('Banner %s', position) = clean_booking_description
      )
    limit 1;

    if selected_promotion is null then
      raise exception 'La promocion seleccionada no esta disponible.';
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
        (resolved_auth_user_id is not null and bookings.user_id = resolved_auth_user_id)
        or (resolved_client_account_id is not null and bookings.client_account_id = resolved_client_account_id)
        or (
          clean_customer_email is not null
          and lower(coalesce(bookings.user_email, '')) = lower(clean_customer_email)
        )
      )
    limit 1
  ) then
    raise exception 'Ya tenes un turno o solicitud en ese horario.';
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
      next_status := 'waitlist';
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
      next_status := 'waitlist';
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
      raise exception 'El empleado seleccionado no esta disponible.';
    end if;

    if service_id_value is not null and not exists (
      select 1
      from public.employee_services relations
      where relations.company_id = target_company_id
        and relations.employee_id = employee_id_value
        and relations.service_id = service_id_value
    ) then
      raise exception 'El empleado no esta vinculado a ese servicio.';
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
    client_account_id,
    user_email,
    customer_name,
    service,
    employee_id,
    booking_description,
    start_at,
    end_at,
    status,
    booking_group_id
  ) values (
    target_company_id,
    resolved_auth_user_id,
    resolved_client_account_id,
    clean_customer_email,
    clean_customer_name,
    service_id_value,
    employee_id_value,
    clean_booking_description,
    start_at_value,
    end_at_value,
    next_status,
    booking_group_id_value
  )
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

revoke execute on function public.request_client_booking(bigint, uuid, text, timestamp without time zone, timestamp without time zone, text, text, text, uuid, text, uuid) from public;
grant execute on function public.request_client_booking(bigint, uuid, text, timestamp without time zone, timestamp without time zone, text, text, text, uuid, text, uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. create_admin_booking_group: enviar el mail consolidado UNA vez, al final.
--    (Los inserts del grupo ya no disparan mail por fila: ver punto 5.)
-- ----------------------------------------------------------------------------
create or replace function public.create_admin_booking_group(
  items_value jsonb,
  customer_name_value text default null,
  customer_email_value text default null,
  booking_description_value text default null,
  branch_id_value uuid default null,
  account_id_value uuid default null,
  session_token_value text default null,
  company_slug_value text default null,
  client_account_id_value uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  caller_account public.internal_accounts%rowtype;
  group_id uuid := gen_random_uuid();
  clean_customer_name text := nullif(trim(coalesce(customer_name_value, '')), '');
  clean_customer_email text := nullif(trim(coalesce(customer_email_value, '')), '');
  clean_description text := nullif(trim(coalesce(booking_description_value, '')), '');
  current_business_time timestamp without time zone := timezone('America/Argentina/Buenos_Aires', now());
  item jsonb;
  item_service_id bigint;
  item_employee_id uuid;
  item_start timestamp without time zone;
  item_end timestamp without time zone;
  item_price numeric(12, 2);
  item_bundle_id uuid;
  item_bundle_type text;
  item_status text;
  saved_booking public.bookings%rowtype;
  saved_bookings jsonb := '[]'::jsonb;
  item_count integer := 0;
begin
  -- ---- Autorizacion (admin o empleado) ----
  if public.is_admin() then
    target_company_id := public.get_company_id_by_slug(company_slug_value);
    if target_company_id is null then raise exception 'La empresa no esta disponible.'; end if;
    if not exists (
      select 1 from public.profiles profiles
      where profiles.user_id = auth.uid()
        and profiles.role = 'admin'::public.app_role
        and profiles.active is not false
        and profiles.company_id = target_company_id
    ) then
      raise exception 'No podes administrar otra empresa.';
    end if;
  else
    begin
      caller_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    exception when others then
      caller_account := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
    end;
    target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), caller_account.company_id);
    if target_company_id is null or caller_account.company_id is distinct from target_company_id then
      raise exception 'No podes crear turnos para otra empresa.';
    end if;
  end if;

  if items_value is null or jsonb_typeof(items_value) <> 'array' or jsonb_array_length(items_value) = 0 then
    raise exception 'Seleccciona al menos un servicio.';
  end if;

  -- Validar sucursal (si se envio) pertenece a la empresa.
  if branch_id_value is not null and not exists (
    select 1 from public.branches branches
    where branches.id = branch_id_value and branches.company_id = target_company_id
  ) then
    raise exception 'La sucursal no pertenece a la empresa.';
  end if;

  -- Validar que el cliente seleccionado (si se envio) pertenezca a la empresa.
  if client_account_id_value is not null and not exists (
    select 1 from public.internal_accounts a
    where a.id = client_account_id_value
      and a.company_id = target_company_id
      and a.role = 'client'::public.app_role
  ) then
    raise exception 'El cliente seleccionado no pertenece a la empresa.';
  end if;

  -- ---- Recorrer items ----
  for item in select * from jsonb_array_elements(items_value)
  loop
    item_count := item_count + 1;
    item_service_id := nullif(item->>'service_id', '')::bigint;
    item_employee_id := nullif(item->>'employee_id', '')::uuid;
    item_start := nullif(item->>'start_at', '')::timestamp without time zone;
    item_end := nullif(item->>'end_at', '')::timestamp without time zone;
    item_price := nullif(item->>'item_price', '')::numeric(12, 2);
    item_bundle_id := nullif(item->>'bundle_id', '')::uuid;
    item_bundle_type := nullif(trim(coalesce(item->>'bundle_type', '')), '');

    if item_service_id is null then
      raise exception 'Cada servicio del turno debe indicar el servicio.';
    end if;

    if item_start is null or item_end is null or item_end <= item_start then
      raise exception 'El horario de uno de los servicios es invalido.';
    end if;

    if item_start < current_business_time then
      raise exception 'No se pueden crear turnos en horarios pasados.';
    end if;

    -- El servicio debe existir y estar activo en la empresa.
    if not exists (
      select 1 from public.services services
      where services.id = item_service_id
        and services.company_id = target_company_id
        and services.active is not false
    ) then
      raise exception 'Uno de los servicios no esta disponible.';
    end if;

    if item_employee_id is null then
      if exists (
        select 1
        from public.employees candidate
        join public.employee_services candidate_services
          on candidate_services.employee_id = candidate.id
          and candidate_services.company_id = target_company_id
        join public.employee_availability candidate_availability
          on candidate_availability.employee_id = candidate.id
          and candidate_availability.company_id = target_company_id
        where candidate.company_id = target_company_id
          and candidate.active = true
          and candidate.deleted_at is null
          and candidate_services.service_id = item_service_id
          and candidate_availability.active = true
          and candidate_availability.available_date = item_start::date
          and candidate_availability.start_time <= item_start::time
          and candidate_availability.end_time >= item_end::time
          and not exists (
            select 1 from public.bookings busy
            where busy.company_id = target_company_id
              and busy.employee_id = candidate.id
              and busy.status in ('reserved', 'confirmed', 'pending_assignment')
              and busy.start_at < item_end
              and busy.end_at > item_start
          )
      ) then
        item_status := 'pending_assignment';
      else
        item_status := 'waitlist';
      end if;
    else
      item_status := 'confirmed';

      if not exists (
        select 1 from public.employees employees
        where employees.id = item_employee_id
          and employees.company_id = target_company_id
          and employees.active = true
          and employees.deleted_at is null
      ) then
        raise exception 'El profesional de uno de los servicios no esta activo.';
      end if;

      if not exists (
        select 1
        from public.employee_services relations
        join public.services services on services.id = relations.service_id
        where relations.company_id = target_company_id
          and services.company_id = target_company_id
          and relations.employee_id = item_employee_id
          and relations.service_id = item_service_id
          and services.active is not false
      ) then
        raise exception 'El profesional no atiende uno de los servicios elegidos.';
      end if;

      if not exists (
        select 1 from public.employee_availability availability
        where availability.company_id = target_company_id
          and availability.employee_id = item_employee_id
          and availability.active = true
          and availability.available_date = item_start::date
          and availability.start_time <= item_start::time
          and availability.end_time >= item_end::time
      ) then
        raise exception 'El profesional no tiene disponibilidad para uno de los horarios.';
      end if;

      if exists (
        select 1 from public.bookings bookings
        where bookings.company_id = target_company_id
          and bookings.employee_id = item_employee_id
          and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
          and bookings.start_at < item_end
          and bookings.end_at > item_start
        limit 1
      ) then
        raise exception 'El profesional ya tiene un turno en uno de esos horarios.';
      end if;
    end if;

    -- Conflicto del cliente (por email) sobre cada tramo.
    if clean_customer_email is not null and exists (
      select 1 from public.bookings bookings
      where bookings.company_id = target_company_id
        and lower(coalesce(bookings.user_email, '')) = lower(clean_customer_email)
        and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
        and bookings.start_at < item_end
        and bookings.end_at > item_start
      limit 1
    ) then
      raise exception 'Ese cliente ya tiene un turno en uno de esos horarios.';
    end if;

    insert into public.bookings (
      company_id, branch_id, user_id, user_email, customer_name, service, employee_id,
      booking_description, start_at, end_at, status,
      booking_group_id, bundle_id, bundle_type, item_price, client_account_id
    ) values (
      target_company_id, branch_id_value, null, clean_customer_email, clean_customer_name,
      item_service_id, item_employee_id, clean_description, item_start, item_end, item_status,
      group_id, item_bundle_id, item_bundle_type, item_price, client_account_id_value
    )
    returning * into saved_booking;

    saved_bookings := saved_bookings || to_jsonb(saved_booking);
  end loop;

  -- Un solo mail por evento de reserva, con todos los servicios.
  perform public.send_booking_group_notifications(group_id, 'new');

  return jsonb_build_object(
    'booking_group_id', group_id,
    'count', item_count,
    'bookings', saved_bookings
  );
end;
$$;

revoke execute on function public.create_admin_booking_group(jsonb, text, text, text, uuid, uuid, text, text, uuid) from public;
grant execute on function public.create_admin_booking_group(jsonb, text, text, text, uuid, uuid, text, text, uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8. notify_booking_group: el frontend del cliente la llama UNA vez despues de
--    crear todos los turnos del grupo, para enviar el mail consolidado.
-- ----------------------------------------------------------------------------
create or replace function public.notify_booking_group(
  group_id_value uuid,
  company_slug_value text default null,
  account_id_value uuid default null,
  session_token_value text default null,
  event_kind text default 'new'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  grp_company uuid;
  acc public.internal_accounts%rowtype;
begin
  if group_id_value is null then
    return;
  end if;

  select company_id into grp_company
  from public.bookings
  where booking_group_id = group_id_value
  limit 1;

  if grp_company is null then
    return;
  end if;

  if auth.uid() is not null then
    if not exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.company_id = grp_company
        and p.active is not false
    ) then
      raise exception 'No autorizado.';
    end if;
  else
    begin
      acc := public.validate_internal_session(account_id_value, session_token_value, null);
    exception when others then
      raise exception 'No autorizado.';
    end;
    if acc.company_id is distinct from grp_company then
      raise exception 'No autorizado.';
    end if;
  end if;

  perform public.send_booking_group_notifications(group_id_value, coalesce(nullif(event_kind, ''), 'new'));
end;
$$;

revoke execute on function public.notify_booking_group(uuid, text, uuid, text, text) from public;
grant execute on function public.notify_booking_group(uuid, text, uuid, text, text) to anon, authenticated;

commit;
