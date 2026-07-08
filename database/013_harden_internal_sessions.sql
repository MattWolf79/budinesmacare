-- Harden internal admin/employee RPC access with server-issued session tokens.
-- Run after 012_internal_sessions_booking_cancellation_fix.sql on existing databases.

begin;

create table if not exists public.internal_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.internal_accounts(id) on delete cascade,
  token_hash text not null,
  created_at timestamp without time zone not null default now(),
  expires_at timestamp without time zone not null default (now() + interval '8 hours'),
  last_used_at timestamp without time zone,
  revoked_at timestamp without time zone,
  constraint internal_sessions_token_hash_chk check (length(token_hash) > 20)
);

create index if not exists internal_sessions_account_id_idx
  on public.internal_sessions(account_id);

create index if not exists internal_sessions_active_idx
  on public.internal_sessions(account_id, expires_at)
  where revoked_at is null;

revoke all on public.internal_sessions from anon, authenticated;

create or replace function public.create_internal_session(account_id_value uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  session_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into public.internal_sessions (account_id, token_hash)
  values (account_id_value, extensions.crypt(session_token, extensions.gen_salt('bf')));

  return session_token;
end;
$$;

create or replace function public.validate_internal_session(
  account_id_value uuid,
  session_token_value text,
  required_role public.app_role default null
)
returns public.internal_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  session_id_value uuid;
begin
  if account_id_value is null or nullif(trim(coalesce(session_token_value, '')), '') is null then
    raise exception 'Sesión interna inválida.';
  end if;

  select accounts.*
  into account_record
  from public.internal_accounts accounts
  join public.internal_sessions sessions
    on sessions.account_id = accounts.id
  where accounts.id = account_id_value
    and accounts.active = true
    and (required_role is null or accounts.role = required_role)
    and sessions.revoked_at is null
    and sessions.expires_at > now()
    and sessions.token_hash = extensions.crypt(trim(session_token_value), sessions.token_hash)
  order by sessions.created_at desc
  limit 1;

  if account_record.id is null then
    raise exception 'Sesión interna inválida o vencida.';
  end if;

  select sessions.id
  into session_id_value
  from public.internal_sessions sessions
  where sessions.account_id = account_record.id
    and sessions.revoked_at is null
    and sessions.expires_at > now()
    and sessions.token_hash = extensions.crypt(trim(session_token_value), sessions.token_hash)
  order by sessions.created_at desc
  limit 1;

  update public.internal_sessions
  set last_used_at = now()
  where internal_sessions.id = session_id_value;

  return account_record;
end;
$$;

revoke execute on function public.is_internal_admin(uuid) from anon, authenticated;

drop function if exists public.verify_internal_login(public.app_role, text, text);
create or replace function public.verify_internal_login(
  account_role public.app_role,
  username_value text,
  password_value text
)
returns table (
  id uuid,
  role public.app_role,
  username text,
  display_name text,
  first_name text,
  last_name text,
  photo_url text,
  employee_id uuid,
  must_change_password boolean,
  session_token text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
begin
  select *
  into account_record
  from public.internal_accounts
  where internal_accounts.role = account_role
    and internal_accounts.username_normalized = public.normalize_text(username_value)
    and internal_accounts.active = true
  limit 1;

  if account_record.id is null or account_record.password_hash <> extensions.crypt(trim(coalesce(password_value, '')), account_record.password_hash) then
    raise exception 'Nombre o contraseña invalidos.';
  end if;

  update public.internal_accounts
  set last_login_at = now(), updated_at = now()
  where internal_accounts.id = account_record.id;

  return query
  select
    account_record.id,
    account_record.role,
    account_record.username,
    account_record.display_name,
    account_record.first_name,
    account_record.last_name,
    account_record.photo_url,
    account_record.employee_id,
    account_record.must_change_password,
    public.create_internal_session(account_record.id);
end;
$$;

drop function if exists public.change_internal_password(uuid, text, text);
create or replace function public.change_internal_password(
  account_id_value uuid,
  current_password_value text,
  new_password_value text
)
returns table (
  id uuid,
  role public.app_role,
  username text,
  display_name text,
  first_name text,
  last_name text,
  photo_url text,
  employee_id uuid,
  must_change_password boolean,
  session_token text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  clean_new_password text := trim(coalesce(new_password_value, ''));
begin
  select *
  into account_record
  from public.internal_accounts
  where internal_accounts.id = account_id_value
    and internal_accounts.active = true
  limit 1;

  if account_record.id is null or account_record.password_hash <> extensions.crypt(trim(coalesce(current_password_value, '')), account_record.password_hash) then
    raise exception 'La contraseña actual es invalida.';
  end if;

  if length(clean_new_password) < 6 or clean_new_password !~ '^[A-Za-z0-9]+$' then
    raise exception 'La nueva contraseña debe ser alfanumerica y tener al menos 6 caracteres.';
  end if;

  if account_record.password_hash = extensions.crypt(clean_new_password, account_record.password_hash) then
    raise exception 'La nueva contraseña debe ser distinta a la actual.';
  end if;

  update public.internal_sessions
  set revoked_at = now()
  where internal_sessions.account_id = account_record.id
    and internal_sessions.revoked_at is null;

  update public.internal_accounts
  set password_hash = extensions.crypt(clean_new_password, extensions.gen_salt('bf')),
      must_change_password = false,
      updated_at = now()
  where internal_accounts.id = account_record.id
  returning * into account_record;

  return query
  select
    account_record.id,
    account_record.role,
    account_record.username,
    account_record.display_name,
    account_record.first_name,
    account_record.last_name,
    account_record.photo_url,
    account_record.employee_id,
    account_record.must_change_password,
    public.create_internal_session(account_record.id);
end;
$$;

alter function public.get_admin_panel_data(uuid, text) rename to get_admin_panel_data_legacy;
alter function public.get_internal_employee_workspace(uuid) rename to get_internal_employee_workspace_legacy;
alter function public.create_admin_employee(text, text, text, date, text, text, text, text, text, text, text[], boolean, uuid) rename to create_admin_employee_legacy;
alter function public.update_admin_employee(uuid, text, text, text, date, text, text, text, text, text, text, boolean, boolean, text[], uuid) rename to update_admin_employee_legacy;
alter function public.approve_internal_registration(uuid, uuid, uuid) rename to approve_internal_registration_legacy;
alter function public.reject_internal_registration(uuid, uuid) rename to reject_internal_registration_legacy;
alter function public.delete_admin_employee(uuid, uuid) rename to delete_admin_employee_legacy;
alter function public.reset_admin_employee_password(uuid, uuid) rename to reset_admin_employee_password_legacy;
alter function public.save_admin_service(bigint, text, text, text, integer, boolean, uuid) rename to save_admin_service_legacy;
alter function public.delete_admin_service(bigint, uuid) rename to delete_admin_service_legacy;
alter function public.save_admin_employee_availability(text, uuid, date, time without time zone, time without time zone, boolean, uuid) rename to save_admin_employee_availability_legacy;
alter function public.delete_admin_employee_availability(text, uuid) rename to delete_admin_employee_availability_legacy;
alter function public.create_admin_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid) rename to create_admin_booking_legacy;
alter function public.create_internal_employee_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid) rename to create_internal_employee_booking_legacy;
alter function public.cancel_booking(uuid, uuid) rename to cancel_booking_legacy;
alter function public.assign_admin_booking_employee(uuid, uuid, uuid) rename to assign_admin_booking_employee_legacy;
alter function public.list_internal_employee_availability(uuid) rename to list_internal_employee_availability_legacy;
alter function public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean) rename to create_internal_employee_availability_legacy;
alter function public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean) rename to update_internal_employee_availability_legacy;
alter function public.delete_internal_employee_availability(uuid, text) rename to delete_internal_employee_availability_legacy;

