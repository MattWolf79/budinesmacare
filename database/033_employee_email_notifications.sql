-- Employee emails and automatic mail notifications through Resend.
-- Run after 032_business_hours_configuration.sql on existing databases.

begin;

create extension if not exists pg_net;

create or replace function public.is_valid_email(email_value text)
returns boolean
language sql
immutable
as $$
  select nullif(trim(coalesce(email_value, '')), '') is not null
    and trim(email_value) ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
$$;

alter table public.employees
  add column if not exists email text;

alter table public.internal_registration_requests
  add column if not exists email text;

alter table public.employees
  drop constraint if exists employees_email_chk;

alter table public.employees
  add constraint employees_email_chk check (email is null or public.is_valid_email(email));

alter table public.internal_registration_requests
  drop constraint if exists internal_registration_requests_email_chk;

alter table public.internal_registration_requests
  add constraint internal_registration_requests_email_chk check (email is null or public.is_valid_email(email));

create index if not exists employees_email_idx
  on public.employees(lower(email))
  where email is not null;

create table if not exists public.mail_settings (
  id boolean primary key default true,
  resend_api_key text,
  from_email text not null default 'noresponder@turnosapp.ar',
  from_name text not null default 'Turnos App - No responder',
  active boolean not null default true,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  constraint mail_settings_singleton_chk check (id = true),
  constraint mail_settings_from_email_chk check (public.is_valid_email(from_email))
);

insert into public.mail_settings (id)
values (true)
on conflict (id) do nothing;

update public.mail_settings
set from_email = 'noresponder@turnosapp.ar',
    from_name = 'Turnos App - No responder',
    updated_at = now()
where id = true;

revoke all on public.mail_settings from public;
revoke all on public.mail_settings from anon;
revoke all on public.mail_settings from authenticated;

create or replace function public.send_resend_email(
  to_email_value text,
  subject_value text,
  message_value text,
  from_name_value text default 'Turnos App - No responder',
  reply_to_value text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_to_email text := lower(trim(coalesce(to_email_value, '')));
  settings public.mail_settings%rowtype;
  sender_name text;
begin
  if not public.is_valid_email(clean_to_email) then
    return;
  end if;

  select * into settings
  from public.mail_settings
  where id = true
    and active = true
    and nullif(trim(coalesce(resend_api_key, '')), '') is not null
  limit 1;

  if settings.id is null then
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
    body := jsonb_build_object(
      'from', sender_name || ' <' || settings.from_email || '>',
      'to', jsonb_build_array(clean_to_email),
      'subject', subject_value,
      'text', message_value,
      'reply_to', settings.from_email
    ),
    timeout_milliseconds := 5000
  );
end;
$$;

