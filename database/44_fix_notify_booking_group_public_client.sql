-- Fix: notify_booking_group rechazaba con "No autorizado." cuando el pedido
-- lo hacia un cliente publico autenticado con Supabase Auth (auth.uid() no
-- nulo) pero sin fila en public.profiles para la empresa del pedido (por
-- ejemplo, esa cuenta es admin/staff de OTRA empresa, o directamente nunca
-- tuvo perfil de staff). Como consecuencia el mail de confirmacion nunca se
-- enviaba (ni al cliente ni al admin), sin que el usuario viera el error
-- (solo quedaba en consola del navegador).
--
-- Ahora se permite notificar tambien cuando el auth.uid() actual es el
-- user_id dueno de los bookings del grupo (caso normal de cliente publico).
--
-- Ejecutar una vez en el SQL Editor de Supabase.

begin;

create or replace function public.notify_booking_group(
  group_id_value uuid,
  company_slug_value text default null,
  account_id_value uuid default null,
  session_token_value text default null,
  event_kind text default 'new'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  grp_company uuid;
  acc public.internal_accounts%rowtype;
begin
  if group_id_value is null then
    return;
  end if;

  select company_id into grp_company
  from public.bookings
  where booking_group_id = group_id_value
  limit 1;

  if grp_company is null then
    return;
  end if;

  if auth.uid() is not null then
    if not exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.company_id = grp_company
        and p.active is not false
    ) and not exists (
      -- Cliente publico autenticado con Supabase Auth que es dueno de los
      -- bookings del grupo (no tiene profile de staff en esta empresa).
      select 1 from public.bookings b
      where b.booking_group_id = group_id_value
        and b.user_id = auth.uid()
    ) then
      raise exception 'No autorizado.';
    end if;
  else
    begin
      acc := public.validate_internal_session(account_id_value, session_token_value, null);
    exception when others then
      raise exception 'No autorizado.';
    end;
    if acc.company_id is distinct from grp_company then
      raise exception 'No autorizado.';
    end if;
  end if;

  perform public.send_booking_group_notifications(group_id_value, coalesce(nullif(event_kind, ''), 'new'));
end;
$$;

revoke execute on function public.notify_booking_group(uuid, text, uuid, text, text) from public;
grant execute on function public.notify_booking_group(uuid, text, uuid, text, text) to anon, authenticated;

commit;
