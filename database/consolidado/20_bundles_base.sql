-- -----------------------------------------------------------------------------
-- 20_bundles_base.sql
-- -----------------------------------------------------------------------------
-- Fase 2.1: Packs y Promos v2 (bundles) - capa de datos base.
--
-- Un "bundle" agrupa varios servicios que se contratan juntos y se agendan
-- BACK-TO-BACK (sin huecos), enlazados por booking_group_id.
--   - type 'pack':  precio de CADA item = precio del catalogo (services.base_price).
--                   bundle_items.price queda NULL (se resuelve al catalogo).
--                   No tiene vencimiento.
--   - type 'promo': precio de CADA item es PROPIO (bundle_items.price no nulo) e
--                   independiente del catalogo. Puede tener vencimiento
--                   (valid_from / valid_until).
--
-- Los bundles se ofrecen en TODAS las sucursales (no hay bundle_branches).
-- Un empleado solo atiende SUS servicios (employee_services); no hay
-- bundle_employees.
--
-- Ejecutar despues de 19_employee_branches_all.sql. Idempotente / aditivo.
-- -----------------------------------------------------------------------------

begin;

-- -----------------------------------------------------------------------------
-- 1) Tabla bundles (packs y promos)
-- -----------------------------------------------------------------------------
create table if not exists public.bundles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  type text not null,
  name text not null,
  description text,
  image_url text,
  valid_from date,
  valid_until date,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  constraint bundles_type_chk check (type in ('pack', 'promo')),
  constraint bundles_name_not_blank_chk check (length(trim(name)) > 0),
  constraint bundles_valid_range_chk check (
    valid_from is null or valid_until is null or valid_until >= valid_from
  ),
  -- Los packs no manejan vencimiento; solo las promos pueden tenerlo.
  constraint bundles_pack_no_expiry_chk check (
    type <> 'pack' or (valid_from is null and valid_until is null)
  )
);

create index if not exists bundles_company_idx
  on public.bundles(company_id);
create index if not exists bundles_company_type_idx
  on public.bundles(company_id, type, active);

drop trigger if exists bundles_set_updated_at on public.bundles;
create trigger bundles_set_updated_at
before update on public.bundles
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2) Tabla bundle_items (servicios que componen el bundle, ordenados)
-- -----------------------------------------------------------------------------
create table if not exists public.bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.bundles(id) on delete cascade,
  service_id bigint not null references public.services(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete cascade,
  position integer not null default 0,
  -- NULL => usa services.base_price (pack). No nulo => precio propio (promo).
  price numeric(12, 2),
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  constraint bundle_items_price_chk check (price is null or price >= 0)
);

create index if not exists bundle_items_bundle_idx
  on public.bundle_items(bundle_id);
create index if not exists bundle_items_company_idx
  on public.bundle_items(company_id);

drop trigger if exists bundle_items_set_updated_at on public.bundle_items;
create trigger bundle_items_set_updated_at
before update on public.bundle_items
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3) Columnas de bundle en bookings (turnos que forman parte de un combo)
-- -----------------------------------------------------------------------------
alter table public.bookings
  add column if not exists bundle_id uuid references public.bundles(id) on delete set null;
alter table public.bookings
  add column if not exists bundle_type text;
alter table public.bookings
  add column if not exists booking_group_id uuid;
-- Precio del servicio DENTRO del combo (catalogo en pack, propio en promo).
-- Se guarda como snapshot al reservar para no depender de cambios posteriores.
alter table public.bookings
  add column if not exists item_price numeric(12, 2);

alter table public.bookings
  drop constraint if exists bookings_bundle_type_chk;
alter table public.bookings
  add constraint bookings_bundle_type_chk
  check (bundle_type is null or bundle_type in ('pack', 'promo'));

alter table public.bookings
  drop constraint if exists bookings_item_price_chk;
alter table public.bookings
  add constraint bookings_item_price_chk
  check (item_price is null or item_price >= 0);

create index if not exists bookings_group_idx
  on public.bookings(booking_group_id);
create index if not exists bookings_bundle_idx
  on public.bookings(bundle_id);

-- -----------------------------------------------------------------------------
-- 4) Flag packs_habilitados (promociones_habilitadas ya existe y se reutiliza)
-- -----------------------------------------------------------------------------
alter table public.app_configuration
  add column if not exists packs_habilitados boolean not null default false;

create or replace function public.obtener_configuracion_operativa(configuracion public.app_configuration)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'precios_habilitados', coalesce(configuracion.precios_habilitados, true),
    'descuentos_habilitados', coalesce(configuracion.descuentos_habilitados, true),
    'recargos_habilitados', coalesce(configuracion.recargos_habilitados, true),
    'promociones_habilitadas', coalesce(configuracion.promociones_habilitadas, true),
    'packs_habilitados', coalesce(configuracion.packs_habilitados, false),
    'sucursales_habilitadas', coalesce(configuracion.sucursales_habilitadas, false),
    'turnos_superpuestos_habilitados', coalesce(configuracion.turnos_superpuestos_habilitados, true),
    'intervalo_grilla_minutos', coalesce(configuracion.intervalo_grilla_minutos, 30),
    'empleados_pueden_reservar', coalesce(configuracion.empleados_pueden_reservar, true),
    'empleados_ven_agenda_completa', coalesce(configuracion.empleados_ven_agenda_completa, true),
    'visibilidad_turnos_empleado', coalesce(configuracion.visibilidad_turnos_empleado, 'completa'),
    'empleados_cancelan_turnos', coalesce(configuracion.empleados_cancelan_turnos, 'propios'),
    'empleados_ven_detalle_turnos', coalesce(configuracion.empleados_ven_detalle_turnos, 'propios'),
    'pdf_detalle_turno_habilitado', coalesce(configuracion.pdf_detalle_turno_habilitado, false)
  )
$$;

commit;
