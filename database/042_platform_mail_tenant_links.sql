-- Tenant-aware mail settings and email links.
-- Run after 041_platform_admin.sql.

begin;

alter table if exists public.mail_settings
  drop constraint if exists mail_settings_singleton_chk;

alter table if exists public.mail_settings
  drop constraint if exists mail_settings_pkey;

alter table if exists public.mail_settings
  add column if not exists key_id boolean not null default true;

update public.mail_settings
set key_id = true
where key_id is null;

alter table if exists public.mail_settings
  drop constraint if exists mail_settings_company_id_key;

alter table if exists public.mail_settings
  add constraint mail_settings_company_id_key unique (company_id);

insert into public.mail_settings (
  key_id,
  company_id,
  resend_api_key,
  from_email,
  from_name,
  app_url,
  active
)
select
  true,
  companies.id,
  template.resend_api_key,
  coalesce(template.from_email, 'noresponder@quieroturnoapp.com.ar'),
  'Quiero Turno App - No responder',
  'https://quieroturnoapp.com.ar',
  coalesce(template.active, true)
from public.companies companies
left join lateral (
  select *
  from public.mail_settings settings
  where settings.company_id is not null
  order by settings.created_at
  limit 1
) template on true
where not exists (
  select 1
  from public.mail_settings existing
  where existing.company_id = companies.id
);

create or replace function public.ensure_company_mail_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  template public.mail_settings%rowtype;
begin
  select *
  into template
  from public.mail_settings settings
  where settings.company_id is distinct from NEW.id
  order by settings.created_at
  limit 1;

  insert into public.mail_settings (
    key_id,
    company_id,
    resend_api_key,
    from_email,
    from_name,
    app_url,
    active
  ) values (
    true,
    NEW.id,
    template.resend_api_key,
    coalesce(template.from_email, 'noresponder@quieroturnoapp.com.ar'),
    'Quiero Turno App - No responder',
    coalesce(nullif(trim(template.app_url), ''), 'https://quieroturnoapp.com.ar'),
    coalesce(template.active, true)
  )
  on conflict (company_id) do update set
    from_name = 'Quiero Turno App - No responder',
    app_url = coalesce(nullif(trim(public.mail_settings.app_url), ''), excluded.app_url),
    updated_at = now();

  return NEW;
end;
$$;

drop trigger if exists ensure_company_mail_settings_trigger on public.companies;

create trigger ensure_company_mail_settings_trigger
after insert on public.companies
for each row
execute function public.ensure_company_mail_settings();

create or replace function public.get_mail_settings(company_id_value uuid default null)
returns public.mail_settings
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  settings public.mail_settings%rowtype;
begin
  select *
  into settings
  from public.mail_settings
  where company_id is not distinct from company_id_value
    and active = true
    and nullif(trim(coalesce(resend_api_key, '')), '') is not null
  limit 1;

  if settings.company_id is null and company_id_value is not null then
    select *
    into settings
    from public.mail_settings
    where active = true
      and nullif(trim(coalesce(resend_api_key, '')), '') is not null
    order by created_at
    limit 1;
  end if;

  return settings;
end;
$$;

create or replace function public.get_mail_app_url(company_id_value uuid default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim((select settings.app_url from public.mail_settings settings where settings.company_id is not distinct from company_id_value limit 1)), ''),
    nullif(trim((select settings.app_url from public.mail_settings settings where settings.company_id is not null limit 1)), ''),
    'https://quieroturnoapp.com.ar'
  )
$$;

create or replace function public.get_mail_app_url()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.get_mail_app_url(null::uuid)
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
  )
  select (select value from base_url) ||
    coalesce('/' || (select slug from selected_company), '') ||
    case
      when nullif(trim(coalesce(hash_value, '')), '') is null then ''
      when left(trim(hash_value), 1) = '#' then trim(hash_value)
      else '#' || trim(hash_value)
    end
$$;

create or replace function public.build_mail_app_link(hash_value text default '')
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.build_mail_app_link(null::uuid, hash_value)
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
begin
  if not public.is_valid_email(clean_to_email) then
    return;
  end if;

  settings := public.get_mail_settings(company_id_value);

  if settings.resend_api_key is null then
    return;
  end if;

  sender_name := nullif(trim(coalesce(from_name_value, '')), '');
  if sender_name is null then
    sender_name := settings.from_name;
  end if;

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || settings.resend_api_key
    ),
    body := jsonb_strip_nulls(jsonb_build_object(
      'from', sender_name || ' <' || settings.from_email || '>',
      'to', jsonb_build_array(clean_to_email),
      'subject', subject_value,
      'text', message_value,
      'html', nullif(html_message_value, ''),
      'reply_to', case when public.is_valid_email(clean_reply_to) then clean_reply_to else settings.from_email end
    )),
    timeout_milliseconds := 5000
  );
end;
$$;

create or replace function public.send_resend_email(
  to_email_value text,
  subject_value text,
  message_value text,
  from_name_value text,
  reply_to_value text,
  html_message_value text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.send_resend_email(to_email_value, subject_value, message_value, from_name_value, reply_to_value, html_message_value, null::uuid);
end;
$$;

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
begin
  if TG_OP = 'INSERT' and NEW.status in ('reserved', 'confirmed', 'pending_assignment') then
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
        client_message := public.format_booking_notification_message(NEW, 'Tu turno fue confirmado.');
        client_html := public.format_booking_notification_html(NEW, 'Tu turno fue confirmado.');
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
      client_message := public.format_booking_notification_message(NEW, 'Tu turno fue confirmado.');
      client_html := public.format_booking_notification_html(NEW, 'Tu turno fue confirmado.');
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

create or replace function public.send_due_booking_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_record public.bookings%rowtype;
  sent_count integer := 0;
  reminder_message text;
  reminder_html text;
begin
  for booking_record in
    select *
    from public.bookings bookings
    where bookings.status in ('reserved', 'confirmed')
      and bookings.employee_id is not null
      and bookings.client_reminder_sent_at is null
      and bookings.start_at > localtimestamp
      and bookings.start_at <= localtimestamp + interval '24 hours'
      and public.is_valid_email(bookings.user_email)
    order by bookings.start_at
    for update skip locked
  loop
    reminder_message := public.format_booking_notification_message(booking_record, 'Recordatorio: tenés un turno reservado para mañana.');
    reminder_html := public.format_booking_notification_html(booking_record, 'Recordatorio: tenés un turno reservado para mañana.');

    perform public.send_resend_email(
      booking_record.user_email,
      'Recordatorio de turno',
      reminder_message,
      'Quiero Turno App - No responder',
      null,
      reminder_html,
      booking_record.company_id
    );

    update public.bookings
    set client_reminder_sent_at = now()
    where id = booking_record.id;

    sent_count := sent_count + 1;
  end loop;

  return sent_count;
end;
$$;

revoke execute on function public.get_mail_settings(uuid) from public;
revoke execute on function public.get_mail_app_url(uuid) from public;
revoke execute on function public.build_mail_app_link(uuid, text) from public;
revoke execute on function public.send_resend_email(text, text, text, text, text, text, uuid) from public;

grant execute on function public.send_due_booking_reminders() to service_role;

commit;
