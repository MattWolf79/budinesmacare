-- Allow clients to request bookings without choosing a specific employee.
-- Admins can later assign an available employee and confirm the booking.

alter table public.bookings
  alter column employee_id drop not null;

alter table public.bookings
  drop constraint if exists bookings_status_chk;

alter table public.bookings
  add constraint bookings_status_chk
  check (status in ('reserved', 'confirmed', 'pending_assignment', 'cancelled'));

create index if not exists bookings_pending_assignment_idx
  on public.bookings (start_at)
  where status = 'pending_assignment' and employee_id is null;

-- Keep employee policies safe when employee_id is null.
drop policy if exists "bookings_clients_insert_own_or_admin" on public.bookings;
create policy "bookings_clients_insert_own_or_admin"
on public.bookings for insert
to authenticated
with check (
  public.is_admin()
  or (employee_id is not null and public.is_employee_for(employee_id))
  or user_id = auth.uid()
);

drop policy if exists "bookings_update_own_future_or_admin" on public.bookings;
create policy "bookings_update_own_future_or_admin"
on public.bookings for update
to authenticated
using (
  public.is_admin()
  or (employee_id is not null and public.is_employee_for(employee_id))
)
with check (
  public.is_admin()
  or (employee_id is not null and public.is_employee_for(employee_id))
);

drop policy if exists "bookings_delete_own_future_or_admin" on public.bookings;
create policy "bookings_delete_own_future_or_admin"
on public.bookings for delete
to authenticated
using (
  public.is_admin()
  or (employee_id is not null and public.is_employee_for(employee_id))
  or (user_id = auth.uid() and start_at > localtimestamp)
);
