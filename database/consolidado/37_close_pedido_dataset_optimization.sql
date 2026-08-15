-- ============================================================================
-- Source: database/consolidado/37_close_pedido_dataset_optimization.sql
-- ============================================================================

-- Objetivo:
-- 1) Reducir egress/CPU para cierre de pedido con un dataset liviano.
-- 2) Evitar scans costosos sobre bookings en consultas por empresa/estado/fecha.

begin;

create index if not exists bookings_company_status_start_idx
  on public.bookings(company_id, status, start_at);

create index if not exists bookings_company_start_idx
  on public.bookings(company_id, start_at);

create or replace function public.get_pending_closure_bookings(
  account_id_value uuid default null,
  session_token_value text default null,
  company_slug_value text default null,
  cutoff_date_value date default null
)
returns table (
  id uuid,
  company_id uuid,
  user_id uuid,
  client_account_id uuid,
  user_email text,
  customer_name text,
  service bigint,
  employee_id uuid,
  booking_description text,
  start_at timestamp without time zone,
  end_at timestamp without time zone,
  status text,
  created_at timestamp with time zone,
  branch_id uuid,
  booking_group_id uuid,
  group_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  internal_account public.internal_accounts%rowtype;
  target_company_id uuid;
  closure_cutoff date := coalesce(cutoff_date_value, timezone('America/Argentina/Buenos_Aires', now())::date);
begin
  begin
    internal_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  exception
    when others then
      internal_account := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  end;

  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), internal_account.company_id);

  if target_company_id is null then
    raise exception 'La empresa no esta disponible.';
  end if;

  if internal_account.company_id is distinct from target_company_id then
    raise exception 'No podes consultar otra empresa.';
  end if;

  return query
select
  bookings.id,
  bookings.company_id,
  bookings.user_id,
  bookings.client_account_id,
  bookings.user_email,
  bookings.customer_name,
  bookings.service,
  bookings.employee_id,
  bookings.booking_description,
  bookings.start_at,
  bookings.end_at,
  bookings.status,
  bookings.created_at,
  bookings.branch_id,
  bookings.booking_group_id,
  bookings.booking_group_id
from public.bookings
where bookings.company_id = target_company_id
  and bookings.start_at::date <= closure_cutoff
  and lower(trim(coalesce(bookings.status, ''))) not in (
    'completed',
    'closed',
    'cancelled',
    'canceled',
    'cancelado',
    'cancelada'
  )
order by bookings.start_at;
end;
$$;

revoke execute on function public.get_pending_closure_bookings(uuid, text, text, date) from public;
grant execute on function public.get_pending_closure_bookings(uuid, text, text, date) to anon, authenticated;

commit;
