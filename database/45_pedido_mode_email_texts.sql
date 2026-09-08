-- ============================================================================
-- 45_pedido_mode_email_texts.sql
-- ============================================================================
-- Los mails de reserva (format_booking_group_notification_html /
-- send_booking_group_notifications) usan textos y branding pensados para
-- empresas en modo "turno" (Quiero Turno App, "Asignar turno", "Ir al Turno",
-- "Tu reserva fue registrada", etc.). Para empresas en modo "pedido" (como
-- Budines Macaré) esos textos no aplican: no hay "turnos" ni "Quiero Turno
-- App", hay "pedidos".
--
-- Este script agrega un helper is_pedido_mode(company_id) y actualiza los
-- mails consolidados de grupo de reserva para que, cuando la empresa esta en
-- modo_operacion = 'pedido':
--   * El admin reciba "Nuevo pedido" / asunto "Hay pedido nuevo realizado"
--     con boton "Ir al pedido" (en vez de "Hay turnos pendientes de asignar"
--     / "Asignar turno").
--   * El cliente reciba "Tu pedido ya fue generado" (en vez de "Tu reserva
--     fue registrada") con boton "Ir al pedido" (en vez de "Ir al Turno").
--   * Se quite el branding "Quiero Turno App" del kicker superior y del pie
--     de mail, dejando solo el nombre de la empresa.
--
-- Las empresas en modo_operacion = 'turno' NO cambian: siguen viendo los
-- textos originales de turnos y "Quiero Turno App".
--
-- Ejecutar una vez en el SQL Editor de Supabase, despues de
-- 44_fix_notify_booking_group_public_client.sql.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Helper: true si la empresa opera en modo "pedido" (no usa agenda/turnos).
-- ----------------------------------------------------------------------------
create or replace function public.is_pedido_mode(company_id_value uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select configurations.modo_operacion
    from public.app_configuration configurations
    where configurations.company_id = company_id_value
    limit 1
  ), 'turno') = 'pedido'
$$;

