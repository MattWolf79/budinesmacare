-- Archivo consolidado generado desde database/*.sql
-- Uso: ejecutar los 5 archivos consolidados en orden numerico.
-- No reemplaza las migraciones originales; es una copia de portabilidad/bootstrap.
-- Rango incluido: 034-049


-- ============================================================================
-- Source: database/034_multi_tenant_foundation.sql
-- ============================================================================

-- Multi-company foundation for turning Turnos App into a SaaS product.
-- Phase 1 only: creates the first company and backfills existing data.
-- This migration is intentionally backwards compatible: it does not block Google login,
-- does not change existing RPC signatures, and keeps company_id nullable for now.
-- Run after 033_employee_email_notifications.sql on existing databases.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  status text not null default 'active',
  owner_email text,
  contact_email text,
  contact_phone text,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  constraint companies_name_not_blank_chk check (length(trim(name)) > 0),
  constraint companies_slug_chk check (slug = lower(slug) and slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  constraint companies_status_chk check (status in ('pending', 'active', 'suspended', 'cancelled'))
);

create unique index if not exists companies_slug_uidx
  on public.companies(slug);

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

insert into public.companies (name, slug, status)
values ('Estetica Top Body', 'esteticatopbody', 'active')
on conflict (slug) do update set
  name = excluded.name,
  status = case
    when public.companies.status in ('cancelled', 'suspended') then public.companies.status
    else excluded.status
  end,
  updated_at = now();

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role public.app_role not null,
  employee_id uuid references public.employees(id) on delete set null,
  status text not null default 'invited',
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  constraint company_memberships_email_chk check (public.is_valid_email(email)),
  constraint company_memberships_status_chk check (status in ('invited', 'active', 'disabled')),
  constraint company_memberships_employee_role_link_chk check (
    (role = 'employee'::public.app_role and employee_id is not null)
    or (role <> 'employee'::public.app_role)
  )
);

create unique index if not exists company_memberships_company_email_uidx
  on public.company_memberships(company_id, lower(email));

create unique index if not exists company_memberships_company_user_uidx
  on public.company_memberships(company_id, user_id)
  where user_id is not null;

create index if not exists company_memberships_user_id_idx
  on public.company_memberships(user_id);

create index if not exists company_memberships_company_role_status_idx
  on public.company_memberships(company_id, role, status);

drop trigger if exists company_memberships_set_updated_at on public.company_memberships;
create trigger company_memberships_set_updated_at
before update on public.company_memberships
for each row execute function public.set_updated_at();

alter table if exists public.profiles
  add column if not exists company_id uuid;

alter table if exists public.employees
  add column if not exists company_id uuid;

alter table if exists public.services
  add column if not exists company_id uuid;

alter table if exists public.employee_services
  add column if not exists company_id uuid;

alter table if exists public.employee_availability
  add column if not exists company_id uuid;

alter table if exists public.bookings
  add column if not exists company_id uuid;

alter table if exists public.internal_accounts
  add column if not exists company_id uuid;

alter table if exists public.internal_sessions
  add column if not exists company_id uuid;

alter table if exists public.internal_registration_requests
  add column if not exists company_id uuid;

alter table if exists public.app_configuration
  add column if not exists company_id uuid;

alter table if exists public.mail_settings
  add column if not exists company_id uuid;

alter table if exists public.booking_closures
  add column if not exists company_id uuid;

alter table if exists public.booking_closure_items
  add column if not exists company_id uuid;

-- Add foreign keys as NOT VALID so this foundation can run safely on existing data.
-- A later hardening migration can VALIDATE them and then make company_id required.
alter table if exists public.profiles
  drop constraint if exists profiles_company_id_fkey;
alter table if exists public.profiles
  add constraint profiles_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict not valid;

alter table if exists public.employees
  drop constraint if exists employees_company_id_fkey;
alter table if exists public.employees
  add constraint employees_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict not valid;

alter table if exists public.services
  drop constraint if exists services_company_id_fkey;
alter table if exists public.services
  add constraint services_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict not valid;

alter table if exists public.employee_services
  drop constraint if exists employee_services_company_id_fkey;
alter table if exists public.employee_services
  add constraint employee_services_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict not valid;

alter table if exists public.employee_availability
  drop constraint if exists employee_availability_company_id_fkey;
alter table if exists public.employee_availability
  add constraint employee_availability_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict not valid;

alter table if exists public.bookings
  drop constraint if exists bookings_company_id_fkey;
alter table if exists public.bookings
  add constraint bookings_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict not valid;

alter table if exists public.internal_accounts
  drop constraint if exists internal_accounts_company_id_fkey;
alter table if exists public.internal_accounts
  add constraint internal_accounts_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict not valid;

alter table if exists public.internal_sessions
  drop constraint if exists internal_sessions_company_id_fkey;
alter table if exists public.internal_sessions
  add constraint internal_sessions_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict not valid;

alter table if exists public.internal_registration_requests
  drop constraint if exists internal_registration_requests_company_id_fkey;
alter table if exists public.internal_registration_requests
  add constraint internal_registration_requests_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict not valid;

alter table if exists public.app_configuration
  drop constraint if exists app_configuration_company_id_fkey;
alter table if exists public.app_configuration
  add constraint app_configuration_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict not valid;

alter table if exists public.mail_settings
  drop constraint if exists mail_settings_company_id_fkey;
alter table if exists public.mail_settings
  add constraint mail_settings_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict not valid;

alter table if exists public.booking_closures
  drop constraint if exists booking_closures_company_id_fkey;
alter table if exists public.booking_closures
  add constraint booking_closures_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict not valid;

alter table if exists public.booking_closure_items
  drop constraint if exists booking_closure_items_company_id_fkey;
alter table if exists public.booking_closure_items
  add constraint booking_closure_items_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict not valid;

-- Backfill current single-company data into Estetica Top Body.
with first_company as (
  select id from public.companies where slug = 'esteticatopbody' limit 1
)
update public.profiles
set company_id = first_company.id,
    updated_at = now()
from first_company
where profiles.company_id is null;

with first_company as (
  select id from public.companies where slug = 'esteticatopbody' limit 1
)
update public.employees
set company_id = first_company.id,
    updated_at = now()
from first_company
where employees.company_id is null;

with first_company as (
  select id from public.companies where slug = 'esteticatopbody' limit 1
)
update public.services
set company_id = first_company.id,
    updated_at = now()
from first_company
where services.company_id is null;

with first_company as (
  select id from public.companies where slug = 'esteticatopbody' limit 1
)
update public.employee_services
set company_id = first_company.id
from first_company
where employee_services.company_id is null;

with first_company as (
  select id from public.companies where slug = 'esteticatopbody' limit 1
)
update public.employee_availability
set company_id = first_company.id,
    updated_at = now()
from first_company
where employee_availability.company_id is null;

with first_company as (
  select id from public.companies where slug = 'esteticatopbody' limit 1
)
update public.bookings
set company_id = first_company.id,
    updated_at = now()
from first_company
where bookings.company_id is null;

with first_company as (
  select id from public.companies where slug = 'esteticatopbody' limit 1
)
update public.internal_accounts
set company_id = first_company.id,
    updated_at = now()
from first_company
where internal_accounts.company_id is null
  and not exists (
    select 1
    from public.internal_accounts existing
    where existing.company_id = first_company.id
      and existing.username_normalized = internal_accounts.username_normalized
  );

with first_company as (
  select id from public.companies where slug = 'esteticatopbody' limit 1
)
update public.internal_sessions
set company_id = first_company.id
from first_company
where internal_sessions.company_id is null;

with first_company as (
  select id from public.companies where slug = 'esteticatopbody' limit 1
)
update public.internal_registration_requests
set company_id = first_company.id
from first_company
where internal_registration_requests.company_id is null;

with first_company as (
  select id from public.companies where slug = 'esteticatopbody' limit 1
)
update public.app_configuration
set company_id = first_company.id,
    company_name = case
      when company_name is null or trim(company_name) = '' or company_name = 'Turnos App' then 'Estetica Top Body'
      else company_name
    end,
    updated_at = now()
from first_company
where app_configuration.company_id is null;

with first_company as (
  select id from public.companies where slug = 'esteticatopbody' limit 1
)
update public.mail_settings
set company_id = first_company.id,
    updated_at = now()
from first_company
where mail_settings.company_id is null;

with first_company as (
  select id from public.companies where slug = 'esteticatopbody' limit 1
)
update public.booking_closures
set company_id = first_company.id
from first_company
where booking_closures.company_id is null;

with first_company as (
  select id from public.companies where slug = 'esteticatopbody' limit 1
)
update public.booking_closure_items items
set company_id = coalesce(closures.company_id, first_company.id)
from first_company, public.booking_closures closures
where closures.id = items.closure_id
  and items.company_id is null;

with first_company as (
  select id from public.companies where slug = 'esteticatopbody' limit 1
)
update public.booking_closure_items
set company_id = first_company.id
from first_company
where booking_closure_items.company_id is null;

-- Create active memberships for existing Google/Supabase profiles.
with first_company as (
  select id from public.companies where slug = 'esteticatopbody' limit 1
), profile_rows as (
  select distinct on (first_company.id, lower(trim(profiles.email)))
    first_company.id as company_id,
    profiles.user_id,
    lower(trim(profiles.email)) as email,
    profiles.role,
    profiles.employee_id
  from public.profiles profiles
  cross join first_company
  where profiles.user_id is not null
    and public.is_valid_email(profiles.email)
  order by first_company.id, lower(trim(profiles.email)), profiles.updated_at desc nulls last, profiles.created_at desc nulls last
)
insert into public.company_memberships (company_id, user_id, email, role, employee_id, status)
select company_id, user_id, email, role, employee_id, 'active'
from profile_rows
on conflict (company_id, lower(email)) do update set
  user_id = coalesce(public.company_memberships.user_id, excluded.user_id),
  role = excluded.role,
  employee_id = excluded.employee_id,
  status = 'active',
  updated_at = now();

-- Create invited memberships for active internal accounts when an employee email exists.
with first_company as (
  select id from public.companies where slug = 'esteticatopbody' limit 1
), internal_rows as (
  select distinct on (first_company.id, lower(trim(employees.email)))
    first_company.id as company_id,
    lower(trim(employees.email)) as email,
    accounts.role,
    accounts.employee_id
  from public.internal_accounts accounts
  cross join first_company
  left join public.employees employees
    on employees.id = accounts.employee_id
  where accounts.active = true
    and public.is_valid_email(employees.email)
  order by first_company.id, lower(trim(employees.email)), accounts.updated_at desc nulls last, accounts.created_at desc nulls last
)
insert into public.company_memberships (company_id, email, role, employee_id, status)
select company_id, email, role, employee_id, 'invited'
from internal_rows
on conflict (company_id, lower(email)) do update set
  role = excluded.role,
  employee_id = excluded.employee_id,
  updated_at = now();

create index if not exists profiles_company_id_idx
  on public.profiles(company_id);

create index if not exists employees_company_id_idx
  on public.employees(company_id);

create index if not exists services_company_id_idx
  on public.services(company_id);

create index if not exists employee_services_company_id_idx
  on public.employee_services(company_id);

create index if not exists employee_availability_company_id_idx
  on public.employee_availability(company_id);

create index if not exists bookings_company_id_idx
  on public.bookings(company_id);

create index if not exists bookings_company_start_idx
  on public.bookings(company_id, start_at);

create index if not exists internal_accounts_company_id_idx
  on public.internal_accounts(company_id);

create index if not exists internal_sessions_company_id_idx
  on public.internal_sessions(company_id);

create index if not exists internal_registration_requests_company_id_idx
  on public.internal_registration_requests(company_id);

create index if not exists app_configuration_company_id_idx
  on public.app_configuration(company_id);

create index if not exists mail_settings_company_id_idx
  on public.mail_settings(company_id);

create index if not exists booking_closures_company_id_idx
  on public.booking_closures(company_id);

create index if not exists booking_closure_items_company_id_idx
  on public.booking_closure_items(company_id);

create or replace function public.get_primary_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.companies
  where slug = 'esteticatopbody'
  limit 1
$$;

create or replace function public.get_company_public_context(slug_value text default 'esteticatopbody')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'id', companies.id,
      'name', companies.name,
      'slug', companies.slug,
      'status', companies.status,
      'active', companies.status = 'active'
    )
    from public.companies companies
    where companies.slug = lower(trim(coalesce(slug_value, 'esteticatopbody')))
    limit 1
  ), jsonb_build_object(
    'id', null,
    'name', null,
    'slug', lower(trim(coalesce(slug_value, ''))),
    'status', 'not_found',
    'active', false
  ))
$$;

alter table public.companies enable row level security;
alter table public.company_memberships enable row level security;

drop policy if exists "companies_public_active_read" on public.companies;
drop policy if exists "companies_no_direct_insert" on public.companies;
drop policy if exists "companies_no_direct_update" on public.companies;
drop policy if exists "companies_no_direct_delete" on public.companies;

create policy "companies_public_active_read"
  on public.companies
  for select
  using (status = 'active');

create policy "companies_no_direct_insert"
  on public.companies
  for insert
  with check (false);

create policy "companies_no_direct_update"
  on public.companies
  for update
  using (false)
  with check (false);

create policy "companies_no_direct_delete"
  on public.companies
  for delete
  using (false);

drop policy if exists "company_memberships_own_read" on public.company_memberships;
drop policy if exists "company_memberships_no_direct_insert" on public.company_memberships;
drop policy if exists "company_memberships_no_direct_update" on public.company_memberships;
drop policy if exists "company_memberships_no_direct_delete" on public.company_memberships;

create policy "company_memberships_own_read"
  on public.company_memberships
  for select
  using (user_id = auth.uid());

create policy "company_memberships_no_direct_insert"
  on public.company_memberships
  for insert
  with check (false);

create policy "company_memberships_no_direct_update"
  on public.company_memberships
  for update
  using (false)
  with check (false);

create policy "company_memberships_no_direct_delete"
  on public.company_memberships
  for delete
  using (false);

revoke all on public.companies from public;
revoke all on public.company_memberships from public;

grant select on public.companies to anon, authenticated;
grant select on public.company_memberships to authenticated;
grant execute on function public.get_primary_company_id() to anon, authenticated;
grant execute on function public.get_company_public_context(text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/035_booking_email_links_and_reminders.sql
-- ============================================================================

-- Improve booking email notifications with action links and 24-hour reminders.
-- Run after 034_multi_tenant_foundation.sql on existing databases.

begin;

alter table public.mail_settings
  add column if not exists app_url text not null default 'https://quieroturnoapp.com.ar';

alter table public.mail_settings
  drop constraint if exists mail_settings_app_url_chk;

alter table public.mail_settings
  add constraint mail_settings_app_url_chk check (app_url ~* '^https?://[^[:space:]]+$');

update public.mail_settings
set app_url = 'https://quieroturnoapp.com.ar',
    updated_at = now()
where id = true
  and (app_url is null or trim(app_url) = '' or app_url like 'http://localhost%');

alter table public.bookings
  add column if not exists client_reminder_sent_at timestamp without time zone;

create index if not exists bookings_client_reminder_due_idx
  on public.bookings(start_at)
  where client_reminder_sent_at is null
    and status in ('reserved', 'confirmed')
    and employee_id is not null;

create or replace function public.html_escape(value text)
returns text
language sql
immutable
as $$
  select replace(
    replace(
      replace(
        replace(
          replace(coalesce(value, ''), '&', '&amp;'),
          '<', '&lt;'),
        '>', '&gt;'),
      '"', '&quot;'),
    '''', '&#39;')
$$;

create or replace function public.get_mail_app_url()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim((select app_url from public.mail_settings where id = true limit 1)), ''),
    'https://quieroturnoapp.com.ar'
  )
$$;

create or replace function public.build_mail_app_link(hash_value text default '')
returns text
language sql
stable
security definer
set search_path = public
as $$
  select regexp_replace(public.get_mail_app_url(null::uuid), '/+$', '') || '/' ||
    case
      when nullif(trim(coalesce(hash_value, '')), '') is null then ''
      when left(trim(hash_value), 1) = '#' then trim(hash_value)
      else '#' || trim(hash_value)
    end
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
declare
  clean_to_email text := lower(trim(coalesce(to_email_value, '')));
  clean_reply_to text := lower(trim(coalesce(reply_to_value, '')));
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
  from_name_value text default 'Quiero Turno App - No responder',
  reply_to_value text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.send_resend_email(
    to_email_value,
    subject_value,
    message_value,
    from_name_value,
    reply_to_value,
    null
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
  activity_name text;
  client_name text;
  event_intro text;
  badge_label text;
  clean_cta_label text := nullif(trim(coalesce(cta_label, '')), '');
  clean_cta_url text := nullif(trim(coalesce(cta_url, '')), '');
begin
  select services.name into service_name
  from public.services services
  where services.id = booking_value.service;

  select coalesce(nullif(trim(concat_ws(' ', employees.first_name, employees.last_name)), ''), employees.name)
  into employee_name
  from public.employees employees
  where employees.id = booking_value.employee_id;

  activity_name := coalesce(nullif(booking_value.booking_description, ''), service_name, 'Turno');
  client_name := coalesce(nullif(booking_value.customer_name, ''), nullif(booking_value.user_email, ''), 'Cliente sin datos');

  event_intro := case
    when event_label ilike '%recordatorio%' then 'Te esperamos pronto. Te dejamos los datos del turno para que los tengas a mano.'
    when event_label ilike '%confirmado%' then 'Tu reserva ya tiene profesional asignado. GuardÃ¡ este detalle para llegar con tranquilidad.'
    when event_label ilike '%pendiente%' then 'Hay una solicitud esperando asignaciÃ³n de empleado. Revisala desde la agenda para confirmar el turno.'
    when event_label ilike '%asignado%' then 'Se agregÃ³ un nuevo turno a tu agenda laboral. RevisÃ¡ los datos antes de la atenciÃ³n.'
    when event_label ilike '%cancelÃ³%' then 'Te avisamos que este turno fue cancelado y ya no figura como atenciÃ³n pendiente.'
    else 'Te compartimos el detalle actualizado del turno.'
  end;

  badge_label := case
    when event_label ilike '%recordatorio%' then 'Recordatorio'
    when event_label ilike '%confirmado%' then 'ConfirmaciÃ³n'
    when event_label ilike '%pendiente%' then 'AcciÃ³n requerida'
    when event_label ilike '%asignado%' then 'Agenda'
    when event_label ilike '%cancelÃ³%' then 'CancelaciÃ³n'
    else 'Quiero Turno App'
  end;

  return '<div style="margin:0;padding:0;background:#eef7f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937">'
    || '<div style="display:none;max-height:0;overflow:hidden;color:#eef7f8">' || public.html_escape(event_intro) || '</div>'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#eef7f8;padding:0;margin:0"><tr><td align="center" style="padding:28px 12px">'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:620px;background:#ffffff;border:1px solid #d6e7ea;border-radius:16px;overflow:hidden;box-shadow:0 14px 34px rgba(15,23,42,0.10)">'
    || '<tr><td style="padding:24px 26px;background:#26313a;color:#ffffff">'
    || '<div style="font-size:12px;line-height:1;text-transform:uppercase;letter-spacing:.08em;color:#8de1e8;font-weight:700">Quiero Turno</div>'
    || '<div style="margin-top:12px;display:inline-block;border:1px solid rgba(141,225,232,.55);border-radius:999px;padding:6px 10px;color:#dffcff;background:rgba(36,174,187,.16);font-size:12px;font-weight:700">' || public.html_escape(badge_label) || '</div>'
    || '<h1 style="margin:14px 0 0;color:#ffffff;font-size:24px;line-height:1.22;font-weight:800">' || public.html_escape(event_label) || '</h1>'
    || '<p style="margin:10px 0 0;color:#d7e4e8;font-size:15px;line-height:1.55">' || public.html_escape(event_intro) || '</p>'
    || '</td></tr>'
    || '<tr><td style="padding:24px 26px 8px">'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;width:100%">'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Cliente</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(client_name) || '</td></tr>'
    || case when public.is_valid_email(booking_value.user_email) then '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Mail</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(booking_value.user_email) || '</td></tr>' else '' end
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Servicio</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(activity_name) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Empleado</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(coalesce(employee_name, 'Pendiente de asignaciÃ³n')) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Inicio</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(to_char(booking_value.start_at, 'DD/MM/YYYY HH24:MI')) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Fin</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(to_char(booking_value.end_at, 'DD/MM/YYYY HH24:MI')) || '</td></tr>'
    || '</table>'
    || case when clean_cta_label is not null and clean_cta_url is not null then
      '<div style="padding:10px 0 22px;text-align:center"><a href="' || public.html_escape(clean_cta_url) || '" style="display:inline-block;background:#24aebb;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 20px;font-size:15px;font-weight:800;box-shadow:0 8px 18px rgba(36,174,187,.22)">' || public.html_escape(clean_cta_label) || '</a></div>'
      else '' end
    || '</td></tr>'
    || '<tr><td style="padding:18px 26px;background:#f6fbfc;border-top:1px solid #e3edf0;color:#64748b;font-size:13px;line-height:1.5;text-align:center">Este es un mensaje automÃ¡tico de Quiero Turno. No respondas este mail.</td></tr>'
    || '</table>'
    || '</td></tr></table>'
    || '</div>';
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
  employee_agenda_url text := public.build_mail_app_link('employee-agenda');
  admin_assignment_url text := public.build_mail_app_link('admin-agenda');
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
        where employees.active is not false
          and employees.deleted_at is null
          and public.is_valid_email(employees.email)
      loop
        perform public.send_resend_email(employee_email, 'Hay un turno pendiente para asignar', admin_message, 'Quiero Turno App - No responder', NEW.user_email, admin_html);
      end loop;
    end if;

    if NEW.employee_id is not null then
      if public.is_valid_email(NEW.user_email) then
        client_message := public.format_booking_notification_message(NEW, 'Tu turno fue confirmado.');
        client_html := public.format_booking_notification_html(NEW, 'Tu turno fue confirmado.');
        perform public.send_resend_email(NEW.user_email, 'Tu turno fue confirmado', client_message, 'Quiero Turno App - No responder', null, client_html);
      end if;

      select employees.email into employee_email
      from public.employees employees
      where employees.id = NEW.employee_id;

      employee_message := public.format_booking_notification_message(NEW, 'TenÃ©s un nuevo turno asignado.') || E'\n\nIr a Agenda: ' || employee_agenda_url;
      employee_html := public.format_booking_notification_html(NEW, 'TenÃ©s un nuevo turno asignado.', 'Ir a Agenda', employee_agenda_url);
      perform public.send_resend_email(employee_email, 'TenÃ©s un nuevo turno asignado', employee_message, 'Quiero Turno App - No responder', NEW.user_email, employee_html);
    end if;
  end if;

  if TG_OP = 'UPDATE'
    and NEW.status in ('reserved', 'confirmed')
    and NEW.employee_id is not null
    and (OLD.employee_id is distinct from NEW.employee_id or OLD.status = 'pending_assignment') then
    if public.is_valid_email(NEW.user_email) then
      client_message := public.format_booking_notification_message(NEW, 'Tu turno fue confirmado.');
      client_html := public.format_booking_notification_html(NEW, 'Tu turno fue confirmado.');
      perform public.send_resend_email(NEW.user_email, 'Tu turno fue confirmado', client_message, 'Quiero Turno App - No responder', null, client_html);
    end if;

    select employees.email into employee_email
    from public.employees employees
    where employees.id = NEW.employee_id;

    employee_message := public.format_booking_notification_message(NEW, 'TenÃ©s un nuevo turno asignado.') || E'\n\nIr a Agenda: ' || employee_agenda_url;
    employee_html := public.format_booking_notification_html(NEW, 'TenÃ©s un nuevo turno asignado.', 'Ir a Agenda', employee_agenda_url);
    perform public.send_resend_email(employee_email, 'TenÃ©s un nuevo turno asignado', employee_message, 'Quiero Turno App - No responder', NEW.user_email, employee_html);
  end if;

  if TG_OP = 'UPDATE'
    and NEW.status = 'cancelled'
    and OLD.status is distinct from NEW.status
    and NEW.employee_id is not null then
    select employees.email into employee_email
    from public.employees employees
    where employees.id = NEW.employee_id;

    employee_message := public.format_booking_notification_message(NEW, 'Se cancelÃ³ este turno.') || E'\n\nIr a Agenda: ' || employee_agenda_url;
    employee_html := public.format_booking_notification_html(NEW, 'Se cancelÃ³ este turno.', 'Ir a Agenda', employee_agenda_url);
    perform public.send_resend_email(employee_email, 'Se cancelÃ³ un turno', employee_message, 'Quiero Turno App - No responder', NEW.user_email, employee_html);
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
    reminder_message := public.format_booking_notification_message(booking_record, 'Recordatorio: tenÃ©s un turno reservado para maÃ±ana.');
    reminder_html := public.format_booking_notification_html(booking_record, 'Recordatorio: tenÃ©s un turno reservado para maÃ±ana.');

    perform public.send_resend_email(
      booking_record.user_email,
      'Recordatorio de turno',
      reminder_message,
      'Quiero Turno App - No responder',
      null,
      reminder_html
    );

    update public.bookings
    set client_reminder_sent_at = now()
    where id = booking_record.id;

    sent_count := sent_count + 1;
  end loop;

  return sent_count;
end;
$$;

revoke execute on function public.html_escape(text) from public;
revoke execute on function public.get_mail_app_url() from public;
revoke execute on function public.build_mail_app_link(text) from public;
revoke execute on function public.send_resend_email(text, text, text, text, text, text) from public;
revoke execute on function public.format_booking_notification_html(public.bookings, text, text, text) from public;
revoke execute on function public.send_due_booking_reminders() from public;

grant execute on function public.send_due_booking_reminders() to service_role;

commit;


-- ============================================================================
-- Source: database/035a_update_email_template_design.sql
-- ============================================================================


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
  activity_name text;
  client_name text;
  event_intro text;
  badge_label text;
  clean_cta_label text := nullif(trim(coalesce(cta_label, '')), '');
  clean_cta_url text := nullif(trim(coalesce(cta_url, '')), '');
begin
  select services.name into service_name
  from public.services services
  where services.id = booking_value.service;

  select coalesce(nullif(trim(concat_ws(' ', employees.first_name, employees.last_name)), ''), employees.name)
  into employee_name
  from public.employees employees
  where employees.id = booking_value.employee_id;

  activity_name := coalesce(nullif(booking_value.booking_description, ''), service_name, 'Turno');
  client_name := coalesce(nullif(booking_value.customer_name, ''), nullif(booking_value.user_email, ''), 'Cliente sin datos');

  event_intro := case
    when event_label ilike '%recordatorio%' then 'Te esperamos pronto. Te dejamos los datos del turno para que los tengas a mano.'
    when event_label ilike '%confirmado%' then 'Tu reserva ya tiene profesional asignado. GuardÃ¡ este detalle para llegar con tranquilidad.'
    when event_label ilike '%pendiente%' then 'Hay una solicitud esperando asignaciÃ³n de empleado. Revisala desde la agenda para confirmar el turno.'
    when event_label ilike '%asignado%' then 'Se agregÃ³ un nuevo turno a tu agenda laboral. RevisÃ¡ los datos antes de la atenciÃ³n.'
    when event_label ilike '%cancelÃ³%' then 'Te avisamos que este turno fue cancelado y ya no figura como atenciÃ³n pendiente.'
    else 'Te compartimos el detalle actualizado del turno.'
  end;

  badge_label := case
    when event_label ilike '%recordatorio%' then 'Recordatorio'
    when event_label ilike '%confirmado%' then 'ConfirmaciÃ³n'
    when event_label ilike '%pendiente%' then 'AcciÃ³n requerida'
    when event_label ilike '%asignado%' then 'Agenda'
    when event_label ilike '%cancelÃ³%' then 'CancelaciÃ³n'
    else 'Quiero Turno App'
  end;

  return '<div style="margin:0;padding:0;background:#eef7f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937">'
    || '<div style="display:none;max-height:0;overflow:hidden;color:#eef7f8">' || public.html_escape(event_intro) || '</div>'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#eef7f8;padding:0;margin:0"><tr><td align="center" style="padding:28px 12px">'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:620px;background:#ffffff;border:1px solid #d6e7ea;border-radius:16px;overflow:hidden;box-shadow:0 14px 34px rgba(15,23,42,0.10)">'
    || '<tr><td style="padding:24px 26px;background:#26313a;color:#ffffff">'
    || '<div style="font-size:12px;line-height:1;text-transform:uppercase;letter-spacing:.08em;color:#8de1e8;font-weight:700">Quiero Turno</div>'
    || '<div style="margin-top:12px;display:inline-block;border:1px solid rgba(141,225,232,.55);border-radius:999px;padding:6px 10px;color:#dffcff;background:rgba(36,174,187,.16);font-size:12px;font-weight:700">' || public.html_escape(badge_label) || '</div>'
    || '<h1 style="margin:14px 0 0;color:#ffffff;font-size:24px;line-height:1.22;font-weight:800">' || public.html_escape(event_label) || '</h1>'
    || '<p style="margin:10px 0 0;color:#d7e4e8;font-size:15px;line-height:1.55">' || public.html_escape(event_intro) || '</p>'
    || '</td></tr>'
    || '<tr><td style="padding:24px 26px 8px">'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;width:100%">'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Cliente</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(client_name) || '</td></tr>'
    || case when public.is_valid_email(booking_value.user_email) then '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Mail</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(booking_value.user_email) || '</td></tr>' else '' end
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Servicio</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(activity_name) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Empleado</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(coalesce(employee_name, 'Pendiente de asignaciÃ³n')) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Inicio</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(to_char(booking_value.start_at, 'DD/MM/YYYY HH24:MI')) || '</td></tr>'
    || '<tr><td style="width:42%;padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-right:0;border-radius:10px 0 0 10px;color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Fin</td><td style="padding:12px 14px;background:#f8fafc;border:1px solid #e3edf0;border-left:0;border-radius:0 10px 10px 0;color:#0f172a;font-size:15px;font-weight:700">' || public.html_escape(to_char(booking_value.end_at, 'DD/MM/YYYY HH24:MI')) || '</td></tr>'
    || '</table>'
    || case when clean_cta_label is not null and clean_cta_url is not null then
      '<div style="padding:10px 0 22px;text-align:center"><a href="' || public.html_escape(clean_cta_url) || '" style="display:inline-block;background:#24aebb;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 20px;font-size:15px;font-weight:800;box-shadow:0 8px 18px rgba(36,174,187,.22)">' || public.html_escape(clean_cta_label) || '</a></div>'
      else '' end
    || '</td></tr>'
    || '<tr><td style="padding:18px 26px;background:#f6fbfc;border-top:1px solid #e3edf0;color:#64748b;font-size:13px;line-height:1.5;text-align:center">Este es un mensaje automÃ¡tico de Quiero Turno. No respondas este mail.</td></tr>'
    || '</table>'
    || '</td></tr></table>'
    || '</div>';
end;
$$;


-- ============================================================================
-- Source: database/036_mail_sender_and_services_copy.sql
-- ============================================================================

-- Update email sender and visible email copy from Actividades to Servicios.
-- Run after 035_booking_email_links_and_reminders.sql on existing databases.

begin;

update public.mail_settings
set from_name = 'Quiero Turno App - No responder',
    updated_at = now()
where id = true;

do $$
declare
  function_identity regprocedure;
  original_sql text;
  updated_sql text;
begin
  foreach function_identity in array array[
    to_regprocedure('public.send_resend_email(text,text,text,text,text,text)'),
    to_regprocedure('public.send_resend_email(text,text,text,text,text)'),
    to_regprocedure('public.format_booking_notification_message(public.bookings,text)'),
    to_regprocedure('public.format_booking_notification_html(public.bookings,text,text,text)'),
    to_regprocedure('public.send_booking_email_notifications()'),
    to_regprocedure('public.send_due_booking_reminders()')
  ]
  loop
    if function_identity is null then
      continue;
    end if;

    original_sql := pg_get_functiondef(function_identity);
    updated_sql := replace(original_sql, 'Turnos App - No responder', 'Quiero Turno App - No responder');
    updated_sql := replace(updated_sql, 'Turnos App', 'Quiero Turno App');
    updated_sql := replace(updated_sql, 'Actividad:', 'Servicio:');
    updated_sql := replace(updated_sql, '>Actividad</td>', '>Servicio</td>');
    updated_sql := replace(updated_sql, 'Solo un administrador puede guardar actividades.', 'Solo un administrador puede guardar servicios.');
    updated_sql := replace(updated_sql, 'IngresÃ¡ el nombre de la actividad.', 'IngresÃ¡ el nombre del servicio.');
    updated_sql := replace(updated_sql, 'Ingresa el nombre de la actividad.', 'Ingresa el nombre del servicio.');
    updated_sql := replace(updated_sql, 'La duraciÃ³n de la actividad debe ser mayor a cero.', 'La duraciÃ³n del servicio debe ser mayor a cero.');
    updated_sql := replace(updated_sql, 'La duracion de la actividad debe ser mayor a cero.', 'La duracion del servicio debe ser mayor a cero.');
    updated_sql := replace(updated_sql, 'La actividad no existe.', 'El servicio no existe.');
    updated_sql := replace(updated_sql, 'Solo un administrador puede eliminar actividades.', 'Solo un administrador puede eliminar servicios.');
    updated_sql := replace(updated_sql, 'No se puede eliminar una actividad con turnos cargados. PodÃ©s desactivarla para que no se ofrezca mÃ¡s.', 'No se puede eliminar un servicio con turnos cargados. PodÃ©s desactivarlo para que no se ofrezca mÃ¡s.');
    updated_sql := replace(updated_sql, 'El empleado no esta vinculado a esa actividad.', 'El empleado no esta vinculado a ese servicio.');
    updated_sql := replace(updated_sql, 'El empleado no estÃ¡ vinculado a esa actividad.', 'El empleado no estÃ¡ vinculado a ese servicio.');
    updated_sql := replace(updated_sql, 'SeleccionÃ¡ una actividad o promociÃ³n.', 'SeleccionÃ¡ un servicio o promociÃ³n.');
    updated_sql := replace(updated_sql, 'La actividad seleccionada no estÃ¡ disponible.', 'El servicio seleccionado no estÃ¡ disponible.');
    updated_sql := replace(updated_sql, '''Actividad''', '''Servicio''');

    if updated_sql is distinct from original_sql then
      execute updated_sql;
    end if;
  end loop;
end;
$$;

commit;


-- ============================================================================
-- Source: database/037_force_quiero_turno_mail_sender.sql
-- ============================================================================

-- Force existing email functions/settings to use Quiero Turno App as sender/brand.
-- Run once after 035_booking_email_links_and_reminders.sql.

begin;

update public.mail_settings
set from_name = 'Quiero Turno App - No responder',
    updated_at = now()
where id = true;

do $$
declare
  function_identity regprocedure;
  original_sql text;
  updated_sql text;
begin
  foreach function_identity in array array[
    to_regprocedure('public.send_resend_email(text,text,text,text,text,text)'),
    to_regprocedure('public.send_resend_email(text,text,text,text,text)'),
    to_regprocedure('public.notify_admin_emails(text,text,text)'),
    to_regprocedure('public.format_booking_notification_html(public.bookings,text,text,text)'),
    to_regprocedure('public.send_booking_email_notifications()'),
    to_regprocedure('public.send_due_booking_reminders()')
  ]
  loop
    if function_identity is null then
      continue;
    end if;

    original_sql := pg_get_functiondef(function_identity);
    updated_sql := replace(original_sql, 'Turnos App - No responder', 'Quiero Turno App - No responder');
    updated_sql := replace(updated_sql, '''Turnos App''', '''Quiero Turno App''');
    updated_sql := replace(updated_sql, '>Turnos App<', '>Quiero Turno App<');

    if updated_sql is distinct from original_sql then
      execute updated_sql;
    end if;
  end loop;
end;
$$;

commit;

select from_name
from public.mail_settings
where id = true;


-- ============================================================================
-- Source: database/038_client_promotion_availability_guard.sql
-- ============================================================================

-- Require client promotion requests to respect employee availability, like regular services.
-- Run after 037_force_quiero_turno_mail_sender.sql on existing databases.

begin;

create or replace function public.request_client_booking(
  service_id_value bigint default null,
  employee_id_value uuid default null,
  booking_description_value text default null,
  start_at_value timestamp without time zone default null,
  end_at_value timestamp without time zone default null,
  customer_name_value text default null,
  customer_email_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_booking public.bookings%rowtype;
  next_status text := case when employee_id_value is null then 'pending_assignment' else 'confirmed' end;
  clean_booking_description text := nullif(trim(coalesce(booking_description_value, '')), '');
  clean_customer_email text := nullif(trim(coalesce(customer_email_value, '')), '');
  selected_promotion jsonb;
begin
  if auth.uid() is null then
    raise exception 'IniciÃ¡ sesiÃ³n para solicitar un turno.';
  end if;

  if start_at_value is null or end_at_value is null or end_at_value <= start_at_value then
    raise exception 'El horario seleccionado no es vÃ¡lido.';
  end if;

  if start_at_value < localtimestamp then
    raise exception 'No se pueden solicitar turnos en horarios pasados.';
  end if;

  if service_id_value is null and clean_booking_description is null then
    raise exception 'SeleccionÃ¡ un servicio o promociÃ³n.';
  end if;

  if service_id_value is not null and not exists (
    select 1
    from public.services services
    where services.id = service_id_value
      and services.active is not false
  ) then
    raise exception 'El servicio seleccionado no estÃ¡ disponible.';
  end if;

  if service_id_value is null then
    select promotion
    into selected_promotion
    from public.app_configuration configuration,
      jsonb_array_elements(coalesce(configuration.promotions, '[]'::jsonb)) promotion
    where configuration.id = true
      and coalesce((promotion->>'enabled')::boolean, false) is true
      and nullif(trim(concat_ws(
        ' Â· ',
        nullif(trim(coalesce(promotion->>'title', '')), ''),
        nullif(trim(coalesce(promotion->>'description', '')), ''),
        nullif(trim(coalesce(promotion->>'value', '')), '')
      )), '') = clean_booking_description
    limit 1;

    if selected_promotion is null then
      raise exception 'La promociÃ³n seleccionada no estÃ¡ disponible.';
    end if;
  end if;

  if exists (
    select 1
    from public.bookings bookings
    where bookings.status in ('reserved', 'confirmed', 'pending_assignment')
      and bookings.start_at < end_at_value
      and bookings.end_at > start_at_value
      and (
        bookings.user_id = auth.uid()
        or (
          clean_customer_email is not null
          and lower(coalesce(bookings.user_email, '')) = lower(clean_customer_email)
        )
      )
    limit 1
  ) then
    raise exception 'Ya tenÃ©s un turno o solicitud en ese horario.';
  end if;

  if employee_id_value is null then
    if service_id_value is not null and not exists (
      select 1
      from public.employee_services relations
      join public.employees employees on employees.id = relations.employee_id
      join public.employee_availability availability on availability.employee_id = employees.id
      where relations.service_id = service_id_value
        and employees.active is true
        and employees.deleted_at is null
        and availability.active is true
        and availability.available_date = start_at_value::date
        and availability.start_time <= start_at_value::time
        and availability.end_time >= end_at_value::time
        and not exists (
          select 1
          from public.bookings bookings
          where bookings.employee_id = employees.id
            and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
            and bookings.start_at < end_at_value
            and bookings.end_at > start_at_value
        )
      limit 1
    ) then
      raise exception 'No hay disponibilidad para ese servicio en ese horario.';
    end if;

    if service_id_value is null and not exists (
      select 1
      from jsonb_array_elements_text(coalesce(selected_promotion->'employeeIds', '[]'::jsonb)) promotion_employees(employee_id_text)
      join public.employees employees on employees.id = promotion_employees.employee_id_text::uuid
      join public.employee_availability availability on availability.employee_id = employees.id
      where employees.active is true
        and employees.deleted_at is null
        and availability.active is true
        and availability.available_date = start_at_value::date
        and availability.start_time <= start_at_value::time
        and availability.end_time >= end_at_value::time
        and not exists (
          select 1
          from public.bookings bookings
          where bookings.employee_id = employees.id
            and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
            and bookings.start_at < end_at_value
            and bookings.end_at > start_at_value
        )
      limit 1
    ) then
      raise exception 'No hay disponibilidad para esa promociÃ³n en ese horario.';
    end if;
  end if;

  if employee_id_value is not null then
    if not exists (
      select 1
      from public.employees employees
      where employees.id = employee_id_value
        and employees.active is true
        and employees.deleted_at is null
    ) then
      raise exception 'El empleado seleccionado no estÃ¡ disponible.';
    end if;

    if service_id_value is not null and not exists (
      select 1
      from public.employee_services relations
      where relations.employee_id = employee_id_value
        and relations.service_id = service_id_value
    ) then
      raise exception 'El empleado no estÃ¡ vinculado a ese servicio.';
    end if;

    if not exists (
      select 1
      from public.employee_availability availability
      where availability.employee_id = employee_id_value
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
      where bookings.employee_id = employee_id_value
        and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
        and bookings.start_at < end_at_value
        and bookings.end_at > start_at_value
      limit 1
    ) then
      raise exception 'El empleado ya tiene un turno en ese horario.';
    end if;
  end if;

  insert into public.bookings (
    user_id,
    user_email,
    customer_name,
    service,
    employee_id,
    booking_description,
    start_at,
    end_at,
    status
  ) values (
    auth.uid(),
    clean_customer_email,
    nullif(trim(coalesce(customer_name_value, '')), ''),
    service_id_value,
    employee_id_value,
    clean_booking_description,
    start_at_value,
    end_at_value,
    next_status
  )
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

revoke execute on function public.request_client_booking(bigint, uuid, text, timestamp without time zone, timestamp without time zone, text, text) from public;
grant execute on function public.request_client_booking(bigint, uuid, text, timestamp without time zone, timestamp without time zone, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/039_multi_tenant_client_context.sql
-- ============================================================================

-- Phase 2 multi-company client context and tenant-aware public RPCs.
-- Run after 038_client_promotion_availability_guard.sql.
-- This keeps esteticatopbody as the default tenant for backwards compatibility.

begin;

create or replace function public.get_company_id_by_slug(slug_value text default null)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.companies
  where slug = lower(trim(coalesce(nullif(slug_value, ''), 'esteticatopbody')))
    and status = 'active'
  limit 1
$$;

insert into public.companies (name, slug, status)
values ('Barberia Demo', 'barberia-demo', 'active')
on conflict (slug) do update set
  name = excluded.name,
  status = case
    when public.companies.status in ('cancelled', 'suspended') then public.companies.status
    else excluded.status
  end,
  updated_at = now();

alter table if exists public.app_configuration
  drop constraint if exists app_configuration_singleton_chk;

alter table if exists public.app_configuration
  drop constraint if exists app_configuration_pkey;

alter table if exists public.app_configuration
  drop constraint if exists app_configuration_company_id_key;

alter table if exists public.app_configuration
  add constraint app_configuration_company_id_key unique (company_id);

insert into public.app_configuration (
  id,
  company_id,
  company_name,
  business_hours_text,
  banner_images,
  promotions,
  discounts,
  client_can_choose_employee
)
select
  true,
  companies.id,
  companies.name,
  '',
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  false
from public.companies companies
where companies.slug = 'barberia-demo'
on conflict (company_id) do nothing;

drop function if exists public.get_app_configuration();

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

create or replace function public.get_company_public_context(slug_value text default 'esteticatopbody')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_company as (
    select companies.*
    from public.companies companies
    where companies.slug = lower(trim(coalesce(nullif(slug_value, ''), 'esteticatopbody')))
    limit 1
  ), selected_config as (
    select config.*
    from public.app_configuration config
    join selected_company on selected_company.id = config.company_id
    limit 1
  )
  select coalesce((
    select jsonb_build_object(
      'id', selected_company.id,
      'name', selected_company.name,
      'slug', selected_company.slug,
      'status', selected_company.status,
      'active', selected_company.status = 'active',
      'company_name', coalesce(nullif(selected_config.company_name, ''), selected_company.name),
      'business_hours_text', coalesce(selected_config.business_hours_text, ''),
      'welcome_background_data_url', selected_config.welcome_background_data_url,
      'banner_images', coalesce(selected_config.banner_images, '[]'::jsonb)
    )
    from selected_company
    left join selected_config on true
  ), jsonb_build_object(
    'id', null,
    'name', null,
    'slug', lower(trim(coalesce(slug_value, ''))),
    'status', 'not_found',
    'active', false,
    'company_name', null,
    'business_hours_text', '',
    'welcome_background_data_url', null,
    'banner_images', '[]'::jsonb
  ))
$$;

drop function if exists public.get_client_booking_options();

create or replace function public.get_client_booking_options(company_slug_value text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_company as (
    select public.get_company_id_by_slug(company_slug_value) as id
  )
  select jsonb_build_object(
    'companyId', (select id from selected_company),
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(booking_rows) order by booking_rows.start_at)
      from (
        select bookings.*
        from public.bookings bookings, selected_company
        where bookings.company_id = selected_company.id
          and bookings.status in ('confirmed', 'reserved', 'pending_assignment', 'completed', 'closed')
      ) booking_rows
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(to_jsonb(service_rows) order by service_rows.id)
      from (
        select services.*
        from public.services services, selected_company
        where services.company_id = selected_company.id
          and services.active is not false
        order by services.id
      ) service_rows
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(to_jsonb(employee_rows) order by employee_rows.name)
      from (
        select
          employees.id,
          employees.name,
          employees.first_name,
          employees.last_name,
          employees.photo_url,
          employees.active,
          employees.deleted_at
        from public.employees employees, selected_company
        where employees.company_id = selected_company.id
          and employees.active is not false
          and employees.deleted_at is null
        order by employees.name
      ) employee_rows
    ), '[]'::jsonb),
    'employeeServices', coalesce((
      select jsonb_agg(to_jsonb(relation_rows))
      from (
        select relations.*
        from public.employee_services relations
        join public.services services on services.id = relations.service_id
        join public.employees employees on employees.id = relations.employee_id
        join selected_company on selected_company.id = relations.company_id
        where services.company_id = selected_company.id
          and employees.company_id = selected_company.id
          and services.active is not false
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
        join selected_company on selected_company.id = availability.company_id
        where employees.company_id = selected_company.id
          and availability.active is true
          and employees.active is not false
          and employees.deleted_at is null
      ) availability_rows
    ), '[]'::jsonb)
  )
$$;

drop function if exists public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text);

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
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  next_company_name text := nullif(trim(coalesce(company_name_value, '')), '');
  next_business_hours_text text := trim(coalesce(business_hours_text_value, ''));
  next_banner_images jsonb := coalesce(banner_images_value, '[]'::jsonb);
  next_promotions jsonb := coalesce(promotions_value, '[]'::jsonb);
  next_discounts jsonb := coalesce(discounts_value, '[]'::jsonb);
  banner_image jsonb;
begin
  if target_company_id is null then
    raise exception 'La empresa no estÃ¡ disponible.';
  end if;

  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if next_company_name is null then
    next_company_name := 'Turnos App';
  end if;

  if char_length(next_company_name) > 40 then
    raise exception 'El nombre de la empresa debe tener hasta 40 caracteres.';
  end if;

  if char_length(next_business_hours_text) > 500 then
    raise exception 'El horario de atencion debe tener hasta 500 caracteres.';
  end if;

  if welcome_background_mime_type_value is not null and welcome_background_mime_type_value not in ('image/jpeg', 'image/png') then
    raise exception 'El fondo de bienvenida debe ser JPG o PNG.';
  end if;

  if welcome_background_data_url_value is not null
    and welcome_background_data_url_value not like 'data:image/jpeg;base64,%'
    and welcome_background_data_url_value not like 'data:image/png;base64,%' then
    raise exception 'El fondo de bienvenida debe estar codificado como imagen JPG o PNG.';
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
    raise exception 'Las imagenes del banner deben enviarse como arreglo.';
  end if;

  if jsonb_array_length(next_banner_images) > 4 then
    raise exception 'El carrusel permite hasta 4 imagenes.';
  end if;

  for banner_image in select * from jsonb_array_elements(next_banner_images)
  loop
    if coalesce(banner_image->>'mimeType', '') not in ('image/jpeg', 'image/png') then
      raise exception 'Las imagenes del banner deben ser JPG o PNG.';
    end if;

    if coalesce(banner_image->>'dataUrl', '') not like 'data:image/jpeg;base64,%'
      and coalesce(banner_image->>'dataUrl', '') not like 'data:image/png;base64,%' then
      raise exception 'Las imagenes del banner deben estar codificadas como JPG o PNG.';
    end if;
  end loop;

  if jsonb_typeof(next_promotions) <> 'array' then
    raise exception 'Las promociones deben enviarse como arreglo.';
  end if;

  if jsonb_typeof(next_discounts) <> 'array' then
    raise exception 'Los descuentos deben enviarse como arreglo.';
  end if;

  insert into public.app_configuration (
    id,
    company_id,
    company_name,
    business_hours_text,
    welcome_background_data_url,
    welcome_background_file_name,
    welcome_background_mime_type,
    banner_data_url,
    banner_file_name,
    banner_mime_type,
    banner_images,
    promotions,
    discounts,
    client_can_choose_employee
  ) values (
    true,
    target_company_id,
    next_company_name,
    next_business_hours_text,
    nullif(welcome_background_data_url_value, ''),
    nullif(welcome_background_file_name_value, ''),
    nullif(welcome_background_mime_type_value, ''),
    nullif(banner_data_url_value, ''),
    nullif(banner_file_name_value, ''),
    nullif(banner_mime_type_value, ''),
    next_banner_images,
    next_promotions,
    next_discounts,
    coalesce(client_can_choose_employee_value, false)
  )
  on conflict (company_id) do update set
    company_name = excluded.company_name,
    business_hours_text = excluded.business_hours_text,
    welcome_background_data_url = excluded.welcome_background_data_url,
    welcome_background_file_name = excluded.welcome_background_file_name,
    welcome_background_mime_type = excluded.welcome_background_mime_type,
    banner_data_url = excluded.banner_data_url,
    banner_file_name = excluded.banner_file_name,
    banner_mime_type = excluded.banner_mime_type,
    banner_images = excluded.banner_images,
    promotions = excluded.promotions,
    discounts = excluded.discounts,
    client_can_choose_employee = excluded.client_can_choose_employee,
    updated_at = now();

  return public.get_app_configuration(company_slug_value);
end;
$$;

drop function if exists public.request_client_booking(bigint, uuid, text, timestamp without time zone, timestamp without time zone, text, text);

create or replace function public.request_client_booking(
  service_id_value bigint default null,
  employee_id_value uuid default null,
  booking_description_value text default null,
  start_at_value timestamp without time zone default null,
  end_at_value timestamp without time zone default null,
  customer_name_value text default null,
  customer_email_value text default null,
  company_slug_value text default null
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
  selected_promotion jsonb;
  current_business_time timestamp without time zone := timezone('America/Argentina/Buenos_Aires', now());
begin
  if target_company_id is null then
    raise exception 'La empresa no estÃ¡ disponible.';
  end if;

  if auth.uid() is null then
    raise exception 'IniciÃ¡ sesiÃ³n para solicitar un turno.';
  end if;

  if start_at_value is null or end_at_value is null or end_at_value <= start_at_value then
    raise exception 'El horario seleccionado no es vÃ¡lido.';
  end if;

  if start_at_value < current_business_time then
    raise exception 'No se pueden solicitar turnos en horarios pasados.';
  end if;

  if service_id_value is null and clean_booking_description is null then
    raise exception 'SeleccionÃ¡ un servicio o promociÃ³n.';
  end if;

  if service_id_value is not null and not exists (
    select 1
    from public.services services
    where services.id = service_id_value
      and services.company_id = target_company_id
      and services.active is not false
  ) then
    raise exception 'El servicio seleccionado no estÃ¡ disponible.';
  end if;

  if service_id_value is null then
    select promotion
    into selected_promotion
    from public.app_configuration configuration,
      jsonb_array_elements(coalesce(configuration.promotions, '[]'::jsonb)) promotion
    where configuration.company_id = target_company_id
      and coalesce((promotion->>'enabled')::boolean, false) is true
      and nullif(trim(concat_ws(
        ' Â· ',
        nullif(trim(coalesce(promotion->>'title', '')), ''),
        nullif(trim(coalesce(promotion->>'description', '')), ''),
        nullif(trim(coalesce(promotion->>'value', '')), '')
      )), '') = clean_booking_description
    limit 1;

    if selected_promotion is null then
      raise exception 'La promociÃ³n seleccionada no estÃ¡ disponible.';
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
        bookings.user_id = auth.uid()
        or (
          clean_customer_email is not null
          and lower(coalesce(bookings.user_email, '')) = lower(clean_customer_email)
        )
      )
    limit 1
  ) then
    raise exception 'Ya tenÃ©s un turno o solicitud en ese horario.';
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
      raise exception 'No hay disponibilidad para ese servicio en ese horario.';
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
      raise exception 'No hay disponibilidad para esa promociÃ³n en ese horario.';
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
      raise exception 'El empleado seleccionado no estÃ¡ disponible.';
    end if;

    if service_id_value is not null and not exists (
      select 1
      from public.employee_services relations
      where relations.company_id = target_company_id
        and relations.employee_id = employee_id_value
        and relations.service_id = service_id_value
    ) then
      raise exception 'El empleado no estÃ¡ vinculado a ese servicio.';
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
    user_email,
    customer_name,
    service,
    employee_id,
    booking_description,
    start_at,
    end_at,
    status
  ) values (
    target_company_id,
    auth.uid(),
    clean_customer_email,
    nullif(trim(coalesce(customer_name_value, '')), ''),
    service_id_value,
    employee_id_value,
    clean_booking_description,
    start_at_value,
    end_at_value,
    next_status
  )
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

revoke execute on function public.get_company_id_by_slug(text) from public;
revoke execute on function public.get_app_configuration(text) from public;
revoke execute on function public.get_company_public_context(text) from public;
revoke execute on function public.get_client_booking_options(text) from public;
revoke execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text) from public;
revoke execute on function public.request_client_booking(bigint, uuid, text, timestamp without time zone, timestamp without time zone, text, text, text) from public;

grant execute on function public.get_company_id_by_slug(text) to anon, authenticated;
grant execute on function public.get_app_configuration(text) to anon, authenticated;
grant execute on function public.get_company_public_context(text) to anon, authenticated;
grant execute on function public.get_client_booking_options(text) to anon, authenticated;
grant execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text) to anon, authenticated;
grant execute on function public.request_client_booking(bigint, uuid, text, timestamp without time zone, timestamp without time zone, text, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/040_multi_tenant_internal_access.sql
-- ============================================================================

-- Phase 2 multi-company internal access hardening.
-- Run after 039_multi_tenant_client_context.sql.
-- Internal employee/admin accounts are resolved by the company slug from the URL.

begin;

create or replace function public.get_company_id_by_slug(slug_value text default null)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.companies
  where slug = lower(trim(coalesce(slug_value, '')))
    and status = 'active'
  limit 1
$$;

create or replace function public.get_company_public_context(slug_value text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_company as (
    select companies.*
    from public.companies companies
    where companies.slug = lower(trim(coalesce(slug_value, '')))
    limit 1
  ), selected_config as (
    select config.*
    from public.app_configuration config
    join selected_company on selected_company.id = config.company_id
    limit 1
  )
  select coalesce((
    select jsonb_build_object(
      'id', selected_company.id,
      'name', selected_company.name,
      'slug', selected_company.slug,
      'status', selected_company.status,
      'active', selected_company.status = 'active',
      'company_name', coalesce(nullif(selected_config.company_name, ''), selected_company.name),
      'business_hours_text', coalesce(selected_config.business_hours_text, ''),
      'welcome_background_data_url', selected_config.welcome_background_data_url,
      'banner_images', coalesce(selected_config.banner_images, '[]'::jsonb)
    )
    from selected_company
    left join selected_config on true
  ), jsonb_build_object(
    'id', null,
    'name', null,
    'slug', lower(trim(coalesce(slug_value, ''))),
    'status', 'not_found',
    'active', false,
    'company_name', null,
    'business_hours_text', '',
    'welcome_background_data_url', null,
    'banner_images', '[]'::jsonb
  ))
$$;

-- Usernames and pending requests must be unique inside each company, not globally.
drop index if exists public.internal_accounts_username_uidx;
drop index if exists public.internal_registration_requests_username_pending_uidx;
drop index if exists public.internal_registration_requests_username_uidx;

-- Limpieza idempotente: conserva un solo usuario por (company_id, username_normalized)
-- para permitir crear el índice único en bases con datos históricos duplicados.
with duplicated_accounts as (
  select
    accounts.id,
    row_number() over (
      partition by accounts.company_id, accounts.username_normalized
      order by
        case when accounts.active then 0 else 1 end,
        accounts.updated_at desc nulls last,
        accounts.created_at desc nulls last,
        accounts.id desc
    ) as row_priority
  from public.internal_accounts accounts
  where accounts.company_id is not null
    and accounts.username_normalized is not null
)
delete from public.internal_accounts accounts
using duplicated_accounts duplicates
where accounts.id = duplicates.id
  and duplicates.row_priority > 1;

-- Limpieza idempotente de solicitudes pendientes duplicadas por empresa/usuario.
with duplicated_requests as (
  select
    requests.id,
    row_number() over (
      partition by requests.company_id, requests.username_normalized
      order by
        requests.created_at desc nulls last,
        requests.id desc
    ) as row_priority
  from public.internal_registration_requests requests
  where requests.company_id is not null
    and requests.username_normalized is not null
    and requests.status = 'pending'
)
delete from public.internal_registration_requests requests
using duplicated_requests duplicates
where requests.id = duplicates.id
  and duplicates.row_priority > 1;

create unique index if not exists internal_accounts_company_username_uidx
  on public.internal_accounts(company_id, username_normalized)
  where company_id is not null;

create unique index if not exists internal_registration_requests_company_username_pending_uidx
  on public.internal_registration_requests(company_id, username_normalized)
  where status = 'pending' and company_id is not null;

create or replace function public.create_internal_session(account_id_value uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  session_token text := encode(extensions.gen_random_bytes(32), 'hex');
  target_company_id uuid;
begin
  select accounts.company_id
  into target_company_id
  from public.internal_accounts accounts
  where accounts.id = account_id_value
  limit 1;

  insert into public.internal_sessions (account_id, company_id, token_hash)
  values (account_id_value, target_company_id, extensions.crypt(session_token, extensions.gen_salt('bf')));

  return session_token;
end;
$$;

drop function if exists public.verify_internal_login(public.app_role, text, text);

create or replace function public.verify_internal_login(
  account_role public.app_role,
  username_value text,
  password_value text,
  company_slug_value text default null
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
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  account_record public.internal_accounts%rowtype;
begin
  if target_company_id is null then
    raise exception 'La empresa no estÃ¡ disponible.';
  end if;

  select *
  into account_record
  from public.internal_accounts
  where internal_accounts.company_id = target_company_id
    and internal_accounts.role = account_role
    and internal_accounts.username_normalized = public.normalize_text(username_value)
    and internal_accounts.active = true
  limit 1;

  if account_record.id is null or account_record.password_hash <> extensions.crypt(trim(coalesce(password_value, '')), account_record.password_hash) then
    raise exception 'Nombre o contraseÃ±a invalidos.';
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
  new_password_value text,
  company_slug_value text default null
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
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  account_record public.internal_accounts%rowtype;
  clean_new_password text := trim(coalesce(new_password_value, ''));
begin
  if target_company_id is null then
    raise exception 'La empresa no estÃ¡ disponible.';
  end if;

  select *
  into account_record
  from public.internal_accounts
  where internal_accounts.id = account_id_value
    and internal_accounts.company_id = target_company_id
    and internal_accounts.active = true
  limit 1;

  if account_record.id is null or account_record.password_hash <> extensions.crypt(trim(coalesce(current_password_value, '')), account_record.password_hash) then
    raise exception 'La contraseÃ±a actual es invalida.';
  end if;

  if length(clean_new_password) < 6 or clean_new_password !~ '^[A-Za-z0-9]+$' then
    raise exception 'La nueva contraseÃ±a debe ser alfanumerica y tener al menos 6 caracteres.';
  end if;

  if account_record.password_hash = extensions.crypt(clean_new_password, account_record.password_hash) then
    raise exception 'La nueva contraseÃ±a debe ser distinta a la actual.';
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

drop function if exists public.request_internal_registration(public.app_role, text, text, text, date, text, text, text, text, text, text, uuid, text);

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
  email_value text default null,
  company_slug_value text default null
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
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  clean_username text := trim(coalesce(username_value, ''));
  clean_first_name text := trim(coalesce(first_name_value, ''));
  clean_last_name text := trim(coalesce(last_name_value, ''));
  clean_display_name text := trim(concat_ws(' ', nullif(trim(coalesce(first_name_value, '')), ''), nullif(trim(coalesce(last_name_value, '')), '')));
  clean_password text := trim(coalesce(password_value, ''));
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
begin
  if target_company_id is null then
    raise exception 'La empresa no estÃ¡ disponible.';
  end if;

  if account_role not in ('admin'::public.app_role, 'employee'::public.app_role) then
    raise exception 'Rol interno invalido.';
  end if;

  if length(clean_username) < 3 or clean_username !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'El usuario debe tener al menos 3 caracteres y solo puede usar letras, numeros, punto, guion o guion bajo.';
  end if;

  if length(clean_first_name) < 2 or length(clean_last_name) < 2 then
    raise exception 'IngresÃ¡ nombre y apellido.';
  end if;

  if birth_date_value is null or birth_date_value > current_date then
    raise exception 'La fecha de nacimiento es invalida.';
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'IngresÃ¡ un mail vÃ¡lido.';
  end if;

  if length(clean_password) < 6 or clean_password !~ '^[A-Za-z0-9]+$' then
    raise exception 'La contraseÃ±a debe ser alfanumerica y tener al menos 6 caracteres.';
  end if;

  if employee_id_value is not null and not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.company_id = target_company_id
      and employees.deleted_at is null
  ) then
    raise exception 'El empleado seleccionado no pertenece a esta empresa.';
  end if;

  if exists (
    select 1
    from public.internal_accounts accounts
    where accounts.company_id = target_company_id
      and accounts.username_normalized = public.normalize_text(clean_username)
  ) then
    raise exception 'Ya existe una cuenta interna con ese usuario.';
  end if;

  if exists (
    select 1
    from public.internal_registration_requests requests
    where requests.company_id = target_company_id
      and requests.status = 'pending'
      and requests.username_normalized = public.normalize_text(clean_username)
  ) then
    raise exception 'Ya existe una solicitud pendiente con ese usuario.';
  end if;

  return query
  insert into public.internal_registration_requests (
    company_id,
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
    target_company_id,
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
  request_company_id uuid;
  request_email text;
  admin_account public.internal_accounts%rowtype;
begin
  if not public.is_admin() then
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  select company_id, email
  into request_company_id, request_email
  from public.internal_registration_requests
  where id = request_id_value;

  if request_company_id is null then
    raise exception 'La solicitud no tiene empresa asociada.';
  end if;

  if admin_account.id is not null and admin_account.company_id is distinct from request_company_id then
    raise exception 'No podÃ©s aprobar solicitudes de otra empresa.';
  end if;

  if employee_id_value is not null and not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.company_id = request_company_id
      and employees.deleted_at is null
  ) then
    raise exception 'El empleado seleccionado no pertenece a esta empresa.';
  end if;

  for approved_account in
    select * from public.approve_internal_registration_legacy(request_id_value, employee_id_value, account_id_value)
  loop
    update public.internal_accounts
    set company_id = request_company_id,
        updated_at = now()
    where internal_accounts.id = approved_account.id;

    if public.is_valid_email(request_email) and approved_account.employee_id is not null then
      update public.employees
      set company_id = request_company_id,
          email = lower(trim(request_email)),
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

create or replace function public.get_admin_panel_data(
  account_id_value uuid default null,
  request_status_value text default 'pending',
  session_token_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  admin_account public.internal_accounts%rowtype;
  payload jsonb;
begin
  if target_company_id is null then
    raise exception 'La empresa no estÃ¡ disponible.';
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
      raise exception 'No podÃ©s administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);

    if admin_account.company_id is distinct from target_company_id then
      raise exception 'No podÃ©s administrar otra empresa.';
    end if;
  end if;

  select jsonb_build_object(
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(booking_rows) order by booking_rows.start_at)
      from (
        select *
        from public.bookings bookings
        where bookings.company_id = target_company_id
        order by bookings.start_at
      ) booking_rows
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(to_jsonb(employee_rows) order by employee_rows.name)
      from (
        select
          employees.*,
          coalesce(accounts.role = 'admin'::public.app_role, false) as is_admin,
          accounts.username as internal_username
        from public.employees employees
        left join public.internal_accounts accounts
          on accounts.employee_id = employees.id
          and accounts.active = true
          and accounts.company_id = target_company_id
        where employees.company_id = target_company_id
          and employees.deleted_at is null
      ) employee_rows
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
    'accessRequests', coalesce((
      select jsonb_agg(to_jsonb(request_rows) order by request_rows.created_at desc)
      from (
        select
          requests.id,
          requests.role,
          requests.username,
          requests.display_name,
          requests.first_name,
          requests.last_name,
          requests.birth_date,
          requests.phone,
          requests.address_street,
          requests.address_number,
          requests.address_locality,
          requests.photo_url,
          requests.employee_id,
          requests.status,
          requests.created_at,
          requests.reviewed_at
        from public.internal_registration_requests requests
        where requests.company_id = target_company_id
          and (request_status_value is null or requests.status = request_status_value)
      ) request_rows
    ), '[]'::jsonb)
  ) into payload;

  return payload;
end;
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
          and bookings.employee_id = account_record.employee_id
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

create or replace function public.create_admin_booking(
  service_id_value bigint,
  employee_id_value uuid,
  start_at_value timestamp without time zone,
  end_at_value timestamp without time zone,
  customer_name_value text default null,
  customer_email_value text default null,
  account_id_value uuid default null,
  session_token_value text default null,
  booking_description_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  admin_account public.internal_accounts%rowtype;
  saved_booking public.bookings%rowtype;
  is_promotional_booking boolean := service_id_value is null and nullif(trim(coalesce(booking_description_value, '')), '') is not null;
begin
  if target_company_id is null then raise exception 'La empresa no estÃ¡ disponible.'; end if;

  if public.is_admin() then
    if not exists (select 1 from public.profiles profiles where profiles.user_id = auth.uid() and profiles.role = 'admin'::public.app_role and profiles.active is not false and profiles.company_id = target_company_id) then
      raise exception 'No podÃ©s administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    if admin_account.company_id is distinct from target_company_id then raise exception 'No podÃ©s administrar otra empresa.'; end if;
  end if;

  if employee_id_value is null or start_at_value is null or end_at_value is null or end_at_value <= start_at_value then
    raise exception 'El horario del turno es invalido.';
  end if;

  if service_id_value is null and not is_promotional_booking then raise exception 'SeleccionÃ¡ un servicio o promociÃ³n.'; end if;

  if not exists (select 1 from public.employees employees where employees.id = employee_id_value and employees.company_id = target_company_id and employees.active = true and employees.deleted_at is null) then
    raise exception 'El empleado no esta activo.';
  end if;

  if service_id_value is not null and not exists (select 1 from public.employee_services relations join public.services services on services.id = relations.service_id where relations.company_id = target_company_id and services.company_id = target_company_id and relations.employee_id = employee_id_value and relations.service_id = service_id_value and services.active is not false) then
    raise exception 'El empleado no esta vinculado a ese servicio.';
  end if;

  if not exists (select 1 from public.employee_availability availability where availability.company_id = target_company_id and availability.employee_id = employee_id_value and availability.active = true and availability.available_date = start_at_value::date and availability.start_time <= start_at_value::time and availability.end_time >= end_at_value::time) then
    raise exception 'El empleado no tiene disponibilidad configurada para ese horario.';
  end if;

  if exists (select 1 from public.bookings bookings where bookings.company_id = target_company_id and bookings.employee_id = employee_id_value and bookings.status in ('reserved', 'confirmed', 'pending_assignment') and bookings.start_at < end_at_value and bookings.end_at > start_at_value limit 1) then
    raise exception 'El empleado ya tiene un turno en ese horario.';
  end if;

  if nullif(trim(coalesce(customer_email_value, '')), '') is not null and exists (select 1 from public.bookings bookings where bookings.company_id = target_company_id and lower(coalesce(bookings.user_email, '')) = lower(trim(customer_email_value)) and bookings.status in ('reserved', 'confirmed', 'pending_assignment') and bookings.start_at < end_at_value and bookings.end_at > start_at_value limit 1) then
    raise exception 'Ese cliente ya tiene un turno en ese horario.';
  end if;

  insert into public.bookings (company_id, user_id, user_email, customer_name, service, employee_id, booking_description, start_at, end_at, status)
  values (target_company_id, null, nullif(trim(coalesce(customer_email_value, '')), ''), nullif(trim(coalesce(customer_name_value, '')), ''), service_id_value, employee_id_value, nullif(trim(coalesce(booking_description_value, '')), ''), start_at_value, end_at_value, 'confirmed')
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

create or replace function public.create_internal_employee_booking(
  service_id_value bigint,
  employee_id_value uuid,
  start_at_value timestamp without time zone,
  end_at_value timestamp without time zone,
  customer_name_value text default null,
  customer_email_value text default null,
  account_id_value uuid default null,
  session_token_value text default null,
  booking_description_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  employee_account public.internal_accounts%rowtype;
  saved_booking public.bookings%rowtype;
  is_promotional_booking boolean := service_id_value is null and nullif(trim(coalesce(booking_description_value, '')), '') is not null;
begin
  if target_company_id is null then raise exception 'La empresa no estÃ¡ disponible.'; end if;

  employee_account := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);

  if employee_account.company_id is distinct from target_company_id or employee_account.employee_id is distinct from employee_id_value then
    raise exception 'No podÃ©s crear turnos para otra empresa o empleado.';
  end if;

  if employee_id_value is null or start_at_value is null or end_at_value is null or end_at_value <= start_at_value then
    raise exception 'El horario del turno es invalido.';
  end if;

  if service_id_value is null and not is_promotional_booking then raise exception 'SeleccionÃ¡ un servicio o promociÃ³n.'; end if;

  if service_id_value is not null and not exists (
    select 1
    from public.employee_services relations
    join public.services services on services.id = relations.service_id
    where relations.company_id = target_company_id
      and services.company_id = target_company_id
      and relations.employee_id = employee_id_value
      and relations.service_id = service_id_value
      and services.active is not false
  ) then
    raise exception 'El empleado no esta vinculado a ese servicio.';
  end if;

  if not exists (
    select 1
    from public.employee_availability availability
    where availability.company_id = target_company_id
      and availability.employee_id = employee_id_value
      and availability.active = true
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

  if nullif(trim(coalesce(customer_email_value, '')), '') is not null and exists (
    select 1
    from public.bookings bookings
    where bookings.company_id = target_company_id
      and lower(coalesce(bookings.user_email, '')) = lower(trim(customer_email_value))
      and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
      and bookings.start_at < end_at_value
      and bookings.end_at > start_at_value
    limit 1
  ) then
    raise exception 'Ese cliente ya tiene un turno en ese horario.';
  end if;

  insert into public.bookings (company_id, user_id, user_email, customer_name, service, employee_id, booking_description, start_at, end_at, status)
  values (target_company_id, null, nullif(trim(coalesce(customer_email_value, '')), ''), nullif(trim(coalesce(customer_name_value, '')), ''), service_id_value, employee_id_value, nullif(trim(coalesce(booking_description_value, '')), ''), start_at_value, end_at_value, 'confirmed')
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

create or replace function public.cancel_booking(
  booking_id_value uuid,
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
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  account_record public.internal_accounts%rowtype;
  saved_booking public.bookings%rowtype;
begin
  if target_company_id is null then raise exception 'La empresa no estÃ¡ disponible.'; end if;

  select * into saved_booking from public.bookings where id = booking_id_value and company_id = target_company_id limit 1;
  if saved_booking.id is null then raise exception 'El turno no pertenece a esta empresa.'; end if;

  if account_id_value is not null then
    account_record := public.validate_internal_session(account_id_value, session_token_value, null);
    if account_record.company_id is distinct from target_company_id then raise exception 'El turno no pertenece a esta empresa.'; end if;
    if account_record.role = 'employee'::public.app_role and saved_booking.employee_id is distinct from account_record.employee_id then raise exception 'Solo podÃ©s cancelar turnos asignados a tu empleado.'; end if;
  elsif auth.uid() is null or saved_booking.user_id is distinct from auth.uid() then
    raise exception 'Solo podÃ©s cancelar turnos propios.';
  end if;

  update public.bookings
  set status = 'cancelled', updated_at = now()
  where id = saved_booking.id
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

create or replace function public.assign_admin_booking_employee(
  booking_id_value uuid,
  employee_id_value uuid,
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
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  admin_account public.internal_accounts%rowtype;
  saved_booking public.bookings%rowtype;
  selected_promotion jsonb;
begin
  if target_company_id is null then raise exception 'La empresa no estÃ¡ disponible.'; end if;

  if public.is_admin() then
    if not exists (select 1 from public.profiles profiles where profiles.user_id = auth.uid() and profiles.role = 'admin'::public.app_role and profiles.active is not false and profiles.company_id = target_company_id) then raise exception 'No podÃ©s administrar otra empresa.'; end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    if admin_account.company_id is distinct from target_company_id then raise exception 'No podÃ©s administrar otra empresa.'; end if;
  end if;

  select * into saved_booking from public.bookings where id = booking_id_value and company_id = target_company_id limit 1;
  if saved_booking.id is null then raise exception 'El turno no pertenece a esta empresa.'; end if;

  if not exists (select 1 from public.employees employees where employees.id = employee_id_value and employees.company_id = target_company_id and employees.active = true and employees.deleted_at is null) then raise exception 'El empleado no estÃ¡ disponible.'; end if;

  if saved_booking.service is not null and not exists (
    select 1
    from public.employee_services relations
    where relations.company_id = target_company_id
      and relations.employee_id = employee_id_value
      and relations.service_id = saved_booking.service
  ) then raise exception 'El empleado no estÃ¡ vinculado a ese servicio.'; end if;

  if saved_booking.service is null and nullif(trim(coalesce(saved_booking.booking_description, '')), '') is not null then
    select promotion
    into selected_promotion
    from public.app_configuration configuration,
      jsonb_array_elements(coalesce(configuration.promotions, '[]'::jsonb)) with ordinality promotion_item(promotion, position)
    where configuration.company_id = target_company_id
      and coalesce((promotion->>'enabled')::boolean, false) is true
      and (
        nullif(trim(concat_ws(
          ' Â· ',
          nullif(trim(coalesce(promotion->>'title', '')), ''),
          nullif(trim(coalesce(promotion->>'description', '')), ''),
          nullif(trim(coalesce(promotion->>'value', '')), '')
        )), '') = nullif(trim(coalesce(saved_booking.booking_description, '')), '')
        or format('Banner %s', position) = nullif(trim(coalesce(saved_booking.booking_description, '')), '')
      )
    limit 1;

    if selected_promotion is null then raise exception 'La promociÃ³n seleccionada no estÃ¡ disponible.'; end if;
    if not exists (
      select 1
      from jsonb_array_elements_text(coalesce(selected_promotion->'employeeIds', '[]'::jsonb)) promotion_employees(employee_id_text)
      where promotion_employees.employee_id_text = employee_id_value::text
    ) then raise exception 'El empleado no estÃ¡ vinculado a esa promociÃ³n.'; end if;
  end if;

  if saved_booking.user_id is not null and exists (
    select 1
    from public.bookings bookings
    where bookings.company_id = target_company_id
      and bookings.id <> saved_booking.id
      and bookings.user_id = saved_booking.user_id
      and bookings.status in ('reserved', 'confirmed')
      and bookings.start_at < saved_booking.end_at
      and bookings.end_at > saved_booking.start_at
    limit 1
  ) then raise exception 'El cliente ya tiene un turno asignado en ese horario.'; end if;

  if nullif(trim(coalesce(saved_booking.user_email, '')), '') is not null and exists (
    select 1
    from public.bookings bookings
    where bookings.company_id = target_company_id
      and bookings.id <> saved_booking.id
      and lower(coalesce(bookings.user_email, '')) = lower(saved_booking.user_email)
      and bookings.status in ('reserved', 'confirmed')
      and bookings.start_at < saved_booking.end_at
      and bookings.end_at > saved_booking.start_at
    limit 1
  ) then raise exception 'El cliente ya tiene un turno asignado en ese horario.'; end if;

  update public.bookings
  set employee_id = employee_id_value, status = 'confirmed', updated_at = now()
  where id = booking_id_value and company_id = target_company_id
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

create or replace function public.list_internal_employee_availability(account_id_value uuid, session_token_value text default null, company_slug_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  account_record public.internal_accounts%rowtype;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  if target_company_id is null or account_record.company_id is distinct from target_company_id then raise exception 'La cuenta interna no pertenece a esta empresa.'; end if;
  return coalesce((select jsonb_agg(to_jsonb(availability) order by availability.available_date, availability.start_time) from public.employee_availability availability where availability.company_id = target_company_id and availability.employee_id = account_record.employee_id), '[]'::jsonb);
end; $$;

create or replace function public.save_admin_employee_availability(availability_id_value text, employee_id_value uuid, available_date_value date, start_time_value time without time zone, end_time_value time without time zone, active_value boolean default true, account_id_value uuid default null, session_token_value text default null, company_slug_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  admin_account public.internal_accounts%rowtype;
  result jsonb;
begin
  if target_company_id is null then raise exception 'La empresa no estÃ¡ disponible.'; end if;
  if public.is_admin() then
    if not exists (select 1 from public.profiles profiles where profiles.user_id = auth.uid() and profiles.role = 'admin'::public.app_role and profiles.active is not false and profiles.company_id = target_company_id) then raise exception 'No podÃ©s administrar otra empresa.'; end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    if admin_account.company_id is distinct from target_company_id then raise exception 'No podÃ©s administrar otra empresa.'; end if;
  end if;
  if not exists (select 1 from public.employees employees where employees.id = employee_id_value and employees.company_id = target_company_id and employees.deleted_at is null) then raise exception 'El empleado no pertenece a esta empresa.'; end if;
  if availability_id_value is not null and not exists (select 1 from public.employee_availability availability where availability.id = availability_id_value::uuid and availability.company_id = target_company_id) then raise exception 'La disponibilidad no pertenece a esta empresa.'; end if;
  result := public.save_admin_employee_availability_legacy(availability_id_value, employee_id_value, available_date_value, start_time_value, end_time_value, active_value, account_id_value);
  update public.employee_availability set company_id = target_company_id where id = (result->>'id')::uuid;
  return result || jsonb_build_object('company_id', target_company_id);
end; $$;

create or replace function public.delete_admin_employee_availability(availability_id_value text, account_id_value uuid default null, session_token_value text default null, company_slug_value text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  admin_account public.internal_accounts%rowtype;
begin
  if target_company_id is null then raise exception 'La empresa no estÃ¡ disponible.'; end if;
  if public.is_admin() then
    if not exists (select 1 from public.profiles profiles where profiles.user_id = auth.uid() and profiles.role = 'admin'::public.app_role and profiles.active is not false and profiles.company_id = target_company_id) then raise exception 'No podÃ©s administrar otra empresa.'; end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    if admin_account.company_id is distinct from target_company_id then raise exception 'No podÃ©s administrar otra empresa.'; end if;
  end if;
  if not exists (select 1 from public.employee_availability availability where availability.id = availability_id_value::uuid and availability.company_id = target_company_id) then raise exception 'La disponibilidad no pertenece a esta empresa.'; end if;
  perform public.delete_admin_employee_availability_legacy(availability_id_value, account_id_value);
end; $$;

create or replace function public.create_internal_employee_availability(account_id_value uuid, available_date_value date, start_time_value time without time zone, end_time_value time without time zone, active_value boolean default true, session_token_value text default null, company_slug_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  account_record public.internal_accounts%rowtype;
  result jsonb;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  if target_company_id is null or account_record.company_id is distinct from target_company_id then raise exception 'La cuenta interna no pertenece a esta empresa.'; end if;
  result := public.create_internal_employee_availability_legacy(account_id_value, available_date_value, start_time_value, end_time_value, active_value);
  update public.employee_availability set company_id = target_company_id where id = (result->>'id')::uuid;
  return result || jsonb_build_object('company_id', target_company_id);
end; $$;

create or replace function public.update_internal_employee_availability(account_id_value uuid, availability_id_value text, available_date_value date, start_time_value time without time zone, end_time_value time without time zone, active_value boolean default true, session_token_value text default null, company_slug_value text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  account_record public.internal_accounts%rowtype;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  if target_company_id is null or account_record.company_id is distinct from target_company_id then raise exception 'La cuenta interna no pertenece a esta empresa.'; end if;
  if not exists (select 1 from public.employee_availability availability where availability.id = availability_id_value::uuid and availability.company_id = target_company_id and availability.employee_id = account_record.employee_id) then raise exception 'La disponibilidad no pertenece a esta empresa.'; end if;
  return public.update_internal_employee_availability_legacy(account_id_value, availability_id_value, available_date_value, start_time_value, end_time_value, active_value);
end; $$;

create or replace function public.delete_internal_employee_availability(account_id_value uuid, availability_id_value text, session_token_value text default null, company_slug_value text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  account_record public.internal_accounts%rowtype;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  if target_company_id is null or account_record.company_id is distinct from target_company_id then raise exception 'La cuenta interna no pertenece a esta empresa.'; end if;
  if not exists (select 1 from public.employee_availability availability where availability.id = availability_id_value::uuid and availability.company_id = target_company_id and availability.employee_id = account_record.employee_id) then raise exception 'La disponibilidad no pertenece a esta empresa.'; end if;
  perform public.delete_internal_employee_availability_legacy(account_id_value, availability_id_value);
end; $$;

do $$
begin
  if to_regprocedure('public.save_admin_app_configuration_039(text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,boolean,uuid,text,text)') is null
     and to_regprocedure('public.save_admin_app_configuration(text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,boolean,uuid,text,text)') is not null then
    execute 'alter function public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text) rename to save_admin_app_configuration_039';
  end if;
end;
$$;

do $$
begin
  if to_regprocedure('public.save_admin_app_configuration_039(text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,boolean,uuid,text,text)') is not null then
    execute 'revoke execute on function public.save_admin_app_configuration_039(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text) from anon, authenticated';
  end if;
end;
$$;

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
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  admin_account public.internal_accounts%rowtype;
begin
  if target_company_id is null then
    raise exception 'La empresa no estÃ¡ disponible.';
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
      raise exception 'No podÃ©s administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);

    if admin_account.company_id is distinct from target_company_id then
      raise exception 'No podÃ©s administrar otra empresa.';
    end if;
  end if;

  return public.save_admin_app_configuration_039(
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
end;
$$;

revoke execute on function public.verify_internal_login(public.app_role, text, text, text) from public;
revoke execute on function public.change_internal_password(uuid, text, text, text) from public;
revoke execute on function public.request_internal_registration(public.app_role, text, text, text, date, text, text, text, text, text, text, uuid, text, text) from public;
revoke execute on function public.get_admin_panel_data(uuid, text, text, text) from public;
revoke execute on function public.get_internal_employee_workspace(uuid, text, text) from public;
revoke execute on function public.create_admin_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text, text, text) from public;
revoke execute on function public.create_internal_employee_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text, text, text) from public;
revoke execute on function public.cancel_booking(uuid, uuid, text, text) from public;
revoke execute on function public.assign_admin_booking_employee(uuid, uuid, uuid, text, text) from public;
revoke execute on function public.list_internal_employee_availability(uuid, text, text) from public;
revoke execute on function public.save_admin_employee_availability(text, uuid, date, time without time zone, time without time zone, boolean, uuid, text, text) from public;
revoke execute on function public.delete_admin_employee_availability(text, uuid, text, text) from public;
revoke execute on function public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean, text, text) from public;
revoke execute on function public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean, text, text) from public;
revoke execute on function public.delete_internal_employee_availability(uuid, text, text, text) from public;
revoke execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text) from public;

grant execute on function public.verify_internal_login(public.app_role, text, text, text) to anon, authenticated;
grant execute on function public.change_internal_password(uuid, text, text, text) to anon, authenticated;
grant execute on function public.request_internal_registration(public.app_role, text, text, text, date, text, text, text, text, text, text, uuid, text, text) to anon, authenticated;
grant execute on function public.get_admin_panel_data(uuid, text, text, text) to anon, authenticated;
grant execute on function public.get_internal_employee_workspace(uuid, text, text) to anon, authenticated;
grant execute on function public.create_admin_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.create_internal_employee_booking(bigint, uuid, timestamp without time zone, timestamp without time zone, text, text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.cancel_booking(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.assign_admin_booking_employee(uuid, uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.list_internal_employee_availability(uuid, text, text) to anon, authenticated;
grant execute on function public.save_admin_employee_availability(text, uuid, date, time without time zone, time without time zone, boolean, uuid, text, text) to anon, authenticated;
grant execute on function public.delete_admin_employee_availability(text, uuid, text, text) to anon, authenticated;
grant execute on function public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean, text, text) to anon, authenticated;
grant execute on function public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean, text, text) to anon, authenticated;
grant execute on function public.delete_internal_employee_availability(uuid, text, text, text) to anon, authenticated;
grant execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/041_platform_admin.sql
-- ============================================================================

-- Platform administration account and company onboarding RPCs.
-- Run after 040_multi_tenant_internal_access.sql.
-- Reserved frontend URL: /plataforma

begin;

insert into public.internal_accounts (
  company_id,
  role,
  username,
  display_name,
  first_name,
  last_name,
  username_normalized,
  password_hash,
  employee_id,
  active,
  must_change_password
)
select
  null,
  'admin'::public.app_role,
  'Admin',
  'Administrador plataforma',
  'Administrador',
  'Plataforma',
  public.normalize_text('Admin'),
  extensions.crypt('Admin', extensions.gen_salt('bf')),
  null,
  true,
  false
where not exists (
  select 1
  from public.internal_accounts accounts
  where accounts.company_id is null
    and accounts.role = 'admin'::public.app_role
    and accounts.username_normalized = public.normalize_text('Admin')
);

update public.internal_accounts
set username = 'Admin',
    display_name = 'Administrador plataforma',
    first_name = 'Administrador',
    last_name = 'Plataforma',
    password_hash = extensions.crypt('Admin', extensions.gen_salt('bf')),
    active = true,
    must_change_password = false,
    updated_at = now()
where internal_accounts.company_id is null
  and internal_accounts.role = 'admin'::public.app_role
  and internal_accounts.username_normalized = public.normalize_text('Admin');

create or replace function public.create_platform_admin_session(account_id_value uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  session_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into public.internal_sessions (account_id, company_id, token_hash)
  values (account_id_value, null, extensions.crypt(session_token, extensions.gen_salt('bf')));

  return session_token;
end;
$$;

create or replace function public.validate_platform_admin_session(
  account_id_value uuid,
  session_token_value text
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
    raise exception 'SesiÃ³n de plataforma invÃ¡lida.';
  end if;

  select accounts.*
  into account_record
  from public.internal_accounts accounts
  join public.internal_sessions sessions on sessions.account_id = accounts.id
  where accounts.id = account_id_value
    and accounts.company_id is null
    and accounts.role = 'admin'::public.app_role
    and accounts.active = true
    and sessions.company_id is null
    and sessions.revoked_at is null
    and sessions.expires_at > now()
    and sessions.token_hash = extensions.crypt(trim(session_token_value), sessions.token_hash)
  order by sessions.created_at desc
  limit 1;

  if account_record.id is null then
    raise exception 'SesiÃ³n de plataforma invÃ¡lida o vencida.';
  end if;

  select sessions.id
  into session_id_value
  from public.internal_sessions sessions
  where sessions.account_id = account_record.id
    and sessions.company_id is null
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

create or replace function public.verify_platform_admin_login(
  username_value text,
  password_value text
)
returns table (
  id uuid,
  username text,
  display_name text,
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
  where internal_accounts.company_id is null
    and internal_accounts.role = 'admin'::public.app_role
    and internal_accounts.username_normalized = public.normalize_text(username_value)
    and internal_accounts.active = true
  limit 1;

  if account_record.id is null or account_record.password_hash <> extensions.crypt(trim(coalesce(password_value, '')), account_record.password_hash) then
    raise exception 'Usuario o password invÃ¡lidos.';
  end if;

  update public.internal_accounts
  set last_login_at = now(), updated_at = now()
  where internal_accounts.id = account_record.id;

  return query
  select
    account_record.id,
    account_record.username,
    account_record.display_name,
    public.create_platform_admin_session(account_record.id);
end;
$$;

create or replace function public.platform_create_company_admin(
  platform_account_id_value uuid,
  session_token_value text,
  company_name_value text,
  company_slug_value text,
  admin_username_value text,
  admin_first_name_value text default null,
  admin_last_name_value text default null,
  admin_email_value text default null
)
returns table (
  company_id uuid,
  company_name text,
  company_slug text,
  admin_account_id uuid,
  admin_username text,
  temporary_password text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_account public.internal_accounts%rowtype;
  clean_company_name text := nullif(trim(coalesce(company_name_value, '')), '');
  clean_company_slug text := lower(regexp_replace(trim(coalesce(company_slug_value, '')), '[^a-zA-Z0-9-]', '', 'g'));
  clean_admin_username text := trim(coalesce(admin_username_value, ''));
  clean_admin_first_name text := nullif(trim(coalesce(admin_first_name_value, '')), '');
  clean_admin_last_name text := nullif(trim(coalesce(admin_last_name_value, '')), '');
  clean_admin_email text := lower(nullif(trim(coalesce(admin_email_value, '')), ''));
  next_display_name text;
  saved_company public.companies%rowtype;
  saved_account public.internal_accounts%rowtype;
  temp_password text := '123456';
begin
  platform_account := public.validate_platform_admin_session(platform_account_id_value, session_token_value);

  if clean_company_name is null then
    raise exception 'IngresÃ¡ el nombre de la empresa.';
  end if;

  if clean_company_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then
    raise exception 'El slug debe tener entre 3 y 63 caracteres, con letras minÃºsculas, nÃºmeros o guion.';
  end if;

  if clean_company_slug = 'plataforma' then
    raise exception 'Ese slug estÃ¡ reservado para administraciÃ³n plataforma.';
  end if;

  if length(clean_admin_username) < 3 or clean_admin_username !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'El usuario administrador debe tener al menos 3 caracteres y solo puede usar letras, nÃºmeros, punto, guion o guion bajo.';
  end if;

  if clean_admin_email is not null and not public.is_valid_email(clean_admin_email) then
    raise exception 'IngresÃ¡ un mail vÃ¡lido para el administrador.';
  end if;

  next_display_name := trim(concat_ws(' ', clean_admin_first_name, clean_admin_last_name));
  if next_display_name = '' then
    next_display_name := clean_admin_username;
  end if;

  insert into public.companies (name, slug, status, owner_email, contact_email)
  values (clean_company_name, clean_company_slug, 'active', clean_admin_email, clean_admin_email)
  on conflict (slug) do update set
    name = excluded.name,
    status = 'active',
    owner_email = coalesce(excluded.owner_email, public.companies.owner_email),
    contact_email = coalesce(excluded.contact_email, public.companies.contact_email),
    updated_at = now()
  returning * into saved_company;

  insert into public.app_configuration (
    id,
    company_id,
    company_name,
    business_hours_text,
    banner_images,
    promotions,
    discounts,
    client_can_choose_employee
  ) values (
    true,
    saved_company.id,
    clean_company_name,
    '',
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    false
  )
  on conflict (company_id) do update set
    company_name = excluded.company_name,
    updated_at = now();

  select *
  into saved_account
  from public.internal_accounts accounts
  where accounts.company_id = saved_company.id
    and accounts.username_normalized = public.normalize_text(clean_admin_username)
  limit 1;

  insert into public.internal_accounts (
    company_id,
    role,
    username,
    display_name,
    first_name,
    last_name,
    username_normalized,
    password_hash,
    employee_id,
    active,
    must_change_password
  ) values (
    saved_company.id,
    'admin'::public.app_role,
    clean_admin_username,
    next_display_name,
    clean_admin_first_name,
    clean_admin_last_name,
    public.normalize_text(clean_admin_username),
    extensions.crypt(temp_password, extensions.gen_salt('bf')),
    null,
    true,
    true
  )
  on conflict on constraint internal_accounts_company_username_uidx do update
  set role = 'admin'::public.app_role,
      username = excluded.username,
      display_name = excluded.display_name,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      password_hash = excluded.password_hash,
      active = true,
      must_change_password = true,
      updated_at = now()
  returning * into saved_account;

  if clean_admin_email is not null then
    insert into public.company_memberships (company_id, email, role, employee_id, status)
    values (saved_company.id, clean_admin_email, 'admin'::public.app_role, null, 'invited')
    on conflict (company_id, lower(email)) do update set
      role = 'admin'::public.app_role,
      status = case when public.company_memberships.status = 'disabled' then 'disabled' else 'invited' end,
      updated_at = now();
  end if;

  return query
  select
    saved_company.id,
    saved_company.name,
    saved_company.slug,
    saved_account.id,
    saved_account.username,
    temp_password;
end;
$$;

create or replace function public.platform_reset_company_admin_password(
  platform_account_id_value uuid,
  session_token_value text,
  company_slug_value text,
  admin_username_value text
)
returns table (
  company_id uuid,
  company_slug text,
  admin_account_id uuid,
  admin_username text,
  temporary_password text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_account public.internal_accounts%rowtype;
  target_company public.companies%rowtype;
  target_account public.internal_accounts%rowtype;
  clean_company_slug text := lower(regexp_replace(trim(coalesce(company_slug_value, '')), '[^a-zA-Z0-9-]', '', 'g'));
  clean_admin_username text := trim(coalesce(admin_username_value, ''));
  temp_password text := '123456';
begin
  platform_account := public.validate_platform_admin_session(platform_account_id_value, session_token_value);

  select *
  into target_company
  from public.companies companies
  where companies.slug = clean_company_slug
    and companies.status = 'active'
  limit 1;

  if target_company.id is null then
    raise exception 'La empresa no estÃ¡ disponible.';
  end if;

  select *
  into target_account
  from public.internal_accounts accounts
  where accounts.company_id = target_company.id
    and accounts.role = 'admin'::public.app_role
    and accounts.username_normalized = public.normalize_text(clean_admin_username)
    and accounts.active = true
  limit 1;

  if target_account.id is null then
    raise exception 'No se encontrÃ³ un administrador activo con ese usuario para la empresa.';
  end if;

  update public.internal_sessions
  set revoked_at = now()
  where internal_sessions.account_id = target_account.id
    and internal_sessions.revoked_at is null;

  update public.internal_accounts
  set password_hash = extensions.crypt(temp_password, extensions.gen_salt('bf')),
      must_change_password = true,
      updated_at = now()
  where internal_accounts.id = target_account.id
  returning * into target_account;

  return query
  select
    target_company.id,
    target_company.slug,
    target_account.id,
    target_account.username,
    temp_password;
end;
$$;

revoke execute on function public.create_platform_admin_session(uuid) from public;
revoke execute on function public.validate_platform_admin_session(uuid, text) from public;
revoke execute on function public.verify_platform_admin_login(text, text) from public;
revoke execute on function public.platform_create_company_admin(uuid, text, text, text, text, text, text, text) from public;
revoke execute on function public.platform_reset_company_admin_password(uuid, text, text, text) from public;

grant execute on function public.verify_platform_admin_login(text, text) to anon, authenticated;
grant execute on function public.platform_create_company_admin(uuid, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.platform_reset_company_admin_password(uuid, text, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/042_platform_mail_tenant_links.sql
-- ============================================================================

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

      employee_message := public.format_booking_notification_message(NEW, 'TenÃ©s un nuevo turno asignado.') || E'\n\nIr a Agenda: ' || employee_agenda_url;
      employee_html := public.format_booking_notification_html(NEW, 'TenÃ©s un nuevo turno asignado.', 'Ir a Agenda', employee_agenda_url);
      perform public.send_resend_email(employee_email, 'TenÃ©s un nuevo turno asignado', employee_message, 'Quiero Turno App - No responder', NEW.user_email, employee_html, NEW.company_id);
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

    employee_message := public.format_booking_notification_message(NEW, 'TenÃ©s un nuevo turno asignado.') || E'\n\nIr a Agenda: ' || employee_agenda_url;
    employee_html := public.format_booking_notification_html(NEW, 'TenÃ©s un nuevo turno asignado.', 'Ir a Agenda', employee_agenda_url);
    perform public.send_resend_email(employee_email, 'TenÃ©s un nuevo turno asignado', employee_message, 'Quiero Turno App - No responder', NEW.user_email, employee_html, NEW.company_id);
  end if;

  if TG_OP = 'UPDATE'
    and NEW.status = 'cancelled'
    and OLD.status is distinct from NEW.status
    and NEW.employee_id is not null then
    select employees.email into employee_email
    from public.employees employees
    where employees.id = NEW.employee_id
      and employees.company_id = NEW.company_id;

    employee_message := public.format_booking_notification_message(NEW, 'Se cancelÃ³ este turno.') || E'\n\nIr a Agenda: ' || employee_agenda_url;
    employee_html := public.format_booking_notification_html(NEW, 'Se cancelÃ³ este turno.', 'Ir a Agenda', employee_agenda_url);
    perform public.send_resend_email(employee_email, 'Se cancelÃ³ un turno', employee_message, 'Quiero Turno App - No responder', NEW.user_email, employee_html, NEW.company_id);
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
    reminder_message := public.format_booking_notification_message(booking_record, 'Recordatorio: tenÃ©s un turno reservado para maÃ±ana.');
    reminder_html := public.format_booking_notification_html(booking_record, 'Recordatorio: tenÃ©s un turno reservado para maÃ±ana.');

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


-- ============================================================================
-- Source: database/043_platform_company_creation_fix.sql
-- ============================================================================

-- Fix platform company creation after 041 when PL/pgSQL resolves company_id ambiguously.
-- Run after 041_platform_admin.sql. Compatible with 042_platform_mail_tenant_links.sql.

begin;

create or replace function public.platform_create_company_admin(
  platform_account_id_value uuid,
  session_token_value text,
  company_name_value text,
  company_slug_value text,
  admin_username_value text,
  admin_first_name_value text default null,
  admin_last_name_value text default null,
  admin_email_value text default null
)
returns table (
  company_id uuid,
  company_name text,
  company_slug text,
  admin_account_id uuid,
  admin_username text,
  temporary_password text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_account public.internal_accounts%rowtype;
  clean_company_name text := nullif(trim(coalesce(company_name_value, '')), '');
  clean_company_slug text := lower(regexp_replace(trim(coalesce(company_slug_value, '')), '[^a-zA-Z0-9-]', '', 'g'));
  clean_admin_username text := trim(coalesce(admin_username_value, ''));
  clean_admin_first_name text := nullif(trim(coalesce(admin_first_name_value, '')), '');
  clean_admin_last_name text := nullif(trim(coalesce(admin_last_name_value, '')), '');
  clean_admin_email text := lower(nullif(trim(coalesce(admin_email_value, '')), ''));
  next_display_name text;
  saved_company public.companies%rowtype;
  saved_account public.internal_accounts%rowtype;
  temp_password text := '123456';
begin
  platform_account := public.validate_platform_admin_session(platform_account_id_value, session_token_value);

  if clean_company_name is null then
    raise exception 'IngresÃ¡ el nombre de la empresa.';
  end if;

  if clean_company_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then
    raise exception 'El slug debe tener entre 3 y 63 caracteres, con letras minÃºsculas, nÃºmeros o guion.';
  end if;

  if clean_company_slug = 'plataforma' then
    raise exception 'Ese slug estÃ¡ reservado para administraciÃ³n plataforma.';
  end if;

  if length(clean_admin_username) < 3 or clean_admin_username !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'El usuario administrador debe tener al menos 3 caracteres y solo puede usar letras, nÃºmeros, punto, guion o guion bajo.';
  end if;

  if clean_admin_email is not null and not public.is_valid_email(clean_admin_email) then
    raise exception 'IngresÃ¡ un mail vÃ¡lido para el administrador.';
  end if;

  next_display_name := trim(concat_ws(' ', clean_admin_first_name, clean_admin_last_name));
  if next_display_name = '' then
    next_display_name := clean_admin_username;
  end if;

  insert into public.companies (name, slug, status, owner_email, contact_email)
  values (clean_company_name, clean_company_slug, 'active', clean_admin_email, clean_admin_email)
  on conflict (slug) do update set
    name = excluded.name,
    status = 'active',
    owner_email = coalesce(excluded.owner_email, public.companies.owner_email),
    contact_email = coalesce(excluded.contact_email, public.companies.contact_email),
    updated_at = now()
  returning * into saved_company;

  insert into public.app_configuration (
    id,
    company_id,
    company_name,
    business_hours_text,
    banner_images,
    promotions,
    discounts,
    client_can_choose_employee
  ) values (
    true,
    saved_company.id,
    clean_company_name,
    '',
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    false
  )
  on conflict on constraint app_configuration_company_id_key do update set
    company_name = excluded.company_name,
    updated_at = now();

  select *
  into saved_account
  from public.internal_accounts accounts
  where accounts.company_id = saved_company.id
    and accounts.username_normalized = public.normalize_text(clean_admin_username)
  limit 1;

  insert into public.internal_accounts (
    company_id,
    role,
    username,
    display_name,
    first_name,
    last_name,
    username_normalized,
    password_hash,
    employee_id,
    active,
    must_change_password
  ) values (
    saved_company.id,
    'admin'::public.app_role,
    clean_admin_username,
    next_display_name,
    clean_admin_first_name,
    clean_admin_last_name,
    public.normalize_text(clean_admin_username),
    extensions.crypt(temp_password, extensions.gen_salt('bf')),
    null,
    true,
    true
  )
  on conflict on constraint internal_accounts_company_username_uidx do update
  set role = 'admin'::public.app_role,
      username = excluded.username,
      display_name = excluded.display_name,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      password_hash = excluded.password_hash,
      active = true,
      must_change_password = true,
      updated_at = now()
  returning * into saved_account;

  if clean_admin_email is not null then
    update public.company_memberships memberships
    set role = 'admin'::public.app_role,
        status = case when memberships.status = 'disabled' then 'disabled' else 'invited' end,
        updated_at = now()
    where memberships.company_id = saved_company.id
      and lower(memberships.email) = clean_admin_email;

    if not found then
      insert into public.company_memberships (company_id, email, role, employee_id, status)
      values (saved_company.id, clean_admin_email, 'admin'::public.app_role, null, 'invited');
    end if;
  end if;

  return query
  select
    saved_company.id,
    saved_company.name,
    saved_company.slug,
    saved_account.id,
    saved_account.username,
    temp_password;
end;
$$;

revoke execute on function public.platform_create_company_admin(uuid, text, text, text, text, text, text, text) from public;
grant execute on function public.platform_create_company_admin(uuid, text, text, text, text, text, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/044_fix_send_resend_email_overload.sql
-- ============================================================================

-- Fix ambiguous send_resend_email overload after tenant-aware mail changes.
-- Run after 042_platform_mail_tenant_links.sql.

begin;

drop function if exists public.send_resend_email(text, text, text, text, text, text, uuid);

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
  perform public.send_resend_email(
    to_email_value::text,
    subject_value::text,
    message_value::text,
    from_name_value::text,
    reply_to_value::text,
    html_message_value::text,
    null::uuid
  );
end;
$$;

revoke execute on function public.send_resend_email(text, text, text, text, text, text, uuid) from public;
revoke execute on function public.send_resend_email(text, text, text, text, text, text) from public;

commit;


-- ============================================================================
-- Source: database/045_tenant_admin_employee_management.sql
-- ============================================================================

-- Tenant-aware admin employee create/update.
-- Run after 044_fix_send_resend_email_overload.sql.

begin;

drop function if exists public.create_admin_employee(text, text, text, date, text, text, text, text, text, text, text[], boolean, uuid, text, text);
drop function if exists public.update_admin_employee(uuid, text, text, text, date, text, text, text, text, text, text, boolean, boolean, text[], uuid, text, text);

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
  email_value text default null,
  company_slug_value text default null
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
  target_company_id uuid;
  admin_account public.internal_accounts%rowtype;
  created_employee record;
  saved_employee public.employees%rowtype;
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
  welcome_message text;
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null then
    raise exception 'La empresa no estÃ¡ disponible.';
  end if;

  if admin_account.company_id is distinct from target_company_id then
    raise exception 'No podÃ©s administrar otra empresa.';
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'IngresÃ¡ un mail vÃ¡lido para el empleado.';
  end if;

  for created_employee in
    select *
    from public.create_admin_employee_legacy(
      name_value,
      first_name_value,
      last_name_value,
      birth_date_value,
      phone_value,
      address_street_value,
      address_number_value,
      address_locality_value,
      photo_url_value,
      code_value,
      service_ids_value,
      is_admin_value,
      account_id_value
    )
  loop
    update public.employees
    set email = clean_email,
        company_id = target_company_id,
        updated_at = now()
    where employees.id = created_employee.id
    returning * into saved_employee;

    update public.internal_accounts
    set company_id = target_company_id,
        updated_at = now()
    where internal_accounts.employee_id = saved_employee.id;

    update public.employee_services
    set company_id = target_company_id
    where employee_services.employee_id = saved_employee.id;

    welcome_message := concat_ws(E'\n',
      'Tu acceso interno fue creado.',
      'Usuario: ' || created_employee.internal_username,
      'ContraseÃ±a inicial: 123456',
      'Al ingresar se te va a pedir cambiar la contraseÃ±a.',
      'Este es un mensaje automÃ¡tico, no respondas este mail.'
    );

    perform public.send_resend_email(
      clean_email::text,
      'Tu acceso interno fue creado'::text,
      welcome_message::text,
      'Quiero Turno App - No responder'::text,
      null::text,
      null::text,
      target_company_id::uuid
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
  email_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  admin_account public.internal_accounts%rowtype;
  updated_employee jsonb;
  saved_employee public.employees%rowtype;
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null then
    raise exception 'La empresa no estÃ¡ disponible.';
  end if;

  if admin_account.company_id is distinct from target_company_id then
    raise exception 'No podÃ©s administrar otra empresa.';
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'IngresÃ¡ un mail vÃ¡lido para el empleado.';
  end if;

  if not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.company_id = target_company_id
      and employees.deleted_at is null
  ) then
    raise exception 'El empleado no pertenece a esta empresa.';
  end if;

  updated_employee := public.update_admin_employee_legacy(
    employee_id_value,
    name_value,
    first_name_value,
    last_name_value,
    birth_date_value,
    phone_value,
    address_street_value,
    address_number_value,
    address_locality_value,
    photo_url_value,
    code_value,
    active_value,
    is_admin_value,
    service_ids_value,
    account_id_value
  );

  update public.employees
  set email = clean_email,
      company_id = target_company_id,
      updated_at = now()
  where employees.id = employee_id_value
  returning * into saved_employee;

  update public.internal_accounts
  set company_id = target_company_id,
      updated_at = now()
  where internal_accounts.employee_id = employee_id_value;

  update public.employee_services
  set company_id = target_company_id
  where employee_services.employee_id = employee_id_value;

  return to_jsonb(saved_employee) || jsonb_build_object(
    'is_admin', is_admin_value,
    'internal_username', coalesce(updated_employee ->> 'internal_username', saved_employee.name)
  );
end;
$$;

update public.employees employees
set company_id = accounts.company_id,
    updated_at = now()
from public.internal_accounts accounts
where accounts.employee_id = employees.id
  and accounts.company_id is not null
  and employees.company_id is distinct from accounts.company_id;

update public.employee_services relations
set company_id = employees.company_id
from public.employees employees
where relations.employee_id = employees.id
  and employees.company_id is not null
  and relations.company_id is distinct from employees.company_id;

revoke execute on function public.create_admin_employee(text, text, text, date, text, text, text, text, text, text, text[], boolean, uuid, text, text, text) from public;
revoke execute on function public.update_admin_employee(uuid, text, text, text, date, text, text, text, text, text, text, boolean, boolean, text[], uuid, text, text, text) from public;

grant execute on function public.create_admin_employee(text, text, text, date, text, text, text, text, text, text, text[], boolean, uuid, text, text, text) to anon, authenticated;
grant execute on function public.update_admin_employee(uuid, text, text, text, date, text, text, text, text, text, text, boolean, boolean, text[], uuid, text, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/046_drop_ambiguous_employee_rpcs.sql
-- ============================================================================

-- Drop legacy overloaded employee RPC signatures that confuse PostgREST named-argument resolution.
-- Run after 045_tenant_admin_employee_management.sql.

begin;

drop function if exists public.create_admin_employee(
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  boolean,
  uuid,
  text,
  text
);

drop function if exists public.update_admin_employee(
  uuid,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  text[],
  uuid,
  text,
  text
);

grant execute on function public.create_admin_employee(text, text, text, date, text, text, text, text, text, text, text[], boolean, uuid, text, text, text) to anon, authenticated;
grant execute on function public.update_admin_employee(uuid, text, text, text, date, text, text, text, text, text, text, boolean, boolean, text[], uuid, text, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/047_employee_company_fallback.sql
-- ============================================================================

-- Infer employee company from the internal admin session when company_slug_value is missing.
-- Run after 046_drop_ambiguous_employee_rpcs.sql.

begin;

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
  email_value text default null,
  company_slug_value text default null
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
  target_company_id uuid;
  admin_account public.internal_accounts%rowtype;
  created_employee record;
  saved_employee public.employees%rowtype;
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
  welcome_message text;
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null then
    raise exception 'La empresa no estÃ¡ disponible.';
  end if;

  if admin_account.company_id is distinct from target_company_id then
    raise exception 'No podÃ©s administrar otra empresa.';
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'IngresÃ¡ un mail vÃ¡lido para el empleado.';
  end if;

  for created_employee in
    select *
    from public.create_admin_employee_legacy(
      name_value,
      first_name_value,
      last_name_value,
      birth_date_value,
      phone_value,
      address_street_value,
      address_number_value,
      address_locality_value,
      photo_url_value,
      code_value,
      service_ids_value,
      is_admin_value,
      account_id_value
    )
  loop
    update public.employees
    set email = clean_email,
        company_id = target_company_id,
        updated_at = now()
    where employees.id = created_employee.id
    returning * into saved_employee;

    update public.internal_accounts
    set company_id = target_company_id,
        updated_at = now()
    where internal_accounts.employee_id = saved_employee.id;

    update public.employee_services
    set company_id = target_company_id
    where employee_services.employee_id = saved_employee.id;

    welcome_message := concat_ws(E'\n',
      'Tu acceso interno fue creado.',
      'Usuario: ' || created_employee.internal_username,
      'ContraseÃ±a inicial: 123456',
      'Al ingresar se te va a pedir cambiar la contraseÃ±a.',
      'Este es un mensaje automÃ¡tico, no respondas este mail.'
    );

    perform public.send_resend_email(
      clean_email::text,
      'Tu acceso interno fue creado'::text,
      welcome_message::text,
      'Quiero Turno App - No responder'::text,
      null::text,
      null::text,
      target_company_id::uuid
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
  email_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  admin_account public.internal_accounts%rowtype;
  updated_employee jsonb;
  saved_employee public.employees%rowtype;
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null then
    raise exception 'La empresa no estÃ¡ disponible.';
  end if;

  if admin_account.company_id is distinct from target_company_id then
    raise exception 'No podÃ©s administrar otra empresa.';
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'IngresÃ¡ un mail vÃ¡lido para el empleado.';
  end if;

  if not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.company_id = target_company_id
      and employees.deleted_at is null
  ) then
    raise exception 'El empleado no pertenece a esta empresa.';
  end if;

  updated_employee := public.update_admin_employee_legacy(
    employee_id_value,
    name_value,
    first_name_value,
    last_name_value,
    birth_date_value,
    phone_value,
    address_street_value,
    address_number_value,
    address_locality_value,
    photo_url_value,
    code_value,
    active_value,
    is_admin_value,
    service_ids_value,
    account_id_value
  );

  update public.employees
  set email = clean_email,
      company_id = target_company_id,
      updated_at = now()
  where employees.id = employee_id_value
  returning * into saved_employee;

  update public.internal_accounts
  set company_id = target_company_id,
      updated_at = now()
  where internal_accounts.employee_id = employee_id_value;

  update public.employee_services
  set company_id = target_company_id
  where employee_services.employee_id = employee_id_value;

  return to_jsonb(saved_employee) || jsonb_build_object(
    'is_admin', is_admin_value,
    'internal_username', coalesce(updated_employee ->> 'internal_username', saved_employee.name)
  );
end;
$$;

commit;


-- ============================================================================
-- Source: database/048_tenant_admin_services.sql
-- ============================================================================

-- Tenant-aware service create/update.
-- Run after 047_employee_company_fallback.sql.

begin;

drop function if exists public.save_admin_service(bigint, text, text, text, integer, boolean, uuid);
drop function if exists public.save_admin_service(bigint, text, text, text, integer, boolean, uuid, text);
drop function if exists public.save_admin_service(bigint, text, text, text, integer, numeric, boolean, uuid, text);
drop function if exists public.save_admin_service(bigint, text, text, text, integer, numeric, boolean, uuid, text, text);

create or replace function public.save_admin_service(
  service_id_value bigint,
  name_value text,
  icon_value text,
  color_value text,
  default_duration_value integer,
  base_price_value numeric,
  active_value boolean,
  account_id_value uuid default null,
  session_token_value text default null,
  activity_discount_check_id_value text default null,
  company_slug_value text default null
)
returns table (
  id bigint,
  name text,
  icon text,
  color text,
  default_duration integer,
  base_price numeric,
  active boolean,
  activity_discount_check_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := nullif(trim(coalesce(name_value, '')), '');
  clean_color text := coalesce(nullif(trim(coalesce(color_value, '')), ''), '#42A5F5');
  clean_duration integer := coalesce(default_duration_value, 30);
  clean_base_price numeric := coalesce(base_price_value, 0);
  clean_activity_discount_check_id text := nullif(trim(coalesce(activity_discount_check_id_value, '')), '');
  admin_account public.internal_accounts%rowtype;
  target_company_id uuid;
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null then
    raise exception 'La empresa no estÃ¡ disponible.';
  end if;

  if admin_account.company_id is distinct from target_company_id then
    raise exception 'No podÃ©s administrar otra empresa.';
  end if;

  if clean_name is null then
    raise exception 'Ingresa el nombre del servicio.';
  end if;

  if clean_duration <= 0 then
    raise exception 'La duracion del servicio debe ser mayor a cero.';
  end if;

  if clean_base_price < 0 then
    raise exception 'El precio base no puede ser negativo.';
  end if;

  if service_id_value is null then
    return query
    insert into public.services (company_id, name, icon, color, default_duration, base_price, active, activity_discount_check_id)
    values (
      target_company_id,
      clean_name,
      nullif(trim(coalesce(icon_value, '')), ''),
      clean_color,
      clean_duration,
      clean_base_price,
      coalesce(active_value, true),
      clean_activity_discount_check_id
    )
    returning services.id, services.name, services.icon, services.color, services.default_duration, services.base_price, services.active, services.activity_discount_check_id;

    return;
  end if;

  return query
  update public.services
  set name = clean_name,
      icon = nullif(trim(coalesce(icon_value, '')), ''),
      color = clean_color,
      default_duration = clean_duration,
      base_price = clean_base_price,
      active = coalesce(active_value, true),
      activity_discount_check_id = clean_activity_discount_check_id,
      company_id = target_company_id
  where services.id = service_id_value
    and services.company_id = target_company_id
  returning services.id, services.name, services.icon, services.color, services.default_duration, services.base_price, services.active, services.activity_discount_check_id;

  if not found then
    raise exception 'El servicio no pertenece a esta empresa.';
  end if;
end;
$$;

revoke execute on function public.save_admin_service(bigint, text, text, text, integer, numeric, boolean, uuid, text, text, text) from public;

grant execute on function public.save_admin_service(bigint, text, text, text, integer, numeric, boolean, uuid, text, text, text) to anon, authenticated;

commit;


-- ============================================================================
-- Source: database/049_tenant_availability_fallback.sql
-- ============================================================================

-- Tenant-aware availability fallback and filtered admin availability payload.
-- Run after 048_tenant_admin_services.sql.

begin;

create or replace function public.get_admin_panel_data(
  account_id_value uuid default null,
  request_status_value text default 'pending',
  session_token_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_account public.internal_accounts%rowtype;
  target_company_id uuid;
  payload jsonb;
begin
  if public.is_admin() then
    target_company_id := public.get_company_id_by_slug(company_slug_value);

    if target_company_id is null then
      raise exception 'La empresa no estÃ¡ disponible.';
    end if;

    if not exists (
      select 1
      from public.profiles profiles
      where profiles.user_id = auth.uid()
        and profiles.role = 'admin'::public.app_role
        and profiles.active is not false
        and profiles.company_id = target_company_id
    ) then
      raise exception 'No podÃ©s administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

    if target_company_id is null then
      raise exception 'La empresa no estÃ¡ disponible.';
    end if;

    if admin_account.company_id is distinct from target_company_id then
      raise exception 'No podÃ©s administrar otra empresa.';
    end if;
  end if;

  select jsonb_build_object(
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(booking_rows) order by booking_rows.start_at)
      from (
        select *
        from public.bookings bookings
        where bookings.company_id = target_company_id
        order by bookings.start_at
      ) booking_rows
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(to_jsonb(employee_rows) order by employee_rows.name)
      from (
        select
          employees.*,
          coalesce(accounts.role = 'admin'::public.app_role, false) as is_admin,
          accounts.username as internal_username
        from public.employees employees
        left join public.internal_accounts accounts
          on accounts.employee_id = employees.id
          and accounts.active = true
          and accounts.company_id = target_company_id
        where employees.company_id = target_company_id
          and employees.deleted_at is null
      ) employee_rows
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
        order by availability.available_date, availability.start_time
      ) availability_rows
    ), '[]'::jsonb),
    'accessRequests', coalesce((
      select jsonb_agg(to_jsonb(request_rows) order by request_rows.created_at desc)
      from (
        select
          requests.id,
          requests.role,
          requests.username,
          requests.display_name,
          requests.first_name,
          requests.last_name,
          requests.birth_date,
          requests.phone,
          requests.address_street,
          requests.address_number,
          requests.address_locality,
          requests.photo_url,
          requests.employee_id,
          requests.status,
          requests.created_at,
          requests.reviewed_at
        from public.internal_registration_requests requests
        where requests.company_id = target_company_id
          and (request_status_value is null or requests.status = request_status_value)
      ) request_rows
    ), '[]'::jsonb)
  ) into payload;

  return payload;
end;
$$;

create or replace function public.list_internal_employee_availability(
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
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), account_record.company_id);

  if target_company_id is null or account_record.company_id is distinct from target_company_id then
    raise exception 'La cuenta interna no pertenece a esta empresa.';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(availability) order by availability.available_date, availability.start_time)
    from public.employee_availability availability
    where availability.company_id = target_company_id
      and availability.employee_id = account_record.employee_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.save_admin_employee_availability(
  availability_id_value text,
  employee_id_value uuid,
  available_date_value date,
  start_time_value time without time zone,
  end_time_value time without time zone,
  active_value boolean default true,
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
  target_company_id uuid;
  admin_account public.internal_accounts%rowtype;
  result jsonb;
begin
  if public.is_admin() then
    target_company_id := public.get_company_id_by_slug(company_slug_value);

    if target_company_id is null then
      raise exception 'La empresa no estÃ¡ disponible.';
    end if;

    if not exists (
      select 1
      from public.profiles profiles
      where profiles.user_id = auth.uid()
        and profiles.role = 'admin'::public.app_role
        and profiles.active is not false
        and profiles.company_id = target_company_id
    ) then
      raise exception 'No podÃ©s administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

    if target_company_id is null then
      raise exception 'La empresa no estÃ¡ disponible.';
    end if;

    if admin_account.company_id is distinct from target_company_id then
      raise exception 'No podÃ©s administrar otra empresa.';
    end if;
  end if;

  if not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.company_id = target_company_id
      and employees.deleted_at is null
  ) then
    raise exception 'El empleado no pertenece a esta empresa.';
  end if;

  if availability_id_value is not null and not exists (
    select 1
    from public.employee_availability availability
    where availability.id = availability_id_value::uuid
      and availability.company_id = target_company_id
  ) then
    raise exception 'La disponibilidad no pertenece a esta empresa.';
  end if;

  result := public.save_admin_employee_availability_legacy(
    availability_id_value,
    employee_id_value,
    available_date_value,
    start_time_value,
    end_time_value,
    active_value,
    account_id_value
  );

  update public.employee_availability
  set company_id = target_company_id
  where id = (result->>'id')::uuid;

  return result || jsonb_build_object('company_id', target_company_id);
end;
$$;

create or replace function public.delete_admin_employee_availability(
  availability_id_value text,
  account_id_value uuid default null,
  session_token_value text default null,
  company_slug_value text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  admin_account public.internal_accounts%rowtype;
begin
  if public.is_admin() then
    target_company_id := public.get_company_id_by_slug(company_slug_value);

    if target_company_id is null then
      raise exception 'La empresa no estÃ¡ disponible.';
    end if;

    if not exists (
      select 1
      from public.profiles profiles
      where profiles.user_id = auth.uid()
        and profiles.role = 'admin'::public.app_role
        and profiles.active is not false
        and profiles.company_id = target_company_id
    ) then
      raise exception 'No podÃ©s administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

    if target_company_id is null then
      raise exception 'La empresa no estÃ¡ disponible.';
    end if;

    if admin_account.company_id is distinct from target_company_id then
      raise exception 'No podÃ©s administrar otra empresa.';
    end if;
  end if;

  if not exists (
    select 1
    from public.employee_availability availability
    where availability.id = availability_id_value::uuid
      and availability.company_id = target_company_id
  ) then
    raise exception 'La disponibilidad no pertenece a esta empresa.';
  end if;

  perform public.delete_admin_employee_availability_legacy(availability_id_value, account_id_value);
end;
$$;

create or replace function public.create_internal_employee_availability(
  account_id_value uuid,
  available_date_value date,
  start_time_value time without time zone,
  end_time_value time without time zone,
  active_value boolean default true,
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
  result jsonb;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), account_record.company_id);

  if target_company_id is null or account_record.company_id is distinct from target_company_id then
    raise exception 'La cuenta interna no pertenece a esta empresa.';
  end if;

  result := public.create_internal_employee_availability_legacy(
    account_id_value,
    available_date_value,
    start_time_value,
    end_time_value,
    active_value
  );

  update public.employee_availability
  set company_id = target_company_id
  where id = (result->>'id')::uuid;

  return result || jsonb_build_object('company_id', target_company_id);
end;
$$;

create or replace function public.update_internal_employee_availability(
  account_id_value uuid,
  availability_id_value text,
  available_date_value date,
  start_time_value time without time zone,
  end_time_value time without time zone,
  active_value boolean default true,
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
  result jsonb;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), account_record.company_id);

  if target_company_id is null or account_record.company_id is distinct from target_company_id then
    raise exception 'La cuenta interna no pertenece a esta empresa.';
  end if;

  if not exists (
    select 1
    from public.employee_availability availability
    where availability.id = availability_id_value::uuid
      and availability.company_id = target_company_id
      and availability.employee_id = account_record.employee_id
  ) then
    raise exception 'La disponibilidad no pertenece a esta empresa.';
  end if;

  result := public.update_internal_employee_availability_legacy(
    account_id_value,
    availability_id_value,
    available_date_value,
    start_time_value,
    end_time_value,
    active_value
  );

  update public.employee_availability
  set company_id = target_company_id
  where id = availability_id_value::uuid;

  return result || jsonb_build_object('company_id', target_company_id);
end;
$$;

create or replace function public.delete_internal_employee_availability(
  account_id_value uuid,
  availability_id_value text,
  session_token_value text default null,
  company_slug_value text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  target_company_id uuid;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), account_record.company_id);

  if target_company_id is null or account_record.company_id is distinct from target_company_id then
    raise exception 'La cuenta interna no pertenece a esta empresa.';
  end if;

  if not exists (
    select 1
    from public.employee_availability availability
    where availability.id = availability_id_value::uuid
      and availability.company_id = target_company_id
      and availability.employee_id = account_record.employee_id
  ) then
    raise exception 'La disponibilidad no pertenece a esta empresa.';
  end if;

  perform public.delete_internal_employee_availability_legacy(account_id_value, availability_id_value);
end;
$$;

grant execute on function public.get_admin_panel_data(uuid, text, text, text) to anon, authenticated;
grant execute on function public.list_internal_employee_availability(uuid, text, text) to anon, authenticated;
grant execute on function public.save_admin_employee_availability(text, uuid, date, time without time zone, time without time zone, boolean, uuid, text, text) to anon, authenticated;
grant execute on function public.delete_admin_employee_availability(text, uuid, text, text) to anon, authenticated;
grant execute on function public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean, text, text) to anon, authenticated;
grant execute on function public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean, text, text) to anon, authenticated;
grant execute on function public.delete_internal_employee_availability(uuid, text, text, text) to anon, authenticated;

commit;

