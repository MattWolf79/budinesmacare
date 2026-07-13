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
where internal_accounts.company_id is null;

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
