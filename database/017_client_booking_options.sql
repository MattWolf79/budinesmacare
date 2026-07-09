-- Public booking options used by the client agenda.
-- Run after 016_booking_description.sql on existing databases.

begin;

create or replace function public.get_client_booking_options()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'services', coalesce((
      select jsonb_agg(to_jsonb(service_rows) order by service_rows.id)
      from (
        select *
        from public.services
        where active is not false
        order by id
      ) service_rows
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(to_jsonb(employee_rows) order by employee_rows.name)
      from (
        select *
        from public.employees
        where active is not false
          and deleted_at is null
        order by name
      ) employee_rows
    ), '[]'::jsonb),
    'employeeServices', coalesce((
      select jsonb_agg(to_jsonb(relation_rows))
      from (
        select relations.*
        from public.employee_services relations
        join public.services services on services.id = relations.service_id
        join public.employees employees on employees.id = relations.employee_id
        where services.active is not false
          and employees.active is not false
          and employees.deleted_at is null
      ) relation_rows
    ), '[]'::jsonb),
    'employeeAvailability', coalesce((
      select jsonb_agg(to_jsonb(availability_rows))
      from (
        select availability.*
        from public.employee_availability availability
        join public.employees employees on employees.id = availability.employee_id
        where availability.active is true
          and employees.active is not false
          and employees.deleted_at is null
      ) availability_rows
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.get_client_booking_options() from public;
grant execute on function public.get_client_booking_options() to anon, authenticated;

commit;
