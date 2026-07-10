-- Add current-month closure totals to the admin panel payload.
-- Run after 030_client_welcome_background.sql on existing databases.

begin;

create or replace function public.get_admin_panel_data_legacy(
  account_id_value uuid default null,
  request_status_value text default 'pending'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  if not public.is_admin() and not public.is_internal_admin(account_id_value) then
    raise exception 'Solo un administrador puede ver datos de administración.';
  end if;

  select jsonb_build_object(
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(booking_rows) order by booking_rows.start_at)
      from (select * from public.bookings order by start_at) booking_rows
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(to_jsonb(employee_rows) order by employee_rows.name)
      from (
        select
          employees.*,
          coalesce(accounts.role = 'admin'::public.app_role, false) as is_admin,
          accounts.username as internal_username
        from public.employees employees
        left join public.internal_accounts accounts
          on accounts.employee_id = employees.id
          and accounts.active = true
        where employees.deleted_at is null
      ) employee_rows
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(to_jsonb(service_rows) order by service_rows.id)
      from (select * from public.services order by id) service_rows
    ), '[]'::jsonb),
    'employeeServices', coalesce((
      select jsonb_agg(to_jsonb(relation_rows))
      from (select * from public.employee_services) relation_rows
    ), '[]'::jsonb),
    'currentMonthClosureSummary', coalesce((
      select jsonb_build_object(
        'booking_count', count(month_rows.booking_id),
        'total', coalesce(sum(month_rows.amount), 0)
      )
      from (
        select
          closure_items.booking_id,
          greatest(
            0,
            closure_items.subtotal - case
              when closure_totals.subtotal_total > 0
              then (closure_items.subtotal / closure_totals.subtotal_total) * closures.total_discount_total
              else 0
            end
          ) as amount
        from public.booking_closure_items closure_items
        join public.booking_closures closures on closures.id = closure_items.closure_id
        join (
          select closure_id, sum(subtotal) as subtotal_total
          from public.booking_closure_items
          group by closure_id
        ) closure_totals on closure_totals.closure_id = closure_items.closure_id
        where closures.created_at >= date_trunc('month', current_date)
          and closures.created_at < date_trunc('month', current_date) + interval '1 month'
      ) month_rows
    ), jsonb_build_object('booking_count', 0, 'total', 0)),
    'accessRequests', coalesce((
      select jsonb_agg(to_jsonb(request_rows) order by request_rows.created_at desc)
      from (
        select
          requests.id,
          requests.role,
          requests.username,
          requests.display_name,
          requests.first_name,
          requests.last_name,
          requests.birth_date,
          requests.phone,
          requests.address_street,
          requests.address_number,
          requests.address_locality,
          requests.photo_url,
          requests.employee_id,
          requests.status,
          requests.created_at,
          requests.reviewed_at
        from public.internal_registration_requests requests
        where request_status_value is null or requests.status = request_status_value
      ) request_rows
    ), '[]'::jsonb)
  ) into payload;

  return payload;
end;
$$;

revoke execute on function public.get_admin_panel_data_legacy(uuid, text) from public;
grant execute on function public.get_admin_panel_data_legacy(uuid, text) to anon, authenticated;

commit;