revoke execute on function public.is_pedido_mode(uuid) from public;
grant execute on function public.is_pedido_mode(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 1. Template consolidado: mismo layout, pero branding y copys segun el modo
--    de operacion de la empresa.
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
  pedido_mode boolean;
  kicker_html text;
  header_background_url text;
  header_style text;
  event_intro text;
  badge_label text;
  client_name text;
  client_email text;
  booking_ref text;
  group_date date;
  clean_cta_label text := nullif(trim(coalesce(cta_label, '')), '');
  clean_cta_url text := nullif(trim(coalesce(cta_url, '')), '');
  services_html text := '';
  svc record;
  svc_activity text;
  footer_text text;
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

  select min(bx.start_at)::date into group_date
  from public.bookings bx
  where bx.booking_group_id = group_id_value;

  booking_ref := public.format_booking_ref(group_id_value, group_date);

  company_name := public.get_company_mail_display_name(company_id_value);
  pedido_mode := public.is_pedido_mode(company_id_value);
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
    when pedido_mode and event_label ilike '%pedido realizado%' then 'Hay un nuevo pedido esperando revisión. Ingresá para gestionarlo.'
    when pedido_mode and event_label ilike '%pedido ya fue generado%' then 'Recibimos tu pedido. Te compartimos el detalle.'
    when pedido_mode and event_label ilike '%pedido fue modificado%' then 'Actualizamos los datos de tu pedido. Guardá este detalle para tenerlo a mano.'
    when pedido_mode and event_label ilike '%pedido fue confirmado%' then 'Tu pedido ya está confirmado. Te compartimos el detalle.'
    when event_label ilike '%reprogram%' then 'Actualizamos los datos de tu turno. Guardá este detalle para tenerlo a mano.'
    when event_label ilike '%confirmad%' then 'Tu reserva ya tiene profesional asignado. Guardá este detalle para llegar con tranquilidad.'
    when event_label ilike '%pendiente%' then 'Hay solicitudes esperando asignación de profesional. Revisalas desde la agenda para confirmar los turnos.'
    when event_label ilike '%asignad%' then 'Se agregaron nuevos turnos a tu agenda laboral. Revisá los datos antes de la atención.'
    when event_label ilike '%registrad%' then 'Recibimos tu reserva. Te compartimos el detalle de los servicios.'
    else 'Te compartimos el detalle de la reserva.'
  end;

  badge_label := case
    when pedido_mode and event_label ilike '%pedido realizado%' then 'Pedido nuevo'
    when pedido_mode and event_label ilike '%pedido ya fue generado%' then 'Pedido'
    when pedido_mode and event_label ilike '%pedido fue modificado%' then 'Actualización'
    when pedido_mode and event_label ilike '%pedido fue confirmado%' then 'Confirmación'
    when event_label ilike '%reprogram%' then 'Reprogramación'
    when event_label ilike '%confirmad%' then 'Confirmación'
    when event_label ilike '%pendiente%' then 'Acción requerida'
    when event_label ilike '%asignad%' then 'Agenda'
    when event_label ilike '%registrad%' then 'Reserva'
    when pedido_mode then 'Pedidos'
    else 'Quiero Turno App'
  end;

  kicker_html := case
    when pedido_mode then ''
    else '<div style="font-size:12px;line-height:1;text-transform:uppercase;letter-spacing:.08em;color:#8de1e8;font-weight:700">Quiero Turno App</div>'
  end;

  footer_text := case
    when pedido_mode then 'Este es un mensaje automático de ' || public.html_escape(company_name) || '. No respondas este mail.'
    else 'Este es un mensaje automático de ' || public.html_escape(company_name) || ' enviado mediante Quiero Turno App. No respondas este mail.'
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
    || kicker_html
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
    || '<tr><td style="padding:18px 26px;background:#f6fbfc;border-top:1px solid #e3edf0;color:#64748b;font-size:13px;line-height:1.5;text-align:center">' || footer_text || '</td></tr>'
    || '</table>'
    || '</td></tr></table>'
    || '</body></html>';
end;
$$;

revoke execute on function public.format_booking_group_notification_html(uuid, text, text, text, uuid, boolean) from public;

-- ----------------------------------------------------------------------------
-- 2. Notificador consolidado por grupo de reserva: labels/CTA/asuntos segun
--    modo_operacion de la empresa del grupo.
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
  pedido_mode boolean;
  employee_agenda_url text;
  admin_assignment_url text;
  client_booking_url text;
  client_label text;
  client_cta_label text;
  client_html text;
  client_text text;
  admin_label text;
  admin_subject text;
  admin_cta_label text;
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

  pedido_mode := public.is_pedido_mode(grp_company);

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
      client_label := case when pedido_mode then 'Tu pedido fue modificado.' else 'Tu turno fue reprogramado.' end;
    elsif pedido_mode then
      client_label := 'Tu pedido ya fue generado.';
    elsif has_pending then
      client_label := 'Tu reserva fue registrada.';
    else
      client_label := 'Tu turno fue confirmado.';
    end if;
    client_cta_label := case when pedido_mode then 'Ir al pedido' else 'Ir al Turno' end;
    client_html := public.format_booking_group_notification_html(group_id_value, client_label, client_cta_label, client_booking_url);
    client_text := client_label || E'\n\n' || client_cta_label || ': ' || client_booking_url;
    perform public.send_resend_email(grp_email, client_label, client_text, 'Quiero Turno App - No responder', null, client_html, grp_company);
  end if;

  -- ---- Admin: un solo mail con los servicios pendientes de asignar ----
  if has_pending then
    if pedido_mode then
      admin_label := 'Nuevo pedido realizado.';
      admin_subject := 'Hay pedido nuevo realizado';
      admin_cta_label := 'Ir al pedido';
    else
      admin_label := 'Hay turnos pendientes de asignar.';
      admin_subject := 'Hay turnos pendientes de asignar';
      admin_cta_label := 'Asignar turno';
    end if;
    admin_html := public.format_booking_group_notification_html(group_id_value, admin_label, admin_cta_label, admin_assignment_url, null, true);
    admin_text := admin_label || E'\n\n' || admin_cta_label || ': ' || admin_assignment_url;
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
      perform public.send_resend_email(admin_email, admin_subject, admin_text, 'Quiero Turno App - No responder', grp_email, admin_html, grp_company);
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

commit;
