-- ============================================================================
-- Fase 1: Sucursales (branches)
-- ============================================================================
-- Agrega sucursales por empresa y las relaciona con servicios, empleados,
-- disponibilidad y turnos. Es idempotente y hace backfill de los datos
-- existentes hacia una sucursal "Principal" por empresa.
-- Ejecutar despues de 12_client_login_usuario_dni.sql.

begin;

-- -----------------------------------------------------------------------------
-- 1) Tabla de sucursales
-- -----------------------------------------------------------------------------
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  address_street text,
  address_number text,
  address_locality text,
  phone text,
  email text,
  maps_url text,
  image_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  constraint branches_name_not_blank_chk check (length(trim(name)) > 0)
);

create index if not exists branches_company_idx
  on public.branches(company_id, active, sort_order);

drop trigger if exists branches_set_updated_at on public.branches;
create trigger branches_set_updated_at
before update on public.branches
for each row execute function public.set_updated_at();

-- Sucursal "Principal" por empresa que aun no tenga ninguna.
insert into public.branches (company_id, name, sort_order)
select c.id, 'Principal', 0
from public.companies c
where not exists (
  select 1 from public.branches b where b.company_id = c.id
);

-- CTE reutilizable: sucursal por defecto (mas antigua) de cada empresa.
-- Se usa en cada backfill de esta migracion.

-- -----------------------------------------------------------------------------
-- 2) Servicios disponibles por sucursal (solo disponibilidad, sin override de precio)
-- -----------------------------------------------------------------------------
create table if not exists public.branch_services (
  branch_id uuid not null references public.branches(id) on delete cascade,
  service_id bigint not null references public.services(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  active boolean not null default true,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  primary key (branch_id, service_id)
);

create index if not exists branch_services_company_idx
  on public.branch_services(company_id);
create index if not exists branch_services_service_idx
  on public.branch_services(service_id);

drop trigger if exists branch_services_set_updated_at on public.branch_services;
create trigger branch_services_set_updated_at
before update on public.branch_services
for each row execute function public.set_updated_at();

-- Backfill: cada servicio existente queda disponible en la sucursal por defecto.
with default_branch as (
  select distinct on (company_id) company_id, id as branch_id
  from public.branches
  order by company_id, sort_order, created_at
)
insert into public.branch_services (branch_id, service_id, company_id, active)
select db.branch_id, s.id, s.company_id, true
from public.services s
join default_branch db on db.company_id = s.company_id
where s.company_id is not null
on conflict (branch_id, service_id) do nothing;

-- -----------------------------------------------------------------------------
-- 3) Empleados por sucursal (un empleado puede trabajar en varias)
-- -----------------------------------------------------------------------------
create table if not exists public.employee_branches (
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  active boolean not null default true,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  primary key (employee_id, branch_id)
);

create index if not exists employee_branches_company_idx
  on public.employee_branches(company_id);
create index if not exists employee_branches_branch_idx
  on public.employee_branches(branch_id);

drop trigger if exists employee_branches_set_updated_at on public.employee_branches;
create trigger employee_branches_set_updated_at
before update on public.employee_branches
for each row execute function public.set_updated_at();

-- Backfill: cada empleado existente queda asignado a la sucursal por defecto.
with default_branch as (
  select distinct on (company_id) company_id, id as branch_id
  from public.branches
  order by company_id, sort_order, created_at
)
insert into public.employee_branches (employee_id, branch_id, company_id, active)
select e.id, db.branch_id, e.company_id, true
from public.employees e
join default_branch db on db.company_id = e.company_id
where e.company_id is not null
on conflict (employee_id, branch_id) do nothing;

-- -----------------------------------------------------------------------------
-- 4) Disponibilidad por sucursal
-- -----------------------------------------------------------------------------
-- Nota: la restriccion de no-solapamiento de disponibilidad se mantiene GLOBAL
-- por empleado (no incluye branch_id) porque una persona no puede estar
-- disponible en dos sucursales al mismo tiempo.
alter table public.employee_availability
  add column if not exists branch_id uuid references public.branches(id) on delete cascade;

with default_branch as (
  select distinct on (company_id) company_id, id as branch_id
  from public.branches
  order by company_id, sort_order, created_at
)
update public.employee_availability ea
set branch_id = db.branch_id
from default_branch db
where ea.branch_id is null
  and db.company_id = ea.company_id;

create index if not exists employee_availability_branch_idx
  on public.employee_availability(branch_id);

-- -----------------------------------------------------------------------------
-- 5) Turnos por sucursal
-- -----------------------------------------------------------------------------
alter table public.bookings
  add column if not exists branch_id uuid references public.branches(id) on delete restrict;

with default_branch as (
  select distinct on (company_id) company_id, id as branch_id
  from public.branches
  order by company_id, sort_order, created_at
)
update public.bookings b
set branch_id = db.branch_id
from default_branch db
where b.branch_id is null
  and db.company_id = b.company_id;

create index if not exists bookings_company_branch_idx
  on public.bookings(company_id, branch_id, start_at);

commit;
