-- Add employee settlement support for completed bookings.
-- Run after 060_prevent_past_booking_customer_edit.sql.

begin;

alter table public.bookings
  add column if not exists is_settled boolean not null default false,
  add column if not exists settled_at timestamp without time zone,
  add column if not exists settled_by_account_id uuid references public.internal_accounts(id) on delete set null,
  add column if not exists settlement_percent numeric(5, 2),
  add column if not exists settlement_employee_amount numeric(12, 2),
  add column if not exists settlement_company_amount numeric(12, 2);

alter table public.bookings
  drop constraint if exists bookings_settlement_percent_chk;

alter table public.bookings
  add constraint bookings_settlement_percent_chk
  check (settlement_percent is null or (settlement_percent >= 0 and settlement_percent <= 100));

alter table public.bookings
  drop constraint if exists bookings_settlement_amounts_chk;

alter table public.bookings
  add constraint bookings_settlement_amounts_chk
  check (
    (settlement_employee_amount is null or settlement_employee_amount >= 0)
    and (settlement_company_amount is null or settlement_company_amount >= 0)
  ) not valid;

alter table public.bookings validate constraint bookings_settlement_amounts_chk;

create index if not exists bookings_employee_pending_settlement_idx
  on public.bookings(company_id, employee_id, status, is_settled, start_at)
  where status = 'completed';

create or replace function public.get_employee_pending_settlement_bookings(
  employee_id_value uuid,
  account_id_value uuid default null,
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
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null or admin_account.company_id is distinct from target_company_id then
    raise exception 'No podés administrar otra empresa.';
  end if;

  if not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.company_id = target_company_id
      and employees.deleted_at is null
  ) then
    raise exception 'El empleado no pertenece a esta empresa.';
  end if;

  return coalesce((
    with closure_totals as (
      select
        closure_items.closure_id,
        sum(closure_items.subtotal) as subtotal
      from public.booking_closure_items closure_items
      group by closure_items.closure_id
    ), pending_rows as (
      select
        bookings.id,
        bookings.employee_id,
        employees.name as employee_name,
        coalesce(nullif(closure_items.service_name, ''), services.name, bookings.booking_description, 'Servicio') as service_name,
        coalesce(nullif(bookings.customer_name, ''), 'Cliente sin nombre') as customer_name,
        bookings.user_email,
        bookings.start_at,
        bookings.end_at,
        greatest(
          0,
          coalesce(closure_items.subtotal, services.base_price, 0)
          - case
              when coalesce(closure_totals.subtotal, 0) > 0 then
                (coalesce(closure_items.subtotal, 0) / closure_totals.subtotal) * coalesce(closures.total_discount_total, 0)
              else 0
            end
        ) as total_amount
      from public.bookings bookings
      left join public.booking_closure_items closure_items on closure_items.booking_id = bookings.id
      left join public.booking_closures closures on closures.id = closure_items.closure_id
      left join closure_totals on closure_totals.closure_id = closure_items.closure_id
      left join public.services services on services.id = bookings.service and services.company_id = target_company_id
      left join public.employees employees on employees.id = bookings.employee_id and employees.company_id = target_company_id
      where bookings.company_id = target_company_id
        and bookings.employee_id = employee_id_value
        and bookings.status = 'completed'
        and bookings.is_settled is false
      order by bookings.start_at
    )
    select jsonb_agg(to_jsonb(pending_rows))
    from pending_rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.settle_employee_bookings(
  employee_id_value uuid,
  booking_ids_value uuid[],
  commission_percent_value numeric,
  account_id_value uuid default null,
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
  clean_percent numeric(5, 2) := round(coalesce(commission_percent_value, 0), 2);
  selected_count integer;
  expected_count integer;
  selected_items jsonb;
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null or admin_account.company_id is distinct from target_company_id then
    raise exception 'No podés administrar otra empresa.';
  end if;

  if booking_ids_value is null or array_length(booking_ids_value, 1) is null then
    raise exception 'Seleccioná al menos un turno para rendir.';
  end if;

  if clean_percent < 0 or clean_percent > 100 then
    raise exception 'El porcentaje debe estar entre 0 y 100.';
  end if;

  expected_count := array_length(booking_ids_value, 1);

  with closure_totals as (
    select
      closure_items.closure_id,
      sum(closure_items.subtotal) as subtotal
    from public.booking_closure_items closure_items
    group by closure_items.closure_id
  ), selected_rows as (
    select
      bookings.id,
      bookings.employee_id,
      employees.name as employee_name,
      coalesce(nullif(closure_items.service_name, ''), services.name, bookings.booking_description, 'Servicio') as service_name,
      coalesce(nullif(bookings.customer_name, ''), 'Cliente sin nombre') as customer_name,
      bookings.user_email,
      bookings.start_at,
      bookings.end_at,
      greatest(
        0,
        coalesce(closure_items.subtotal, services.base_price, 0)
        - case
            when coalesce(closure_totals.subtotal, 0) > 0 then
              (coalesce(closure_items.subtotal, 0) / closure_totals.subtotal) * coalesce(closures.total_discount_total, 0)
            else 0
          end
      ) as total_amount
    from public.bookings bookings
    left join public.booking_closure_items closure_items on closure_items.booking_id = bookings.id
    left join public.booking_closures closures on closures.id = closure_items.closure_id
    left join closure_totals on closure_totals.closure_id = closure_items.closure_id
    left join public.services services on services.id = bookings.service and services.company_id = target_company_id
    left join public.employees employees on employees.id = bookings.employee_id and employees.company_id = target_company_id
    where bookings.company_id = target_company_id
      and bookings.employee_id = employee_id_value
      and bookings.status = 'completed'
      and bookings.is_settled is false
      and bookings.id = any(booking_ids_value)
  )
  select count(*), coalesce(jsonb_agg(to_jsonb(selected_rows) order by selected_rows.start_at), '[]'::jsonb)
  into selected_count, selected_items
  from selected_rows;

  if selected_count <> expected_count then
    raise exception 'Hay turnos que no están pendientes de rendición.';
  end if;

  update public.bookings bookings
  set is_settled = true,
      settled_at = now(),
      settled_by_account_id = admin_account.id,
      settlement_percent = clean_percent,
      settlement_employee_amount = round((amounts.total_amount * clean_percent / 100)::numeric, 2),
      settlement_company_amount = round((amounts.total_amount - (amounts.total_amount * clean_percent / 100))::numeric, 2)
  from (
    select
      (item->>'id')::uuid as booking_id,
      (item->>'total_amount')::numeric as total_amount
    from jsonb_array_elements(selected_items) item
  ) amounts
  where bookings.id = amounts.booking_id;

  return jsonb_build_object(
    'commissionPercent', clean_percent,
    'items', selected_items,
    'totalAmount', coalesce((select sum((item->>'total_amount')::numeric) from jsonb_array_elements(selected_items) item), 0),
    'employeeAmount', coalesce((select sum((item->>'total_amount')::numeric * clean_percent / 100) from jsonb_array_elements(selected_items) item), 0),
    'companyAmount', coalesce((select sum((item->>'total_amount')::numeric * (100 - clean_percent) / 100) from jsonb_array_elements(selected_items) item), 0)
  );
end;
$$;

revoke execute on function public.get_employee_pending_settlement_bookings(uuid, uuid, text, text) from public;
revoke execute on function public.settle_employee_bookings(uuid, uuid[], numeric, uuid, text, text) from public;

grant execute on function public.get_employee_pending_settlement_bookings(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.settle_employee_bookings(uuid, uuid[], numeric, uuid, text, text) to anon, authenticated;

commit;