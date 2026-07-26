-- ============================================================================
-- 17_sucursales_bookings.sql
-- Permite estampar branch_id en un turno recien creado, sin reescribir los
-- RPCs grandes de reserva (request_client_booking / create_admin_booking /
-- create_internal_employee_booking), que ya devuelven el turno creado (con id).
-- Mismo patron de "post-update" ya usado para company_id / branch_id en
-- disponibilidad. Idempotente. La columna bookings.branch_id se crea en 13.
-- Solo estampa cuando branch_id sigue null (turno recien creado) y valida que
-- la sucursal pertenezca a la empresa del slug.
-- ============================================================================

create or replace function public.set_booking_branch(
  booking_id_value uuid,
  branch_id_value uuid,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  updated_booking public.bookings%rowtype;
begin
  if target_company_id is null then
    raise exception 'La empresa no esta disponible.';
  end if;

  if branch_id_value is null then
    return null;
  end if;

  if not exists (
    select 1 from public.branches b
    where b.id = branch_id_value and b.company_id = target_company_id
  ) then
    raise exception 'La sucursal no pertenece a esta empresa.';
  end if;

  update public.bookings
     set branch_id = branch_id_value
   where id = booking_id_value
     and company_id = target_company_id
     and branch_id is null
  returning * into updated_booking;

  return to_jsonb(updated_booking);
end;
$$;

revoke execute on function public.set_booking_branch(uuid, uuid, text) from public;
grant execute on function public.set_booking_branch(uuid, uuid, text) to anon, authenticated;
