-- Prevent closing bookings whose scheduled end time is still in the future.
-- Run after 063_employee_create_for_any_employee.sql.

begin;

create or replace function public.prevent_future_booking_closure()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_business_time timestamp without time zone := timezone('America/Argentina/Buenos_Aires', now());
begin
  if new.status in ('completed', 'closed')
    and coalesce(old.status, '') not in ('completed', 'closed')
    and new.end_at > current_business_time then
    raise exception 'No se pueden cerrar turnos que todavía no finalizaron.';
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