-- Restore tenant-aware current month completed booking totals in the admin payload.
-- Run after 064_prevent_future_booking_closure.sql.

begin;

create or replace function public.get_admin_panel_data(
  account_id_value uuid default null,
  request_status_value text default 'pending',
  session_token_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_account public.internal_accounts%rowtype;
  target_company_id uuid;
  current_business_date date := timezone('America/Argentina/Buenos_Aires', now())::date;
  month_start timestamp without time zone;
  month_end timestamp without time zone;
  payload jsonb;
begin
  month_start := date_trunc('month', current_business_date)::timestamp;
  month_end := month_start + interval '1 month';

  if public.is_admin() then
    target_company_id := public.get_company_id_by_slug(company_slug_value);

    if target_company_id is null then
      raise exception 'La empresa no está disponible.';
    end if;

    if not exists (
      select 1
      from public.profiles profiles
      where profiles.user_id = auth.uid()
        and profiles.role = 'admin'::public.app_role
        and profiles.active is not false
        and profiles.company_id = target_company_id
    ) then
      raise exception 'No podés administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

    if target_company_id is null then
      raise exception 'La empresa no está disponible.';
    end if;

    if admin_account.company_id is distinct from target_company_id then
      raise exception 'No podés administrar otra empresa.';
    end if;
  end if;

  select jsonb_build_object(
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(booking_rows) order by booking_rows.start_at)
      from (
        select *
        from public.bookings bookings
        where bookings.company_id = target_company_id
        order by bookings.start_at
      ) booking_rows
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
          and accounts.company_id = target_company_id
        where employees.company_id = target_company_id
          and employees.deleted_at is null
      ) employee_rows
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
        order by availability.available_date, availability.start_time
      ) availability_rows
    ), '[]'::jsonb),
    'bookingClosureItems', coalesce((
      select jsonb_agg(to_jsonb(closure_item_rows) order by closure_item_rows.created_at)
      from (
        select closure_items.*
        from public.booking_closure_items closure_items
        join public.bookings bookings on bookings.id = closure_items.booking_id
        where bookings.company_id = target_company_id
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
          and bookings.status = 'completed'
      ) closure_rows
    ), '[]'::jsonb),
    'adminBookingCostSummary', jsonb_build_object(
      'assigned', coalesce((
        select jsonb_build_object(
          'booking_count', count(*),
          'total', coalesce(sum(coalesce(services.base_price, nullif(regexp_replace(coalesce(bookings.booking_description, ''), '[^0-9]', '', 'g'), '')::numeric, 0)), 0)
        )
        from public.bookings bookings
        left join public.services services on services.id = bookings.service and services.company_id = target_company_id
        where bookings.company_id = target_company_id
          and bookings.status in ('reserved', 'confirmed')
          and bookings.employee_id is not null
          and bookings.start_at >= month_start
          and bookings.start_at < month_end
      ), jsonb_build_object('booking_count', 0, 'total', 0)),
      'closed', coalesce((
        select jsonb_build_object(
          'booking_count', count(month_rows.booking_id),
          'total', coalesce(sum(month_rows.amount), 0)
        )
        from (
          select
            closure_items.booking_id,
            greatest(
              0,
              coalesce(closure_items.subtotal, 0) - case
                when coalesce(closure_totals.subtotal_total, 0) > 0 then
                  (coalesce(closure_items.subtotal, 0) / closure_totals.subtotal_total) * coalesce(closures.total_discount_total, 0)
                else 0
              end
            ) as amount
          from public.bookings bookings
          join public.booking_closure_items closure_items on closure_items.booking_id = bookings.id
          left join public.booking_closures closures on closures.id = closure_items.closure_id
          join (
            select closure_id, sum(subtotal) as subtotal_total
            from public.booking_closure_items
            group by closure_id
          ) closure_totals on closure_totals.closure_id = closure_items.closure_id
          where bookings.company_id = target_company_id
            and bookings.status = 'completed'
            and bookings.start_at >= month_start
            and bookings.start_at < month_end
        ) month_rows
      ), jsonb_build_object('booking_count', 0, 'total', 0)),
      'pending', coalesce((
        select jsonb_build_object(
          'booking_count', count(*),
          'total', coalesce(sum(coalesce(services.base_price, nullif(regexp_replace(coalesce(bookings.booking_description, ''), '[^0-9]', '', 'g'), '')::numeric, 0)), 0)
        )
        from public.bookings bookings
        left join public.services services on services.id = bookings.service and services.company_id = target_company_id
        where bookings.company_id = target_company_id
          and bookings.status = 'pending_assignment'
          and bookings.start_at >= month_start
          and bookings.start_at < month_end
      ), jsonb_build_object('booking_count', 0, 'total', 0))
    ),
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
            coalesce(closure_items.subtotal, 0) - case
              when coalesce(closure_totals.subtotal_total, 0) > 0 then
                (coalesce(closure_items.subtotal, 0) / closure_totals.subtotal_total) * coalesce(closures.total_discount_total, 0)
              else 0
            end
          ) as amount
        from public.bookings bookings
        join public.booking_closure_items closure_items on closure_items.booking_id = bookings.id
        left join public.booking_closures closures on closures.id = closure_items.closure_id
        join (
          select closure_id, sum(subtotal) as subtotal_total
          from public.booking_closure_items
          group by closure_id
        ) closure_totals on closure_totals.closure_id = closure_items.closure_id
        where bookings.company_id = target_company_id
          and bookings.status = 'completed'
          and bookings.start_at >= month_start
          and bookings.start_at < month_end
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
        where requests.company_id = target_company_id
          and (request_status_value is null or requests.status = request_status_value)
      ) request_rows
    ), '[]'::jsonb)
  ) into payload;

  return payload;
end;
$$;

grant execute on function public.get_admin_panel_data(uuid, text, text, text) to anon, authenticated;

commit;