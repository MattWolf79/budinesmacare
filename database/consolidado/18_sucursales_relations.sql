-- -----------------------------------------------------------------------------
-- 18_sucursales_relations.sql
-- -----------------------------------------------------------------------------
-- Fase 1.1: Filtrado real por sucursal.
-- Expone (de forma aditiva, sin tocar los RPCs grandes) las relaciones
-- servicio<->sucursal (branch_services) y empleado<->sucursal (employee_branches)
-- para que el front pueda filtrar servicios/empleados/disponibilidad segun la
-- sucursal elegida. El branch_id de disponibilidad y turnos ya existe.
--
-- Ejecutar despues de 17_sucursales_bookings.sql.
-- -----------------------------------------------------------------------------

create or replace function public.get_branch_relations(company_slug_value text default null)
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
    'branchServices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'branch_id', bs.branch_id,
        'service_id', bs.service_id
      ))
      from public.branch_services bs, selected_company
      where bs.company_id = selected_company.id
        and bs.active is not false
    ), '[]'::jsonb),
    'employeeBranches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'branch_id', eb.branch_id,
        'employee_id', eb.employee_id
      ))
      from public.employee_branches eb, selected_company
      where eb.company_id = selected_company.id
        and eb.active is not false
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.get_branch_relations(text) from public;
grant execute on function public.get_branch_relations(text) to anon, authenticated;