create or replace function public.notify_admin_emails(subject_value text, message_value text, reply_to_value text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_email text;
begin
  for admin_email in
    select distinct lower(trim(employees.email))
    from public.employees employees
    join public.internal_accounts accounts
      on accounts.employee_id = employees.id
      and accounts.role = 'admin'::public.app_role
      and accounts.active = true
    where employees.active is not false
      and employees.deleted_at is null
      and public.is_valid_email(employees.email)
  loop
    perform public.send_resend_email(admin_email, subject_value, message_value, 'Turnos App - No responder', reply_to_value);
  end loop;
end;
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
begin
  select services.name into service_name
  from public.services services
  where services.id = booking_value.service;

  select coalesce(nullif(trim(concat_ws(' ', employees.first_name, employees.last_name)), ''), employees.name)
  into employee_name
  from public.employees employees
  where employees.id = booking_value.employee_id;

  return concat_ws(E'\n',
    event_label,
    'Cliente: ' || coalesce(nullif(booking_value.customer_name, ''), nullif(booking_value.user_email, ''), 'Cliente sin datos'),
    case when public.is_valid_email(booking_value.user_email) then 'Mail cliente: ' || booking_value.user_email else null end,
    'Actividad: ' || coalesce(nullif(booking_value.booking_description, ''), service_name, 'Turno'),
    case when employee_name is not null then 'Empleado: ' || employee_name else 'Empleado: pendiente de asignación' end,
    'Inicio: ' || to_char(booking_value.start_at, 'DD/MM/YYYY HH24:MI'),
    'Fin: ' || to_char(booking_value.end_at, 'DD/MM/YYYY HH24:MI')
  );
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
  employee_name text;
  client_message text;
  admin_message text;
  employee_message text;
begin
  if TG_OP = 'INSERT' and NEW.status in ('reserved', 'confirmed', 'pending_assignment') then
    client_message := public.format_booking_notification_message(NEW, 'Recibimos tu reserva.');

    if public.is_valid_email(NEW.user_email) then
      perform public.send_resend_email(
        NEW.user_email,
        'Recibimos tu reserva',
        client_message,
        'Turnos App - No responder'
      );
    end if;

    if NEW.status = 'pending_assignment' or NEW.employee_id is null then
      admin_message := public.format_booking_notification_message(NEW, 'Hay un turno pendiente para asignar.');
      perform public.notify_admin_emails('Hay un turno pendiente para asignar', admin_message, NEW.user_email);
    end if;

    if NEW.employee_id is not null then
      select employees.email, coalesce(nullif(trim(concat_ws(' ', employees.first_name, employees.last_name)), ''), employees.name)
      into employee_email, employee_name
      from public.employees employees
      where employees.id = NEW.employee_id;

      employee_message := public.format_booking_notification_message(NEW, 'Tenés un nuevo turno asignado.');
      perform public.send_resend_email(employee_email, 'Tenés un nuevo turno asignado', employee_message, 'Turnos App - No responder', NEW.user_email);
    end if;
  end if;

  if TG_OP = 'UPDATE'
    and NEW.status in ('reserved', 'confirmed')
    and NEW.employee_id is not null
    and (OLD.employee_id is distinct from NEW.employee_id or OLD.status = 'pending_assignment') then
    select employees.email, coalesce(nullif(trim(concat_ws(' ', employees.first_name, employees.last_name)), ''), employees.name)
    into employee_email, employee_name
    from public.employees employees
    where employees.id = NEW.employee_id;

    employee_message := public.format_booking_notification_message(NEW, 'Tenés un nuevo turno asignado.');
    perform public.send_resend_email(employee_email, 'Tenés un nuevo turno asignado', employee_message, 'Turnos App - No responder', NEW.user_email);
  end if;

  if TG_OP = 'UPDATE'
    and NEW.status = 'cancelled'
    and OLD.status is distinct from NEW.status
    and NEW.employee_id is not null then
    select employees.email, coalesce(nullif(trim(concat_ws(' ', employees.first_name, employees.last_name)), ''), employees.name)
    into employee_email, employee_name
    from public.employees employees
    where employees.id = NEW.employee_id;

    employee_message := public.format_booking_notification_message(NEW, 'Se canceló este turno.');
    perform public.send_resend_email(employee_email, 'Se canceló un turno', employee_message, 'Turnos App - No responder', NEW.user_email);
  end if;

  return NEW;
end;
$$;

drop trigger if exists bookings_send_email_notifications on public.bookings;
create trigger bookings_send_email_notifications
after insert or update of status, employee_id on public.bookings
for each row
execute function public.send_booking_email_notifications();

create or replace function public.send_internal_request_email_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_message text;
begin
  if NEW.status = 'pending' then
    request_message := concat_ws(E'\n',
      'Hay un acceso interno pendiente para aceptar.',
      'Perfil: ' || NEW.role::text,
      'Nombre: ' || coalesce(nullif(NEW.display_name, ''), 'Sin nombre'),
      'Usuario: ' || coalesce(nullif(NEW.username, ''), 'Sin usuario'),
      case when public.is_valid_email(NEW.email) then 'Mail: ' || NEW.email else null end,
      case when nullif(NEW.phone, '') is not null then 'Celular: ' || NEW.phone else null end,
      'Entrá al panel de administración para aprobar o rechazar la solicitud.'
    );

    perform public.notify_admin_emails('Hay un empleado nuevo para aceptar', request_message, NEW.email);
  end if;

  return NEW;
end;
$$;

drop trigger if exists internal_requests_send_email_notifications on public.internal_registration_requests;
create trigger internal_requests_send_email_notifications
after insert on public.internal_registration_requests
for each row
execute function public.send_internal_request_email_notifications();

create or replace function public.create_admin_employee(
  name_value text,
  first_name_value text default null,
  last_name_value text default null,
  birth_date_value date default null,
  phone_value text default null,
  address_street_value text default null,
  address_number_value text default null,
  address_locality_value text default null,
  photo_url_value text default null,
  code_value text default null,
  service_ids_value text[] default array[]::text[],
  is_admin_value boolean default false,
  account_id_value uuid default null,
  session_token_value text default null,
  email_value text default null
)
returns table (
  id uuid,
  name text,
  first_name text,
  last_name text,
  birth_date date,
  phone text,
  email text,
  address_street text,
  address_number text,
  address_locality text,
  photo_url text,
  code text,
  active boolean,
  deleted_at timestamp without time zone,
  created_at timestamp without time zone,
  updated_at timestamp without time zone,
  internal_username text,
  is_admin boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_employee record;
  saved_employee public.employees%rowtype;
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
  welcome_message text;
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'Ingresá un mail válido para el empleado.';
  end if;

  for created_employee in
    select *
    from public.create_admin_employee_legacy(name_value, first_name_value, last_name_value, birth_date_value, phone_value, address_street_value, address_number_value, address_locality_value, photo_url_value, code_value, service_ids_value, is_admin_value, account_id_value)
  loop
    update public.employees
    set email = clean_email,
        updated_at = now()
    where employees.id = created_employee.id
    returning * into saved_employee;

    welcome_message := concat_ws(E'\n',
      'Tu acceso interno fue creado.',
      'Usuario: ' || created_employee.internal_username,
      'Contraseña inicial: 123456',
      'Al ingresar se te va a pedir cambiar la contraseña.',
      'Este es un mensaje automático, no respondas este mail.'
    );

    perform public.send_resend_email(
      clean_email,
      'Tu acceso interno fue creado',
      welcome_message,
      'Turnos App - No responder'
    );

    return query
    select
      saved_employee.id,
      saved_employee.name,
      saved_employee.first_name,
      saved_employee.last_name,
      saved_employee.birth_date,
      saved_employee.phone,
      saved_employee.email,
      saved_employee.address_street,
      saved_employee.address_number,
      saved_employee.address_locality,
      saved_employee.photo_url,
      saved_employee.code,
      saved_employee.active,
      saved_employee.deleted_at,
      saved_employee.created_at,
      saved_employee.updated_at,
      created_employee.internal_username,
      created_employee.is_admin;
  end loop;
end;
$$;

create or replace function public.update_admin_employee(
  employee_id_value uuid,
  name_value text,
  first_name_value text default null,
  last_name_value text default null,
  birth_date_value date default null,
  phone_value text default null,
  address_street_value text default null,
  address_number_value text default null,
  address_locality_value text default null,
  photo_url_value text default null,
  code_value text default null,
  active_value boolean default true,
  is_admin_value boolean default false,
  service_ids_value text[] default array[]::text[],
  account_id_value uuid default null,
  session_token_value text default null,
  email_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_employee jsonb;
  saved_employee public.employees%rowtype;
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'Ingresá un mail válido para el empleado.';
  end if;

  updated_employee := public.update_admin_employee_legacy(employee_id_value, name_value, first_name_value, last_name_value, birth_date_value, phone_value, address_street_value, address_number_value, address_locality_value, photo_url_value, code_value, active_value, is_admin_value, service_ids_value, account_id_value);

  update public.employees
  set email = clean_email,
      updated_at = now()
  where employees.id = employee_id_value
  returning * into saved_employee;

  return updated_employee || jsonb_build_object('email', saved_employee.email);
end;
$$;

create or replace function public.request_internal_registration(
  account_role public.app_role,
  username_value text,
  first_name_value text,
  last_name_value text,
  birth_date_value date,
  phone_value text,
  password_value text,
  address_street_value text default null,
  address_number_value text default null,
  address_locality_value text default null,
  photo_url_value text default null,
  employee_id_value uuid default null,
  email_value text default null
)
returns table (
  id uuid,
  role public.app_role,
  username text,
  display_name text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_username text := trim(coalesce(username_value, ''));
  clean_first_name text := trim(coalesce(first_name_value, ''));
  clean_last_name text := trim(coalesce(last_name_value, ''));
  clean_display_name text := trim(concat_ws(' ', nullif(trim(coalesce(first_name_value, '')), ''), nullif(trim(coalesce(last_name_value, '')), '')));
  clean_password text := trim(coalesce(password_value, ''));
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
begin
  if account_role not in ('admin'::public.app_role, 'employee'::public.app_role) then
    raise exception 'Rol interno invalido.';
  end if;

  if length(clean_username) < 3 or clean_username !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'El usuario debe tener al menos 3 caracteres y solo puede usar letras, numeros, punto, guion o guion bajo.';
  end if;

  if length(clean_first_name) < 2 or length(clean_last_name) < 2 then
    raise exception 'Ingresá nombre y apellido.';
  end if;

  if birth_date_value is null or birth_date_value > current_date then
    raise exception 'La fecha de nacimiento es invalida.';
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'Ingresá un mail válido.';
  end if;

  if length(clean_password) < 6 or clean_password !~ '^[A-Za-z0-9]+$' then
    raise exception 'La contraseña debe ser alfanumerica y tener al menos 6 caracteres.';
  end if;

  if exists (select 1 from public.internal_accounts accounts where accounts.username_normalized = public.normalize_text(clean_username)) then
    raise exception 'Ya existe una cuenta interna con ese usuario.';
  end if;

  if exists (select 1 from public.internal_registration_requests requests where requests.status = 'pending' and requests.username_normalized = public.normalize_text(clean_username)) then
    raise exception 'Ya existe una solicitud pendiente con ese usuario.';
  end if;

  return query
  insert into public.internal_registration_requests (
    role,
    username,
    display_name,
    first_name,
    last_name,
    birth_date,
    phone,
    email,
    address_street,
    address_number,
    address_locality,
    photo_url,
    username_normalized,
    password_hash,
    employee_id
  ) values (
    account_role,
    clean_username,
    clean_display_name,
    clean_first_name,
    clean_last_name,
    birth_date_value,
    nullif(trim(coalesce(phone_value, '')), ''),
    clean_email,
    nullif(trim(coalesce(address_street_value, '')), ''),
    nullif(trim(coalesce(address_number_value, '')), ''),
    nullif(trim(coalesce(address_locality_value, '')), ''),
    nullif(photo_url_value, ''),
    public.normalize_text(clean_username),
    extensions.crypt(clean_password, extensions.gen_salt('bf')),
    employee_id_value
  )
  returning
    internal_registration_requests.id,
    internal_registration_requests.role,
    internal_registration_requests.username,
    internal_registration_requests.display_name,
    internal_registration_requests.status;
end;
$$;

create or replace function public.approve_internal_registration(
  request_id_value uuid,
  employee_id_value uuid default null,
  account_id_value uuid default null,
  session_token_value text default null
)
returns table (
  id uuid,
  role public.app_role,
  username text,
  display_name text,
  photo_url text,
  employee_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  approved_account record;
  request_email text;
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  select email into request_email
  from public.internal_registration_requests
  where id = request_id_value;

  for approved_account in
    select * from public.approve_internal_registration_legacy(request_id_value, employee_id_value, account_id_value)
  loop
    if public.is_valid_email(request_email) then
      update public.employees
      set email = lower(trim(request_email)),
          updated_at = now()
      where employees.id = approved_account.employee_id;
    end if;

    return query
    select
      approved_account.id,
      approved_account.role,
      approved_account.username,
      approved_account.display_name,
      approved_account.photo_url,
      approved_account.employee_id;
  end loop;
end;
$$;

create or replace function public.get_client_booking_options()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'services', coalesce((
      select jsonb_agg(to_jsonb(service_rows) order by service_rows.id)
      from (
        select *
        from public.services
        where active is not false
        order by id
      ) service_rows
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(to_jsonb(employee_rows) order by employee_rows.name)
      from (
        select
          id,
          name,
          first_name,
          last_name,
          photo_url,
          active,
          deleted_at
        from public.employees
        where active is not false
          and deleted_at is null
        order by name
      ) employee_rows
    ), '[]'::jsonb),
    'employeeServices', coalesce((
      select jsonb_agg(to_jsonb(relation_rows))
      from (
        select relations.*
        from public.employee_services relations
        join public.services services on services.id = relations.service_id
        join public.employees employees on employees.id = relations.employee_id
        where services.active is not false
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
        where availability.active is true
          and employees.active is not false
          and employees.deleted_at is null
      ) availability_rows
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.send_resend_email(text, text, text, text, text) from public;
revoke execute on function public.notify_admin_emails(text, text, text) from public;
grant execute on function public.create_admin_employee(text, text, text, date, text, text, text, text, text, text, text[], boolean, uuid, text, text) to anon, authenticated;
grant execute on function public.update_admin_employee(uuid, text, text, text, date, text, text, text, text, text, text, boolean, boolean, text[], uuid, text, text) to anon, authenticated;
grant execute on function public.request_internal_registration(public.app_role, text, text, text, date, text, text, text, text, text, text, uuid, text) to anon, authenticated;
grant execute on function public.approve_internal_registration(uuid, uuid, uuid, text) to anon, authenticated;
grant execute on function public.get_client_booking_options() to anon, authenticated;

commit;