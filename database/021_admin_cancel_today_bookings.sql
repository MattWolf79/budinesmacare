-- Admins can cancel same-day bookings even after the start time.
-- Run after 020_internal_promotional_bookings.sql on existing databases.

begin;

create or replace function public.cancel_booking(
  booking_id_value uuid,
  account_id_value uuid default null,
  session_token_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_record public.bookings%rowtype;
  saved_booking public.bookings%rowtype;
  internal_employee_id uuid := null;
  is_admin_actor boolean := false;
begin
  if booking_id_value is null then
    raise exception 'El turno es invalido.';
  end if;

  if account_id_value is not null then
    perform public.validate_internal_session(account_id_value, session_token_value, null);
  end if;

  select *
  into booking_record
  from public.bookings bookings
  where bookings.id = booking_id_value
  for update;

  if booking_record.id is null then
    raise exception 'El turno no existe.';
  end if;

  is_admin_actor := public.is_admin() or public.is_internal_admin(account_id_value);

  select accounts.employee_id
  into internal_employee_id
  from public.internal_accounts accounts
  where accounts.id = account_id_value
    and accounts.role = 'employee'::public.app_role
    and accounts.active = true
    and accounts.employee_id is not null
  limit 1;

  if not is_admin_actor
    and not coalesce(internal_employee_id is not null and booking_record.employee_id = internal_employee_id, false)
    and not coalesce(booking_record.user_id = auth.uid(), false)
    and not coalesce(public.is_employee_for(booking_record.employee_id), false) then
    raise exception 'No tenés permisos para cancelar este turno.';
  end if;

  if is_admin_actor then
    if booking_record.start_at::date < current_date then
      raise exception 'No se pueden cancelar turnos de días pasados.';
    end if;
  elsif booking_record.start_at <= localtimestamp then
    raise exception 'No se pueden cancelar turnos de días pasados.';
  end if;

  update public.bookings
  set status = 'cancelled',
      updated_at = now()
  where bookings.id = booking_record.id
  returning * into saved_booking;

  return to_jsonb(saved_booking);
end;
$$;

revoke execute on function public.cancel_booking(uuid, uuid, text) from public;
grant execute on function public.cancel_booking(uuid, uuid, text) to anon, authenticated;

commit;
