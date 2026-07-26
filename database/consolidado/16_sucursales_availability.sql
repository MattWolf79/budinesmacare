-- ============================================================================
-- 16_sucursales_availability.sql
-- Agrega branch_id a los RPCs de disponibilidad (admin e interno de empleado).
-- Idempotente. La columna employee_availability.branch_id ya se crea en 13_sucursales.sql.
-- La restriccion de no-superposicion sigue siendo GLOBAL por empleado
-- (una persona no puede estar en dos sucursales a la vez), branch_id solo indica
-- EN QUE sucursal esta disponible ese rango.
-- ============================================================================

-- Helper local (no persistente): resolver la sucursal por defecto de una empresa.
-- Se implementa inline en cada funcion para no depender de un helper nuevo.

-- ----------------------------------------------------------------------------
-- save_admin_employee_availability (+ branch_id_value)
-- ----------------------------------------------------------------------------
drop function if exists public.save_admin_employee_availability(text, uuid, date, time without time zone, time without time zone, boolean, uuid, text, text);

create or replace function public.save_admin_employee_availability(
  availability_id_value text,
  employee_id_value uuid,
  available_date_value date,
  start_time_value time without time zone,
  end_time_value time without time zone,
  active_value boolean default true,
  account_id_value uuid default null,
  session_token_value text default null,
  company_slug_value text default null,
  branch_id_value uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  admin_account public.internal_accounts%rowtype;
  resolved_branch_id uuid := branch_id_value;
  result jsonb;
begin
  if target_company_id is null then raise exception 'La empresa no esta disponible.'; end if;
  if public.is_admin() then
    if not exists (select 1 from public.profiles profiles where profiles.user_id = auth.uid() and profiles.role = 'admin'::public.app_role and profiles.active is not false and profiles.company_id = target_company_id) then raise exception 'No podes administrar otra empresa.'; end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    if admin_account.company_id is distinct from target_company_id then raise exception 'No podes administrar otra empresa.'; end if;
  end if;
  if not exists (select 1 from public.employees employees where employees.id = employee_id_value and employees.company_id = target_company_id and employees.deleted_at is null) then raise exception 'El empleado no pertenece a esta empresa.'; end if;
  if availability_id_value is not null and not exists (select 1 from public.employee_availability availability where availability.id = availability_id_value::uuid and availability.company_id = target_company_id) then raise exception 'La disponibilidad no pertenece a esta empresa.'; end if;
  if resolved_branch_id is not null and not exists (select 1 from public.branches b where b.id = resolved_branch_id and b.company_id = target_company_id) then raise exception 'La sucursal no pertenece a esta empresa.'; end if;
  if resolved_branch_id is null then
    select b.id into resolved_branch_id from public.branches b where b.company_id = target_company_id and b.active order by b.sort_order, b.created_at limit 1;
  end if;

  result := public.save_admin_employee_availability_legacy(availability_id_value, employee_id_value, available_date_value, start_time_value, end_time_value, active_value, account_id_value);
  update public.employee_availability
     set company_id = target_company_id,
         branch_id = coalesce(resolved_branch_id, branch_id)
   where id = (result->>'id')::uuid;
  return result || jsonb_build_object('company_id', target_company_id, 'branch_id', resolved_branch_id);
end; $$;

-- ----------------------------------------------------------------------------
-- create_internal_employee_availability (+ branch_id_value)
-- ----------------------------------------------------------------------------
drop function if exists public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean, text, text);

create or replace function public.create_internal_employee_availability(
  account_id_value uuid,
  available_date_value date,
  start_time_value time without time zone,
  end_time_value time without time zone,
  active_value boolean default true,
  session_token_value text default null,
  company_slug_value text default null,
  branch_id_value uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  account_record public.internal_accounts%rowtype;
  resolved_branch_id uuid := branch_id_value;
  result jsonb;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  if target_company_id is null or account_record.company_id is distinct from target_company_id then raise exception 'La cuenta interna no pertenece a esta empresa.'; end if;
  if resolved_branch_id is not null and not exists (select 1 from public.branches b where b.id = resolved_branch_id and b.company_id = target_company_id) then raise exception 'La sucursal no pertenece a esta empresa.'; end if;
  if resolved_branch_id is null then
    select b.id into resolved_branch_id from public.branches b where b.company_id = target_company_id and b.active order by b.sort_order, b.created_at limit 1;
  end if;

  result := public.create_internal_employee_availability_legacy(account_id_value, available_date_value, start_time_value, end_time_value, active_value);
  update public.employee_availability
     set company_id = target_company_id,
         branch_id = coalesce(resolved_branch_id, branch_id)
   where id = (result->>'id')::uuid;
  return result || jsonb_build_object('company_id', target_company_id, 'branch_id', resolved_branch_id);
end; $$;

-- ----------------------------------------------------------------------------
-- update_internal_employee_availability (+ branch_id_value)
-- ----------------------------------------------------------------------------
drop function if exists public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean, text, text);

create or replace function public.update_internal_employee_availability(
  account_id_value uuid,
  availability_id_value text,
  available_date_value date,
  start_time_value time without time zone,
  end_time_value time without time zone,
  active_value boolean default true,
  session_token_value text default null,
  company_slug_value text default null,
  branch_id_value uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  account_record public.internal_accounts%rowtype;
  resolved_branch_id uuid := branch_id_value;
  result jsonb;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  if target_company_id is null or account_record.company_id is distinct from target_company_id then raise exception 'La cuenta interna no pertenece a esta empresa.'; end if;
  if not exists (select 1 from public.employee_availability availability where availability.id = availability_id_value::uuid and availability.company_id = target_company_id and availability.employee_id = account_record.employee_id) then raise exception 'La disponibilidad no pertenece a esta empresa.'; end if;
  if resolved_branch_id is not null and not exists (select 1 from public.branches b where b.id = resolved_branch_id and b.company_id = target_company_id) then raise exception 'La sucursal no pertenece a esta empresa.'; end if;

  result := public.update_internal_employee_availability_legacy(account_id_value, availability_id_value, available_date_value, start_time_value, end_time_value, active_value);
  if resolved_branch_id is not null then
    update public.employee_availability set branch_id = resolved_branch_id where id = availability_id_value::uuid and company_id = target_company_id;
  end if;
  return result || jsonb_build_object('branch_id', coalesce(resolved_branch_id, (select branch_id from public.employee_availability where id = availability_id_value::uuid)));
end; $$;

-- ----------------------------------------------------------------------------
-- Grants (las nuevas firmas). Se revoca de public por seguridad.
-- ----------------------------------------------------------------------------
revoke execute on function public.save_admin_employee_availability(text, uuid, date, time without time zone, time without time zone, boolean, uuid, text, text, uuid) from public;
revoke execute on function public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean, text, text, uuid) from public;
revoke execute on function public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean, text, text, uuid) from public;

grant execute on function public.save_admin_employee_availability(text, uuid, date, time without time zone, time without time zone, boolean, uuid, text, text, uuid) to anon, authenticated;
grant execute on function public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean, text, text, uuid) to anon, authenticated;
grant execute on function public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean, text, text, uuid) to anon, authenticated;
