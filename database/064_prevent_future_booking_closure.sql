-- Prevent closing bookings scheduled after the current business day.
-- Run after 063_employee_create_for_any_employee.sql.

begin;

create or replace function public.prevent_future_booking_closure()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_business_date date := timezone('America/Argentina/Buenos_Aires', now())::date;
begin
  if new.status in ('completed', 'closed')
    and coalesce(old.status, '') not in ('completed', 'closed')
    and new.start_at::date > current_business_date then
    raise exception 'No se pueden cerrar turnos de días futuros.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_future_booking_closure_trigger on public.bookings;

create trigger prevent_future_booking_closure_trigger
before update of status on public.bookings
for each row
execute function public.prevent_future_booking_closure();

commit;