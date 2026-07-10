-- Activity discount check assignment for services.
-- Run after 027_allow_historic_availability.sql.

begin;

alter table public.services
  add column if not exists activity_discount_check_id text;

create or replace function public.save_admin_service(
  service_id_value bigint,
  name_value text,
  icon_value text,
  color_value text,
  default_duration_value integer,
  base_price_value numeric,
  active_value boolean,
  account_id_value uuid default null,
  session_token_value text default null,
  activity_discount_check_id_value text default null
)
returns table (
  id bigint,
  name text,
  icon text,
  color text,
  default_duration integer,
  base_price numeric,
  active boolean,
  activity_discount_check_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := nullif(trim(coalesce(name_value, '')), '');
  clean_color text := coalesce(nullif(trim(coalesce(color_value, '')), ''), '#42A5F5');
  clean_duration integer := coalesce(default_duration_value, 30);
  clean_base_price numeric := coalesce(base_price_value, 0);
  clean_activity_discount_check_id text := nullif(trim(coalesce(activity_discount_check_id_value, '')), '');
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if clean_name is null then
    raise exception 'Ingresa el nombre de la actividad.';
  end if;

  if clean_duration <= 0 then
    raise exception 'La duracion de la actividad debe ser mayor a cero.';
  end if;

  if clean_base_price < 0 then
    raise exception 'El precio base no puede ser negativo.';
  end if;

  if service_id_value is null then
    return query
    insert into public.services (name, icon, color, default_duration, base_price, active, activity_discount_check_id)
    values (
      clean_name,
      nullif(trim(coalesce(icon_value, '')), ''),
      clean_color,
      clean_duration,
      clean_base_price,
      coalesce(active_value, true),
      clean_activity_discount_check_id
    )
    returning services.id, services.name, services.icon, services.color, services.default_duration, services.base_price, services.active, services.activity_discount_check_id;

    return;
  end if;

  return query
  update public.services
  set name = clean_name,
      icon = nullif(trim(coalesce(icon_value, '')), ''),
      color = clean_color,
      default_duration = clean_duration,
      base_price = clean_base_price,
      active = coalesce(active_value, true),
      activity_discount_check_id = clean_activity_discount_check_id
  where services.id = service_id_value
  returning services.id, services.name, services.icon, services.color, services.default_duration, services.base_price, services.active, services.activity_discount_check_id;

  if not found then
    raise exception 'La actividad no existe.';
  end if;
end;
$$;

revoke execute on function public.save_admin_service(bigint, text, text, text, integer, numeric, boolean, uuid, text, text) from public;
grant execute on function public.save_admin_service(bigint, text, text, text, integer, numeric, boolean, uuid, text, text) to anon, authenticated;

commit;