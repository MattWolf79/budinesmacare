-- Employee recurring availability for Turnos App.
-- Target: Supabase / PostgreSQL.
-- Run after the base schema migration on existing databases.

begin;

create extension if not exists btree_gist;

create table if not exists public.employee_availability (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  available_date date not null,
  weekday smallint not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  active boolean not null default true,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  constraint employee_availability_weekday_chk check (weekday between 0 and 6),
  constraint employee_availability_valid_range_chk check (end_time > start_time)
);

alter table public.employee_availability
  add column if not exists available_date date;

update public.employee_availability
set available_date = current_date + (((weekday::int - extract(dow from current_date)::int + 7) % 7)::int)
where available_date is null;

alter table public.employee_availability
  alter column available_date set not null;

create index if not exists employee_availability_employee_date_idx
  on public.employee_availability(employee_id, available_date, start_time, end_time);

drop index if exists employee_availability_employee_weekday_idx;

alter table public.employee_availability
  drop constraint if exists employee_availability_no_overlap_excl;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employee_availability_no_overlap_excl') then
    alter table public.employee_availability
      add constraint employee_availability_no_overlap_excl
      exclude using gist (
        employee_id with =,
        available_date with =,
        int4range(
          ((extract(hour from start_time)::int * 60) + extract(minute from start_time)::int),
          ((extract(hour from end_time)::int * 60) + extract(minute from end_time)::int),
          '[)'
        ) with &&
      )
      where (active = true);
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists employee_availability_set_updated_at on public.employee_availability;
create trigger employee_availability_set_updated_at
before update on public.employee_availability
for each row execute function public.set_updated_at();

drop function if exists public.list_internal_employee_availability(uuid);
drop function if exists public.create_internal_employee_availability(uuid, smallint, time without time zone, time without time zone, boolean);
drop function if exists public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean);
drop function if exists public.update_internal_employee_availability(uuid, text, smallint, time without time zone, time without time zone, boolean);
drop function if exists public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean);
drop function if exists public.delete_internal_employee_availability(uuid, text);

create or replace function public.list_internal_employee_availability(account_id_value uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  availability_payload jsonb;
begin
  select *
  into account_record
  from public.internal_accounts
  where internal_accounts.id = account_id_value
    and internal_accounts.role = 'employee'::public.app_role
    and internal_accounts.active = true
  limit 1;

  if account_record.id is null or account_record.employee_id is null then
    raise exception 'La cuenta interna no esta vinculada a un empleado activo.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(ordered_availability) order by ordered_availability.available_date, ordered_availability.start_time), '[]'::jsonb)
  into availability_payload
  from (
    select availability.*
    from public.employee_availability availability
    where availability.employee_id = account_record.employee_id
    order by availability.available_date asc, availability.start_time asc
  ) ordered_availability;

  return availability_payload;
end;
$$;

create or replace function public.create_internal_employee_availability(
  account_id_value uuid,
  available_date_value date,
  start_time_value time without time zone,
  end_time_value time without time zone,
  active_value boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  saved_availability public.employee_availability%rowtype;
begin
  select *
  into account_record
  from public.internal_accounts
  where internal_accounts.id = account_id_value
    and internal_accounts.role = 'employee'::public.app_role
    and internal_accounts.active = true
  limit 1;

  if account_record.id is null or account_record.employee_id is null then
    raise exception 'La cuenta interna no esta vinculada a un empleado activo.';
  end if;

  if available_date_value is null then
    raise exception 'La fecha de disponibilidad es invalida.';
  end if;

  if available_date_value < current_date then
    raise exception 'No se puede crear disponibilidad en fechas pasadas.';
  end if;

  if end_time_value <= start_time_value then
    raise exception 'La hora fin debe ser posterior a la hora inicio.';
  end if;

  insert into public.employee_availability (employee_id, available_date, weekday, start_time, end_time, active)
  values (account_record.employee_id, available_date_value, extract(dow from available_date_value)::smallint, start_time_value, end_time_value, coalesce(active_value, true))
  returning * into saved_availability;

  return to_jsonb(saved_availability);
end;
$$;

create or replace function public.update_internal_employee_availability(
  account_id_value uuid,
  availability_id_value text,
  available_date_value date,
  start_time_value time without time zone,
  end_time_value time without time zone,
  active_value boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  saved_availability public.employee_availability%rowtype;
begin
  select *
  into account_record
  from public.internal_accounts
  where internal_accounts.id = account_id_value
    and internal_accounts.role = 'employee'::public.app_role
    and internal_accounts.active = true
  limit 1;

  if account_record.id is null or account_record.employee_id is null then
    raise exception 'La cuenta interna no esta vinculada a un empleado activo.';
  end if;

  if available_date_value is null then
    raise exception 'La fecha de disponibilidad es invalida.';
  end if;

  if available_date_value < current_date then
    raise exception 'No se puede mover disponibilidad a fechas pasadas.';
  end if;

  if end_time_value <= start_time_value then
    raise exception 'La hora fin debe ser posterior a la hora inicio.';
  end if;

  update public.employee_availability
    set available_date = available_date_value,
      weekday = extract(dow from available_date_value)::smallint,
      start_time = start_time_value,
      end_time = end_time_value,
      active = coalesce(active_value, true),
      updated_at = now()
  where employee_availability.id::text = availability_id_value
    and employee_availability.employee_id = account_record.employee_id
  returning * into saved_availability;

  if saved_availability.id is null then
    raise exception 'La disponibilidad no existe o no pertenece a este empleado.';
  end if;

  return to_jsonb(saved_availability);
end;
$$;

create or replace function public.delete_internal_employee_availability(
  account_id_value uuid,
  availability_id_value text
)
returns void
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
  where internal_accounts.id = account_id_value
    and internal_accounts.role = 'employee'::public.app_role
    and internal_accounts.active = true
  limit 1;

  if account_record.id is null or account_record.employee_id is null then
    raise exception 'La cuenta interna no esta vinculada a un empleado activo.';
  end if;

  delete from public.employee_availability
  where employee_availability.id::text = availability_id_value
    and employee_availability.employee_id = account_record.employee_id;

  if not found then
    raise exception 'La disponibilidad no existe o no pertenece a este empleado.';
  end if;
end;
$$;

grant select on public.employee_availability to anon, authenticated;
grant insert, update, delete on public.employee_availability to authenticated;
grant execute on function public.list_internal_employee_availability(uuid) to anon, authenticated;
grant execute on function public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean) to anon, authenticated;
grant execute on function public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean) to anon, authenticated;
grant execute on function public.delete_internal_employee_availability(uuid, text) to anon, authenticated;

alter table public.employee_availability enable row level security;

drop policy if exists "employee_availability_read" on public.employee_availability;
create policy "employee_availability_read"
on public.employee_availability for select
to anon, authenticated
using (true);

drop policy if exists "employee_availability_insert" on public.employee_availability;
create policy "employee_availability_insert"
on public.employee_availability for insert
to authenticated
with check (public.is_admin() or public.is_employee_for(employee_id));

drop policy if exists "employee_availability_update" on public.employee_availability;
create policy "employee_availability_update"
on public.employee_availability for update
to authenticated
using (public.is_admin() or public.is_employee_for(employee_id))
with check (public.is_admin() or public.is_employee_for(employee_id));

drop policy if exists "employee_availability_delete" on public.employee_availability;
create policy "employee_availability_delete"
on public.employee_availability for delete
to authenticated
using (public.is_admin() or public.is_employee_for(employee_id));

commit;
