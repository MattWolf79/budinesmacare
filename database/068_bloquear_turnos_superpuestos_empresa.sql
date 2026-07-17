-- Reforzar bloqueo de turnos superpuestos por empresa cuando la configuracion lo deshabilita.
-- Run after 067_usuario_empleado_por_empresa.sql.

begin;

create or replace function public.empresa_permite_turnos_superpuestos(company_id_value uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select configurations.turnos_superpuestos_habilitados
    from public.app_configuration configurations
    where configurations.company_id = company_id_value
    limit 1
  ), true)
$$;

create or replace function public.validar_turno_superpuesto_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := NEW.company_id;
begin
  if target_company_id is null then
    target_company_id := coalesce(
      (
        select employees.company_id
        from public.employees employees
        where employees.id = NEW.employee_id
        limit 1
      ),
      (
        select services.company_id
        from public.services services
        where services.id = NEW.service
        limit 1
      )
    );
  end if;

  if target_company_id is null or NEW.status not in ('reserved', 'confirmed', 'pending_assignment') then
    return NEW;
  end if;

  if public.empresa_permite_turnos_superpuestos(target_company_id) is false and exists (
    select 1
    from public.bookings bookings
    where bookings.company_id = target_company_id
      and bookings.id is distinct from NEW.id
      and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
      and bookings.start_at < NEW.end_at
      and bookings.end_at > NEW.start_at
    limit 1
  ) then
    raise exception 'Ese horario ya está ocupado. La empresa no permite turnos superpuestos.';
  end if;

  return NEW;
end;
$$;

drop trigger if exists bookings_validar_turno_superpuesto_empresa on public.bookings;
create trigger bookings_validar_turno_superpuesto_empresa
before insert or update of start_at, end_at, status, company_id, employee_id, service on public.bookings
for each row
execute function public.validar_turno_superpuesto_empresa();

commit;
