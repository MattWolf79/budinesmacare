-- Safe employee deletion for admin users.
-- Run after 005_internal_user_profiles.sql on existing databases.

begin;

alter table public.employees
  add column if not exists deleted_at timestamp without time zone,
  add column if not exists updated_at timestamp without time zone not null default now();

drop function if exists public.delete_admin_employee(uuid);

create or replace function public.delete_admin_employee(employee_id_value uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede eliminar empleados.';
  end if;

  if employee_id_value is null then
    raise exception 'El empleado es invalido.';
  end if;

  if exists (
    select 1
    from public.bookings bookings
    where bookings.employee_id = employee_id_value
      and bookings.status in ('reserved', 'confirmed')
      and bookings.end_at >= now()::timestamp without time zone
    limit 1
  ) then
    raise exception 'No se puede eliminar un empleado con turnos futuros. Podés cancelar o reasignar esos turnos primero.';
  end if;

  delete from public.internal_accounts
  where internal_accounts.employee_id = employee_id_value;

  update public.profiles
  set role = 'client'::public.app_role,
      employee_id = null,
      updated_at = now()
  where profiles.employee_id = employee_id_value
    and profiles.role = 'employee'::public.app_role;

  update public.internal_registration_requests
  set employee_id = null
  where internal_registration_requests.employee_id = employee_id_value;

  delete from public.employee_services
  where employee_services.employee_id = employee_id_value;

  delete from public.employee_availability
  where employee_availability.employee_id = employee_id_value;

  if exists (
    select 1
    from public.bookings bookings
    where bookings.employee_id = employee_id_value
    limit 1
  ) then
    update public.employees
    set active = false,
        deleted_at = coalesce(deleted_at, now()),
        updated_at = now()
    where employees.id = employee_id_value;
  else
    delete from public.employees
    where employees.id = employee_id_value;
  end if;

  if not found then
    raise exception 'El empleado no existe.';
  end if;
end;
$$;

grant execute on function public.delete_admin_employee(uuid) to authenticated;

commit;