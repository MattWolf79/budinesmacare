-- Migración 25: turnos propios del cliente (para "Mis turnos" e historial).
-- Los clientes son cuentas internas (internal_accounts, role='client') y usan la clave anon,
-- por lo que no pueden leer public.bookings vía RLS (política SELECT es solo authenticated).
-- Este RPC security definer valida la sesión interna y devuelve los turnos del cliente.
-- Ejecutar una vez en Supabase SQL Editor sobre la base actual.

begin;

create or replace function public.get_client_bookings(
  account_id_value uuid,
  session_token_value text,
  company_slug_value text default null
)
returns setof public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  client_account public.internal_accounts%rowtype;
  target_company_id uuid;
begin
  client_account := public.validate_internal_session(account_id_value, session_token_value, 'client'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), client_account.company_id);

  if target_company_id is null or client_account.company_id is distinct from target_company_id then
    raise exception 'No podés ver turnos de otra empresa.';
  end if;

  return query
  select bookings.*
  from public.bookings bookings
  where bookings.company_id = target_company_id
    and bookings.client_account_id = client_account.id
  order by bookings.start_at desc
  limit 80;
end;
$$;

revoke execute on function public.get_client_bookings(uuid, text, text) from public;
grant execute on function public.get_client_bookings(uuid, text, text) to anon, authenticated;

commit;