revoke execute on function public.get_admin_panel_data_legacy(uuid, text) from anon, authenticated;
revoke execute on function public.get_internal_employee_workspace_legacy(uuid) from anon, authenticated;
revoke execute on function public.create_admin_employee_legacy(text, text, text, date, text, text, text, text, text, text, text[], boolean, uuid) from anon, authenticated;
revoke execute on function public.update_admin_employee_legacy(uuid, text, text, text, date, text, text, text, text, text, text, boolean, boolean, text[], uuid) from anon, authenticated;
revoke execute on function public.approve_internal_registration_legacy(uuid, uuid, uuid) from anon, authenticated;
revoke execute on function public.reject_internal_registration_legacy(uuid, uuid) from anon, authenticated;
revoke execute on function public.delete_admin_employee_legacy(uuid, uuid) from anon, authenticated;
revoke execute on function public.reset_admin_employee_password_legacy(uuid, uuid) from anon, authenticated;
revoke execute on function public.save_admin_service_legacy(bigint, text, text, text, integer, boolean, uuid) from anon, authenticated;
revoke execute on function public.delete_admin_service_legacy(bigint, uuid) from anon, authenticated;
revoke execute on function public.save_admin_employee_availability_legacy(text, uuid, date, time without time zone, time without time zone, boolean, uuid) from anon, authenticated;
revoke execute on function public.delete_admin_employee_availability_legacy(text, uuid) from anon, authenticated;
revoke execute on function public.create_admin_booking_legacy(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid) from anon, authenticated;
revoke execute on function public.create_internal_employee_booking_legacy(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid) from anon, authenticated;
revoke execute on function public.cancel_booking_legacy(uuid, uuid) from anon, authenticated;
revoke execute on function public.assign_admin_booking_employee_legacy(uuid, uuid, uuid) from anon, authenticated;
revoke execute on function public.list_internal_employee_availability_legacy(uuid) from anon, authenticated;
revoke execute on function public.create_internal_employee_availability_legacy(uuid, date, time without time zone, time without time zone, boolean) from anon, authenticated;
revoke execute on function public.update_internal_employee_availability_legacy(uuid, text, date, time without time zone, time without time zone, boolean) from anon, authenticated;
revoke execute on function public.delete_internal_employee_availability_legacy(uuid, text) from anon, authenticated;

