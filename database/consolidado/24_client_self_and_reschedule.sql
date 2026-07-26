-- Migración 24: perfil cliente (ver/editar) + borrar (liberar) turno para reprogramar.
-- Los clientes son cuentas internas (internal_accounts, role='client').
-- Ejecutar una vez en Supabase SQL Editor sobre la base actual.

begin;

-- 1) Devuelve los datos propios del cliente logueado (para la vista Perfil).
create or replace function public.get_client_self(
  account_id_value uuid,
  session_token_value text,
  company_slug_value text default null
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  display_name text,
  phone text,
  email text,
  client_dni text
)
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
    raise exception 'No podés ver datos de otra empresa.';
  end if;

  return query
  select
    client_account.id,
    client_account.first_name,
    client_account.last_name,
    client_account.display_name,
    client_account.phone,
    client_account.email,
    client_account.client_dni;
end;
$$;

-- 2) Permite al cliente editar sus propios datos personales (sin DNI ni contraseña).
create or replace function public.update_client_self(
  account_id_value uuid,
  session_token_value text,
  first_name_value text default null,
  last_name_value text default null,
  phone_value text default null,
  email_value text default null,
  company_slug_value text default null
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  display_name text,
  phone text,
  email text,
  client_dni text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  client_account public.internal_accounts%rowtype;
  target_company_id uuid;
  clean_first_name text := nullif(trim(coalesce(first_name_value, '')), '');
  clean_last_name text := nullif(trim(coalesce(last_name_value, '')), '');
  clean_phone text := nullif(trim(coalesce(phone_value, '')), '');
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
  clean_display_name text;
  saved_account public.internal_accounts%rowtype;
begin
  client_account := public.validate_internal_session(account_id_value, session_token_value, 'client'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), client_account.company_id);

  if target_company_id is null or client_account.company_id is distinct from target_company_id then
    raise exception 'No podés editar datos de otra empresa.';
  end if;

  if clean_first_name is null or length(clean_first_name) < 2 or clean_last_name is null or length(clean_last_name) < 2 then
    raise exception 'Ingresá nombre y apellido.';
  end if;

  if clean_phone is null then
    raise exception 'Ingresá un celular de contacto.';
  end if;

  if clean_email is not null and not public.is_valid_email(clean_email) then
    raise exception 'Si ingresás mail, debe tener un formato válido.';
  end if;

  clean_display_name := trim(concat_ws(' ', clean_first_name, clean_last_name));

  update public.internal_accounts accounts
  set first_name = clean_first_name,
      last_name = clean_last_name,
      display_name = clean_display_name,
      phone = clean_phone,
      email = clean_email,
      updated_at = now()
  where accounts.id = client_account.id
    and accounts.company_id = target_company_id
    and accounts.role = 'client'::public.app_role
  returning * into saved_account;

  if saved_account.id is null then
    raise exception 'No se encontró tu cuenta de cliente.';
  end if;

  return query
  select
    saved_account.id,
    saved_account.first_name,
    saved_account.last_name,
    saved_account.display_name,
    saved_account.phone,
    saved_account.email,
    saved_account.client_dni;
end;
$$;

-- 3) Borra (libera) un turno propio y futuro para permitir reprogramarlo.
--    A diferencia de cancel_booking, NO marca 'cancelled' ni notifica al negocio:
--    elimina la fila para que el horario quede libre y el cliente reserve de nuevo.
create or replace function public.delete_client_booking(
  booking_id_value uuid,
  account_id_value uuid,
  session_token_value text,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  client_account public.internal_accounts%rowtype;
  target_company_id uuid;
  saved_booking public.bookings%rowtype;
  current_business_time timestamp without time zone := timezone('America/Argentina/Buenos_Aires', now());
begin
  client_account := public.validate_internal_session(account_id_value, session_token_value, 'client'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), client_account.company_id);

  if target_company_id is null or client_account.company_id is distinct from target_company_id then
    raise exception 'El turno no pertenece a esta empresa.';
  end if;

  select *
  into saved_booking
  from public.bookings bookings
  where bookings.id = booking_id_value
    and bookings.company_id = target_company_id
  for update;

  if saved_booking.id is null then
    raise exception 'El turno no existe.';
  end if;

  if saved_booking.client_account_id is distinct from client_account.id then
    raise exception 'Solo podés modificar turnos propios.';
  end if;

  if saved_booking.status not in ('reserved', 'confirmed', 'pending_assignment', 'waitlist') then
    raise exception 'Solo se pueden reprogramar turnos activos.';
  end if;

  if saved_booking.start_at <= current_business_time then
    raise exception 'No se pueden reprogramar turnos que ya pasaron.';
  end if;

  delete from public.bookings where id = saved_booking.id;

  return to_jsonb(saved_booking);
end;
$$;

revoke execute on function public.get_client_self(uuid, text, text) from public;
revoke execute on function public.update_client_self(uuid, text, text, text, text, text, text) from public;
revoke execute on function public.delete_client_booking(uuid, uuid, text, text) from public;

grant execute on function public.get_client_self(uuid, text, text) to anon, authenticated;
grant execute on function public.update_client_self(uuid, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.delete_client_booking(uuid, uuid, text, text) to anon, authenticated;

commit;
