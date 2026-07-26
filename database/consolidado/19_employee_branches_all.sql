-- -----------------------------------------------------------------------------
-- 19_employee_branches_all.sql
-- -----------------------------------------------------------------------------
-- Fase 1.1: el equipo de una sucursal es DESCRIPTIVO. Todos los empleados
-- figuran en todas las sucursales de su empresa (base para la futura funcion
-- Staff). La sucursal donde realmente atiende cada empleado se controla por su
-- DISPONIBILIDAD (employee_availability.branch_id), no por employee_branches.
--
-- El backfill original (13_sucursales.sql) solo asigno cada empleado a la
-- sucursal por defecto. Esta migracion completa todas las combinaciones
-- (empleado x sucursal) por empresa. Idempotente.
--
-- Ejecutar despues de 18_sucursales_relations.sql.
-- -----------------------------------------------------------------------------

insert into public.employee_branches (employee_id, branch_id, company_id, active)
select e.id, b.id, e.company_id, true
from public.employees e
join public.branches b on b.company_id = e.company_id
where e.company_id is not null
  and e.deleted_at is null
on conflict (employee_id, branch_id) do update set active = true, updated_at = now();