create or replace function public.get_admin_panel_data(account_id_value uuid default null, request_status_value text default 'pending', session_token_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role); end if;
  return public.get_admin_panel_data_legacy(account_id_value, request_status_value);
end; $$;

create or replace function public.get_internal_employee_workspace(account_id_value uuid, session_token_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  return public.get_internal_employee_workspace_legacy(account_id_value);
end; $$;

create or replace function public.create_admin_employee(name_value text, first_name_value text default null, last_name_value text default null, birth_date_value date default null, phone_value text default null, address_street_value text default null, address_number_value text default null, address_locality_value text default null, photo_url_value text default null, code_value text default null, service_ids_value text[] default array[]::text[], is_admin_value boolean default false, account_id_value uuid default null, session_token_value text default null)
returns table (id uuid, name text, first_name text, last_name text, birth_date date, phone text, address_street text, address_number text, address_locality text, photo_url text, code text, active boolean, deleted_at timestamp without time zone, created_at timestamp without time zone, updated_at timestamp without time zone, internal_username text, is_admin boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role); end if;
  return query select * from public.create_admin_employee_legacy(name_value, first_name_value, last_name_value, birth_date_value, phone_value, address_street_value, address_number_value, address_locality_value, photo_url_value, code_value, service_ids_value, is_admin_value, account_id_value);
end; $$;

create or replace function public.update_admin_employee(employee_id_value uuid, name_value text, first_name_value text default null, last_name_value text default null, birth_date_value date default null, phone_value text default null, address_street_value text default null, address_number_value text default null, address_locality_value text default null, photo_url_value text default null, code_value text default null, active_value boolean default true, is_admin_value boolean default false, service_ids_value text[] default array[]::text[], account_id_value uuid default null, session_token_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role); end if;
  return public.update_admin_employee_legacy(employee_id_value, name_value, first_name_value, last_name_value, birth_date_value, phone_value, address_street_value, address_number_value, address_locality_value, photo_url_value, code_value, active_value, is_admin_value, service_ids_value, account_id_value);
end; $$;

create or replace function public.approve_internal_registration(request_id_value uuid, employee_id_value uuid default null, account_id_value uuid default null, session_token_value text default null)
returns table (id uuid, role public.app_role, username text, display_name text, photo_url text, employee_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role); end if;
  return query select * from public.approve_internal_registration_legacy(request_id_value, employee_id_value, account_id_value);
end; $$;

create or replace function public.reject_internal_registration(request_id_value uuid, account_id_value uuid default null, session_token_value text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role); end if;
  perform public.reject_internal_registration_legacy(request_id_value, account_id_value);
end; $$;

create or replace function public.delete_admin_employee(employee_id_value uuid, account_id_value uuid default null, session_token_value text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role); end if;
  perform public.delete_admin_employee_legacy(employee_id_value, account_id_value);
end; $$;

create or replace function public.reset_admin_employee_password(employee_id_value uuid, account_id_value uuid default null, session_token_value text default null)
returns table (username text, temporary_password text, must_change_password boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role); end if;
  return query select * from public.reset_admin_employee_password_legacy(employee_id_value, account_id_value);
end; $$;

create or replace function public.save_admin_service(service_id_value bigint, name_value text, icon_value text, color_value text, default_duration_value integer, active_value boolean, account_id_value uuid default null, session_token_value text default null)
returns table (id bigint, name text, icon text, color text, default_duration integer, active boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role); end if;
  return query select * from public.save_admin_service_legacy(service_id_value, name_value, icon_value, color_value, default_duration_value, active_value, account_id_value);
end; $$;

create or replace function public.delete_admin_service(service_id_value bigint, account_id_value uuid default null, session_token_value text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role); end if;
  perform public.delete_admin_service_legacy(service_id_value, account_id_value);
end; $$;

create or replace function public.save_admin_employee_availability(availability_id_value text, employee_id_value uuid, available_date_value date, start_time_value time without time zone, end_time_value time without time zone, active_value boolean default true, account_id_value uuid default null, session_token_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role); end if;
  return public.save_admin_employee_availability_legacy(availability_id_value, employee_id_value, available_date_value, start_time_value, end_time_value, active_value, account_id_value);
end; $$;

create or replace function public.delete_admin_employee_availability(availability_id_value text, account_id_value uuid default null, session_token_value text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role); end if;
  perform public.delete_admin_employee_availability_legacy(availability_id_value, account_id_value);
end; $$;

create or replace function public.create_admin_booking(service_id_value bigint, employee_id_value uuid, start_at_value timestamp without time zone, end_at_value timestamp without time zone, customer_name_value text default null, customer_email_value text default null, account_id_value uuid default null, session_token_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role); end if;
  return public.create_admin_booking_legacy(service_id_value, employee_id_value, start_at_value, end_at_value, customer_name_value, customer_email_value, account_id_value);
end; $$;

create or replace function public.create_internal_employee_booking(service_id_value bigint, employee_id_value uuid, start_at_value timestamp without time zone, end_at_value timestamp without time zone, customer_name_value text default null, customer_email_value text default null, account_id_value uuid default null, session_token_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  return public.create_internal_employee_booking_legacy(service_id_value, employee_id_value, start_at_value, end_at_value, customer_name_value, customer_email_value, account_id_value);
end; $$;

create or replace function public.cancel_booking(booking_id_value uuid, account_id_value uuid default null, session_token_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if account_id_value is not null then perform public.validate_internal_session(account_id_value, session_token_value, null); end if;
  return public.cancel_booking_legacy(booking_id_value, account_id_value);
end; $$;

create or replace function public.assign_admin_booking_employee(booking_id_value uuid, employee_id_value uuid, account_id_value uuid default null, session_token_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role); end if;
  return public.assign_admin_booking_employee_legacy(booking_id_value, employee_id_value, account_id_value);
end; $$;

create or replace function public.list_internal_employee_availability(account_id_value uuid, session_token_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  return public.list_internal_employee_availability_legacy(account_id_value);
end; $$;

create or replace function public.create_internal_employee_availability(account_id_value uuid, available_date_value date, start_time_value time without time zone, end_time_value time without time zone, active_value boolean default true, session_token_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  return public.create_internal_employee_availability_legacy(account_id_value, available_date_value, start_time_value, end_time_value, active_value);
end; $$;

create or replace function public.update_internal_employee_availability(account_id_value uuid, availability_id_value text, available_date_value date, start_time_value time without time zone, end_time_value time without time zone, active_value boolean default true, session_token_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  return public.update_internal_employee_availability_legacy(account_id_value, availability_id_value, available_date_value, start_time_value, end_time_value, active_value);
end; $$;

create or replace function public.delete_internal_employee_availability(account_id_value uuid, availability_id_value text, session_token_value text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  perform public.delete_internal_employee_availability_legacy(account_id_value, availability_id_value);
end; $$;

grant execute on function public.verify_internal_login(public.app_role, text, text) to anon, authenticated;
grant execute on function public.change_internal_password(uuid, text, text) to anon, authenticated;
grant execute on function public.get_admin_panel_data(uuid, text, text) to anon, authenticated;
grant execute on function public.get_internal_employee_workspace(uuid, text) to anon, authenticated;
grant execute on function public.create_admin_employee(text, text, text, date, text, text, text, text, text, text, text[], boolean, uuid, text) to anon, authenticated;
grant execute on function public.update_admin_employee(uuid, text, text, text, date, text, text, text, text, text, text, boolean, boolean, text[], uuid, text) to anon, authenticated;
grant execute on function public.approve_internal_registration(uuid, uuid, uuid, text) to anon, authenticated;
grant execute on function public.reject_internal_registration(uuid, uuid, text) to anon, authenticated;
grant execute on function public.delete_admin_employee(uuid, uuid, text) to anon, authenticated;
grant execute on function public.reset_admin_employee_password(uuid, uuid, text) to anon, authenticated;
grant execute on function public.save_admin_service(bigint, text, text, text, integer, boolean, uuid, text) to anon, authenticated;
grant execute on function public.delete_admin_service(bigint, uuid, text) to anon, authenticated;
grant execute on function public.save_admin_employee_availability(text, uuid, date, time without time zone, time without time zone, boolean, uuid, text) to anon, authenticated;
grant execute on function public.delete_admin_employee_availability(text, uuid, text) to anon, authenticated;
grant execute on function public.create_admin_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text) to anon, authenticated;
grant execute on function public.create_internal_employee_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text) to anon, authenticated;
grant execute on function public.cancel_booking(uuid, uuid, text) to anon, authenticated;
grant execute on function public.assign_admin_booking_employee(uuid, uuid, uuid, text) to anon, authenticated;
grant execute on function public.list_internal_employee_availability(uuid, text) to anon, authenticated;
grant execute on function public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean, text) to anon, authenticated;
grant execute on function public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean, text) to anon, authenticated;
grant execute on function public.delete_internal_employee_availability(uuid, text, text) to anon, authenticated;

commit;