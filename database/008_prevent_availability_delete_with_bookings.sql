-- Prevent deleting availability ranges that already have assigned bookings.
-- Run after 004_employee_availability_dates.sql on existing databases.

begin;

create or replace function public.prevent_booked_availability_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.bookings bookings
    where bookings.employee_id = old.employee_id
      and bookings.status in ('reserved', 'confirmed')
      and bookings.start_at < (old.available_date + old.end_time)
      and bookings.end_at > (old.available_date + old.start_time)
    limit 1
  ) then
    raise exception 'No se puede eliminar una disponibilidad con turnos asignados. Cancelá o reasigná esos turnos primero.';
  end if;

  return old;
end;
$$;

drop trigger if exists employee_availability_prevent_booked_delete on public.employee_availability;
create trigger employee_availability_prevent_booked_delete
before delete on public.employee_availability
for each row
execute function public.prevent_booked_availability_delete();

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

grant execute on function public.delete_internal_employee_availability(uuid, text) to anon, authenticated;

commit;
