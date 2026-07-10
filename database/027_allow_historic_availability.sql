-- Allow internal users to create/edit historical availability for operational testing and back-office corrections.
-- Run after 026_closure_pricing_foundation.sql.

begin;

create or replace function public.save_admin_employee_availability(
  availability_id_value text,
  employee_id_value uuid,
  available_date_value date,
  start_time_value time without time zone,
  end_time_value time without time zone,
  active_value boolean default true,
  account_id_value uuid default null,
  session_token_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_availability public.employee_availability%rowtype;
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if employee_id_value is null then
    raise exception 'Seleccioná un empleado.';
  end if;

  if available_date_value is null then
    raise exception 'La fecha de disponibilidad es invalida.';
  end if;

  if end_time_value <= start_time_value then
    raise exception 'La hora fin debe ser posterior a la hora inicio.';
  end if;

  if availability_id_value is null then
    insert into public.employee_availability (employee_id, available_date, weekday, start_time, end_time, active)
    values (employee_id_value, available_date_value, extract(dow from available_date_value)::smallint, start_time_value, end_time_value, coalesce(active_value, true))
    returning * into saved_availability;

    return to_jsonb(saved_availability);
  end if;

  update public.employee_availability
  set employee_id = employee_id_value,
      available_date = available_date_value,
      weekday = extract(dow from available_date_value)::smallint,
      start_time = start_time_value,
      end_time = end_time_value,
      active = coalesce(active_value, true),
      updated_at = now()
  where employee_availability.id::text = availability_id_value
  returning * into saved_availability;

  if saved_availability.id is null then
    raise exception 'La disponibilidad no existe.';
  end if;

  return to_jsonb(saved_availability);
end;
$$;

create or replace function public.create_internal_employee_availability(
  account_id_value uuid,
  available_date_value date,
  start_time_value time without time zone,
  end_time_value time without time zone,
  active_value boolean default true,
  session_token_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  saved_availability public.employee_availability%rowtype;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);

  if account_record.employee_id is null then
    raise exception 'La cuenta interna no esta vinculada a un empleado activo.';
  end if;

  if available_date_value is null then
    raise exception 'La fecha de disponibilidad es invalida.';
  end if;

  if end_time_value <= start_time_value then
    raise exception 'La hora fin debe ser posterior a la hora inicio.';
  end if;

  insert into public.employee_availability (employee_id, available_date, weekday, start_time, end_time, active)
  values (account_record.employee_id, available_date_value, extract(dow from available_date_value)::smallint, start_time_value, end_time_value, coalesce(active_value, true))
  returning * into saved_availability;

  return to_jsonb(saved_availability);
end;
$$;

create or replace function public.update_internal_employee_availability(
  account_id_value uuid,
  availability_id_value text,
  available_date_value date,
  start_time_value time without time zone,
  end_time_value time without time zone,
  active_value boolean default true,
  session_token_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  saved_availability public.employee_availability%rowtype;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);

  if account_record.employee_id is null then
    raise exception 'La cuenta interna no esta vinculada a un empleado activo.';
  end if;

  if available_date_value is null then
    raise exception 'La fecha de disponibilidad es invalida.';
  end if;

  if end_time_value <= start_time_value then
    raise exception 'La hora fin debe ser posterior a la hora inicio.';
  end if;

  update public.employee_availability
  set available_date = available_date_value,
      weekday = extract(dow from available_date_value)::smallint,
      start_time = start_time_value,
      end_time = end_time_value,
      active = coalesce(active_value, true),
      updated_at = now()
  where employee_availability.id::text = availability_id_value
    and employee_availability.employee_id = account_record.employee_id
  returning * into saved_availability;

  if saved_availability.id is null then
    raise exception 'La disponibilidad no existe.';
  end if;

  return to_jsonb(saved_availability);
end;
$$;

revoke execute on function public.save_admin_employee_availability(text, uuid, date, time without time zone, time without time zone, boolean, uuid, text) from public;
revoke execute on function public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean, text) from public;
revoke execute on function public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean, text) from public;

grant execute on function public.save_admin_employee_availability(text, uuid, date, time without time zone, time without time zone, boolean, uuid, text) to anon, authenticated;
grant execute on function public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean, text) to anon, authenticated;
grant execute on function public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean, text) to anon, authenticated;

commit;