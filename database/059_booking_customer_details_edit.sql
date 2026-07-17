-- Allow internal users to edit booking customer details and include client CTA links in emails.
-- Run after 058_approve_registration_username_collision.sql.

begin;

create or replace function public.build_client_booking_link(company_id_value uuid default null)
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
    '/sacarturno'
$$;

create or replace function public.get_internal_employee_workspace(
  account_id_value uuid,
  session_token_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  target_company_id uuid;
  payload jsonb;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), account_record.company_id);

  if target_company_id is null or account_record.company_id is distinct from target_company_id or account_record.employee_id is null then
    raise exception 'La cuenta interna no pertenece a esta empresa.';
  end if;

  select jsonb_build_object(
    'employee', coalesce((
      select to_jsonb(employees)
      from public.employees employees
      where employees.id = account_record.employee_id
        and employees.company_id = target_company_id
        and employees.deleted_at is null
      limit 1
    ), 'null'::jsonb),
    'employees', coalesce((
      select jsonb_agg(to_jsonb(employee_rows) order by employee_rows.name)
      from (
        select *
        from public.employees employees
        where employees.company_id = target_company_id
          and employees.deleted_at is null
      ) employee_rows
    ), '[]'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(booking_rows) order by booking_rows.start_at)
      from (
        select *
        from public.bookings bookings
        where bookings.company_id = target_company_id
          and bookings.status in ('reserved', 'confirmed', 'pending_assignment', 'completed')
        order by bookings.start_at
      ) booking_rows
    ), '[]'::jsonb),
    'bookingClosureItems', coalesce((
      select jsonb_agg(to_jsonb(closure_item_rows) order by closure_item_rows.created_at)
      from (
        select closure_items.*
        from public.booking_closure_items closure_items
        join public.bookings bookings on bookings.id = closure_items.booking_id
        where bookings.company_id = target_company_id
          and bookings.employee_id = account_record.employee_id
          and bookings.status = 'completed'
      ) closure_item_rows
    ), '[]'::jsonb),
    'bookingClosures', coalesce((
      select jsonb_agg(to_jsonb(closure_rows) order by closure_rows.created_at)
      from (
        select distinct closures.*
        from public.booking_closures closures
        join public.booking_closure_items closure_items on closure_items.closure_id = closures.id
        join public.bookings bookings on bookings.id = closure_items.booking_id
        where bookings.company_id = target_company_id
          and bookings.employee_id = account_record.employee_id
          and bookings.status = 'completed'
      ) closure_rows
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(to_jsonb(service_rows) order by service_rows.id)
      from (
        select *
        from public.services services
        where services.company_id = target_company_id
        order by services.id
      ) service_rows
    ), '[]'::jsonb),
    'employeeServices', coalesce((
      select jsonb_agg(to_jsonb(relation_rows))
      from (
        select *
        from public.employee_services relations
        where relations.company_id = target_company_id
      ) relation_rows
    ), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(to_jsonb(availability_rows) order by availability_rows.available_date, availability_rows.start_time)
      from (
        select *
        from public.employee_availability availability
        where availability.company_id = target_company_id
          and availability.employee_id = account_record.employee_id
        order by availability.available_date, availability.start_time
      ) availability_rows
    ), '[]'::jsonb),
    'agendaAvailability', coalesce((
      select jsonb_agg(to_jsonb(availability_rows) order by availability_rows.available_date, availability_rows.start_time)
      from (
        select *
        from public.employee_availability availability
        where availability.company_id = target_company_id
        order by availability.available_date, availability.start_time
      ) availability_rows
    ), '[]'::jsonb)
  ) into payload;

  return payload;
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
  client_booking_url text := public.build_client_booking_link(NEW.company_id);
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
  client_booking_url text;
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
    client_booking_url := public.build_client_booking_link(booking_record.company_id);
    reminder_message := public.format_booking_notification_message(booking_record, 'Recordatorio: tenés un turno reservado para mañana.') || E'\n\nIr al Turno: ' || client_booking_url;
    reminder_html := public.format_booking_notification_html(booking_record, 'Recordatorio: tenés un turno reservado para mañana.', 'Ir al Turno', client_booking_url);

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

create or replace function public.update_booking_customer_details(
  booking_id_value uuid,
  customer_first_name_value text default null,
  customer_last_name_value text default null,
  customer_email_value text default null,
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
  account_record public.internal_accounts%rowtype;
  target_company_id uuid;
  booking_record public.bookings%rowtype;
  saved_booking public.bookings%rowtype;
  clean_first_name text := nullif(trim(coalesce(customer_first_name_value, '')), '');
  clean_last_name text := nullif(trim(coalesce(customer_last_name_value, '')), '');
  clean_email text := lower(nullif(trim(coalesce(customer_email_value, '')), ''));
  clean_customer_name text := nullif(trim(concat_ws(' ', clean_first_name, clean_last_name)), '');
  previous_email text;
  client_booking_url text;
  client_message text;
  client_html text;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, null);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), account_record.company_id);

  if target_company_id is null or account_record.company_id is distinct from target_company_id or account_record.role not in ('admin'::public.app_role, 'employee'::public.app_role) then
    raise exception 'No tenés permisos para editar este turno.';
  end if;

  if clean_email is not null and not public.is_valid_email(clean_email) then
    raise exception 'El mail del cliente no es válido.';
  end if;

  select *
  into booking_record
  from public.bookings bookings
  where bookings.id = booking_id_value
    and bookings.company_id = target_company_id
  for update;

  if booking_record.id is null then
    raise exception 'El turno no existe.';
  end if;

  if booking_record.status not in ('reserved', 'confirmed', 'pending_assignment') then
    raise exception 'Solo se pueden editar turnos activos.';
  end if;

  if clean_email is not null and exists (
    select 1
    from public.bookings bookings
    where bookings.company_id = target_company_id
      and bookings.id is distinct from booking_record.id
      and lower(coalesce(bookings.user_email, '')) = clean_email
      and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
      and bookings.start_at < booking_record.end_at
      and bookings.end_at > booking_record.start_at
    limit 1
  ) then
    raise exception 'Ese cliente ya tiene un turno en ese horario.';
  end if;

  previous_email := lower(nullif(trim(coalesce(booking_record.user_email, '')), ''));

  update public.bookings
  set customer_name = clean_customer_name,
      user_email = clean_email
  where id = booking_record.id
  returning * into saved_booking;

  if public.is_valid_email(saved_booking.user_email)
    and (previous_email is distinct from lower(saved_booking.user_email)) then
    client_booking_url := public.build_client_booking_link(saved_booking.company_id);
    client_message := public.format_booking_notification_message(saved_booking, 'Tu turno fue actualizado.') || E'\n\nIr al Turno: ' || client_booking_url;
    client_html := public.format_booking_notification_html(saved_booking, 'Tu turno fue actualizado.', 'Ir al Turno', client_booking_url);
    perform public.send_resend_email(saved_booking.user_email, 'Tu turno fue actualizado', client_message, 'Quiero Turno App - No responder', null, client_html, saved_booking.company_id);
  end if;

  return to_jsonb(saved_booking);
end;
$$;

revoke execute on function public.build_client_booking_link(uuid) from public;
revoke execute on function public.get_internal_employee_workspace(uuid, text, text) from public;
revoke execute on function public.update_booking_customer_details(uuid, text, text, text, uuid, text, text) from public;
grant execute on function public.get_internal_employee_workspace(uuid, text, text) to anon, authenticated;
grant execute on function public.update_booking_customer_details(uuid, text, text, text, uuid, text, text) to anon, authenticated;
grant execute on function public.send_due_booking_reminders() to service_role;

commit;