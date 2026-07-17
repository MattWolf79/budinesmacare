-- Unificar visibilidad de empleado: visibilidad_turnos_empleado define si ve agenda completa o solo propia.
-- Run after 069_platform_update_company_url_slug.sql.

begin;

alter table public.app_configuration
  drop constraint if exists app_configuration_visibilidad_turnos_empleado_chk;

alter table public.app_configuration
  add constraint app_configuration_visibilidad_turnos_empleado_chk
  check (visibilidad_turnos_empleado in ('completa', 'cliente_servicio', 'solo_ocupado', 'cliente_sin_empleado', 'solo_propios'));

update public.app_configuration
set empleados_ven_agenda_completa = visibilidad_turnos_empleado <> 'solo_propios'
where empleados_ven_agenda_completa is distinct from (visibilidad_turnos_empleado <> 'solo_propios');

create or replace function public.obtener_configuracion_operativa(configuracion public.app_configuration)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'precios_habilitados', coalesce(configuracion.precios_habilitados, true),
    'turnos_superpuestos_habilitados', coalesce(configuracion.turnos_superpuestos_habilitados, true),
    'intervalo_grilla_minutos', coalesce(configuracion.intervalo_grilla_minutos, 30),
    'empleados_pueden_reservar', coalesce(configuracion.empleados_pueden_reservar, true),
    'empleados_ven_agenda_completa', coalesce(configuracion.visibilidad_turnos_empleado, 'completa') <> 'solo_propios',
    'visibilidad_turnos_empleado', coalesce(configuracion.visibilidad_turnos_empleado, 'completa'),
    'pdf_detalle_turno_habilitado', coalesce(configuracion.pdf_detalle_turno_habilitado, false)
  )
$$;

create or replace function public.get_internal_employee_workspace(
  account_id_value uuid,
  session_token_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  target_company_id uuid;
  payload jsonb;
  visibilidad text := 'completa';
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), account_record.company_id);

  if target_company_id is null or account_record.company_id is distinct from target_company_id or account_record.employee_id is null then
    raise exception 'La cuenta interna no pertenece a esta empresa.';
  end if;

  select coalesce(configurations.visibilidad_turnos_empleado, 'completa')
  into visibilidad
  from public.app_configuration configurations
  where configurations.company_id = target_company_id
  limit 1;

  select jsonb_build_object(
    'employee', coalesce((
      select to_jsonb(employees)
      from public.employees employees
      where employees.id = account_record.employee_id
        and employees.company_id = target_company_id
        and employees.deleted_at is null
      limit 1
    ), 'null'::jsonb),
    'employees', coalesce((
      select jsonb_agg(to_jsonb(employee_rows) order by employee_rows.name)
      from (
        select *
        from public.employees employees
        where employees.company_id = target_company_id
          and employees.deleted_at is null
          and (
            visibilidad <> 'solo_propios'
            or employees.id = account_record.employee_id
          )
      ) employee_rows
    ), '[]'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(booking_rows.booking_payload order by booking_rows.start_at)
      from (
        select
          bookings.start_at,
          case
            when bookings.employee_id = account_record.employee_id or visibilidad = 'completa' then to_jsonb(bookings)
            when visibilidad = 'cliente_servicio' then jsonb_build_object(
              'id', bookings.id,
              'company_id', bookings.company_id,
              'start_at', bookings.start_at,
              'end_at', bookings.end_at,
              'status', bookings.status,
              'employee_id', null,
              'service', bookings.service,
              'booking_description', bookings.booking_description,
              'customer_name', bookings.customer_name,
              'user_email', null
            )
            when visibilidad = 'cliente_sin_empleado' then to_jsonb(bookings) - 'employee_id'
            when visibilidad = 'solo_ocupado' then jsonb_build_object(
              'id', bookings.id,
              'company_id', bookings.company_id,
              'start_at', bookings.start_at,
              'end_at', bookings.end_at,
              'status', bookings.status,
              'employee_id', null,
              'service', null,
              'booking_description', null,
              'customer_name', null,
              'user_email', null
            )
            else to_jsonb(bookings)
          end as booking_payload
        from public.bookings bookings
        where bookings.company_id = target_company_id
          and bookings.status in ('reserved', 'confirmed', 'pending_assignment', 'completed')
          and (
            visibilidad <> 'solo_propios'
            or bookings.employee_id = account_record.employee_id
          )
        order by bookings.start_at
      ) booking_rows
    ), '[]'::jsonb),
    'bookingClosureItems', coalesce((
      select jsonb_agg(to_jsonb(closure_item_rows) order by closure_item_rows.created_at)
      from (
        select closure_items.*
        from public.booking_closure_items closure_items
        join public.bookings bookings on bookings.id = closure_items.booking_id
        where bookings.company_id = target_company_id
          and bookings.employee_id = account_record.employee_id
          and bookings.status = 'completed'
      ) closure_item_rows
    ), '[]'::jsonb),
    'bookingClosures', coalesce((
      select jsonb_agg(to_jsonb(closure_rows) order by closure_rows.created_at)
      from (
        select distinct closures.*
        from public.booking_closures closures
        join public.booking_closure_items closure_items on closure_items.closure_id = closures.id
        join public.bookings bookings on bookings.id = closure_items.booking_id
        where bookings.company_id = target_company_id
          and bookings.employee_id = account_record.employee_id
          and bookings.status = 'completed'
      ) closure_rows
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(to_jsonb(service_rows) order by service_rows.id)
      from (
        select *
        from public.services services
        where services.company_id = target_company_id
        order by services.id
      ) service_rows
    ), '[]'::jsonb),
    'employeeServices', coalesce((
      select jsonb_agg(to_jsonb(relation_rows))
      from (
        select *
        from public.employee_services relations
        where relations.company_id = target_company_id
      ) relation_rows
    ), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(to_jsonb(availability_rows) order by availability_rows.available_date, availability_rows.start_time)
      from (
        select *
        from public.employee_availability availability
        where availability.company_id = target_company_id
          and availability.employee_id = account_record.employee_id
        order by availability.available_date, availability.start_time
      ) availability_rows
    ), '[]'::jsonb),
    'agendaAvailability', coalesce((
      select jsonb_agg(to_jsonb(availability_rows) order by availability_rows.available_date, availability_rows.start_time)
      from (
        select *
        from public.employee_availability availability
        where availability.company_id = target_company_id
        order by availability.available_date, availability.start_time
      ) availability_rows
    ), '[]'::jsonb)
  ) into payload;

  return payload;
end;
$$;

grant execute on function public.get_internal_employee_workspace(uuid, text, text) to anon, authenticated;

commit;