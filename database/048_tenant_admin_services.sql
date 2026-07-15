-- Tenant-aware service create/update.
-- Run after 047_employee_company_fallback.sql.

begin;

drop function if exists public.save_admin_service(bigint, text, text, text, integer, boolean, uuid);
drop function if exists public.save_admin_service(bigint, text, text, text, integer, boolean, uuid, text);
drop function if exists public.save_admin_service(bigint, text, text, text, integer, numeric, boolean, uuid, text);
drop function if exists public.save_admin_service(bigint, text, text, text, integer, numeric, boolean, uuid, text, text);

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
  activity_discount_check_id_value text default null,
  company_slug_value text default null
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
  admin_account public.internal_accounts%rowtype;
  target_company_id uuid;
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null then
    raise exception 'La empresa no está disponible.';
  end if;

  if admin_account.company_id is distinct from target_company_id then
    raise exception 'No podés administrar otra empresa.';
  end if;

  if clean_name is null then
    raise exception 'Ingresa el nombre del servicio.';
  end if;

  if clean_duration <= 0 then
    raise exception 'La duracion del servicio debe ser mayor a cero.';
  end if;

  if clean_base_price < 0 then
    raise exception 'El precio base no puede ser negativo.';
  end if;

  if service_id_value is null then
    return query
    insert into public.services (company_id, name, icon, color, default_duration, base_price, active, activity_discount_check_id)
    values (
      target_company_id,
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
      activity_discount_check_id = clean_activity_discount_check_id,
      company_id = target_company_id
  where services.id = service_id_value
    and services.company_id = target_company_id
  returning services.id, services.name, services.icon, services.color, services.default_duration, services.base_price, services.active, services.activity_discount_check_id;

  if not found then
    raise exception 'El servicio no pertenece a esta empresa.';
  end if;
end;
$$;

revoke execute on function public.save_admin_service(bigint, text, text, text, integer, numeric, boolean, uuid, text, text, text) from public;

grant execute on function public.save_admin_service(bigint, text, text, text, integer, numeric, boolean, uuid, text, text, text) to anon, authenticated;

commit;
