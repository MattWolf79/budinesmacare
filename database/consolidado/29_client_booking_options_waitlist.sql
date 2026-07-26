-- Migration 29: include 'waitlist' bookings in get_client_booking_options
-- Fix: client-created bookings that land on the waitlist (no available
-- employee for the requested slot) were not returned to the client grid,
-- because get_client_booking_options filtered them out. Admin panel data
-- already includes waitlist, so admins saw the booking but clients did not.
-- This recreates the function adding 'waitlist' to the status filter.

begin;

create or replace function public.get_client_booking_options(company_slug_value text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_company as (
    select public.get_company_id_by_slug(company_slug_value) as id
  )
  select jsonb_build_object(
    'companyId', (select id from selected_company),
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(booking_rows) order by booking_rows.start_at)
      from (
        select bookings.*
        from public.bookings bookings, selected_company
        where bookings.company_id = selected_company.id
          and bookings.status in ('confirmed', 'reserved', 'pending_assignment', 'waitlist', 'completed', 'closed')
      ) booking_rows
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(to_jsonb(service_rows) order by service_rows.id)
      from (
        select services.*
        from public.services services, selected_company
        where services.company_id = selected_company.id
          and services.active is not false
        order by services.id
      ) service_rows
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(to_jsonb(employee_rows) order by employee_rows.name)
      from (
        select
          employees.id,
          employees.name,
          employees.first_name,
          employees.last_name,
          employees.photo_url,
          employees.active,
          employees.deleted_at
        from public.employees employees, selected_company
        where employees.company_id = selected_company.id
          and employees.active is not false
          and employees.deleted_at is null
        order by employees.name
      ) employee_rows
    ), '[]'::jsonb),
    'employeeServices', coalesce((
      select jsonb_agg(to_jsonb(relation_rows))
      from (
        select relations.*
        from public.employee_services relations
        join public.services services on services.id = relations.service_id
        join public.employees employees on employees.id = relations.employee_id
        join selected_company on selected_company.id = relations.company_id
        where services.company_id = selected_company.id
          and employees.company_id = selected_company.id
          and services.active is not false
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
        join selected_company on selected_company.id = availability.company_id
        where employees.company_id = selected_company.id
          and availability.active is true
          and employees.active is not false
          and employees.deleted_at is null
      ) availability_rows
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.get_client_booking_options(text) from public;
grant execute on function public.get_client_booking_options(text) to anon, authenticated;

commit;
