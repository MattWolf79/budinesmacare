-- =====================================================================
-- 41) Perfil propio de clientes Google.
--     Amplia get_client_self / update_client_self para resolver tambien
--     clientes vinculados por internal_accounts.auth_user_id.
-- =====================================================================

begin;

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
  client_dni text,
  birth_date date,
  address_street text,
  address_number text,
  address_locality text,
  gender text,
  photo_url text,
  notes text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  client_account public.internal_accounts%rowtype;
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  google_auth_user_id uuid := auth.uid();
begin
  if account_id_value is not null or session_token_value is not null then
    client_account := public.validate_internal_session(account_id_value, session_token_value, 'client'::public.app_role);
    target_company_id := coalesce(target_company_id, client_account.company_id);

    if target_company_id is null or client_account.company_id is distinct from target_company_id then
      raise exception 'No podés ver datos de otra empresa.';
    end if;
  elsif google_auth_user_id is not null then
    if target_company_id is null then
      raise exception 'La empresa no esta disponible.';
    end if;

    select accounts.*
    into client_account
    from public.internal_accounts accounts
    where accounts.company_id = target_company_id
      and accounts.role = 'client'::public.app_role
      and accounts.active = true
      and accounts.auth_user_id = google_auth_user_id
    order by accounts.updated_at desc nulls last, accounts.created_at desc nulls last
    limit 1;

    if client_account.id is null then
      raise exception 'No se encontro tu cuenta de cliente.';
    end if;
  else
    raise exception 'No autorizado.';
  end if;

  return query
  select
    client_account.id,
    client_account.first_name,
    client_account.last_name,
    client_account.display_name,
    client_account.phone,
    client_account.email,
    client_account.client_dni,
    client_account.birth_date,
    client_account.address_street,
    client_account.address_number,
    client_account.address_locality,
    client_account.gender,
    client_account.photo_url,
    client_account.notes;
end;
$$;

create or replace function public.update_client_self(
  account_id_value uuid,
  session_token_value text,
  first_name_value text default null,
  last_name_value text default null,
  phone_value text default null,
  email_value text default null,
  birth_date_value date default null,
  address_street_value text default null,
  address_number_value text default null,
  address_locality_value text default null,
  gender_value text default null,
  photo_url_value text default null,
  notes_value text default null,
  company_slug_value text default null
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  display_name text,
  phone text,
  email text,
  client_dni text,
  birth_date date,
  address_street text,
  address_number text,
  address_locality text,
  gender text,
  photo_url text,
  notes text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  client_account public.internal_accounts%rowtype;
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  google_auth_user_id uuid := auth.uid();
  clean_first_name text := nullif(trim(coalesce(first_name_value, '')), '');
  clean_last_name text := nullif(trim(coalesce(last_name_value, '')), '');
  clean_phone text := nullif(trim(coalesce(phone_value, '')), '');
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
  clean_street text := nullif(trim(coalesce(address_street_value, '')), '');
  clean_number text := nullif(trim(coalesce(address_number_value, '')), '');
  clean_locality text := nullif(trim(coalesce(address_locality_value, '')), '');
  clean_gender text := nullif(trim(coalesce(gender_value, '')), '');
  clean_photo_url text := nullif(trim(coalesce(photo_url_value, '')), '');
  clean_notes text := nullif(trim(coalesce(notes_value, '')), '');
  clean_display_name text;
  saved_account public.internal_accounts%rowtype;
begin
  if account_id_value is not null or session_token_value is not null then
    client_account := public.validate_internal_session(account_id_value, session_token_value, 'client'::public.app_role);
    target_company_id := coalesce(target_company_id, client_account.company_id);

    if target_company_id is null or client_account.company_id is distinct from target_company_id then
      raise exception 'No podés editar datos de otra empresa.';
    end if;
  elsif google_auth_user_id is not null then
    if target_company_id is null then
      raise exception 'La empresa no esta disponible.';
    end if;

    select accounts.*
    into client_account
    from public.internal_accounts accounts
    where accounts.company_id = target_company_id
      and accounts.role = 'client'::public.app_role
      and accounts.active = true
      and accounts.auth_user_id = google_auth_user_id
    order by accounts.updated_at desc nulls last, accounts.created_at desc nulls last
    limit 1;

    if client_account.id is null then
      raise exception 'No se encontro tu cuenta de cliente.';
    end if;
  else
    raise exception 'No autorizado.';
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
      birth_date = birth_date_value,
      address_street = clean_street,
      address_number = clean_number,
      address_locality = clean_locality,
      gender = clean_gender,
      photo_url = clean_photo_url,
      notes = clean_notes,
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
    saved_account.client_dni,
    saved_account.birth_date,
    saved_account.address_street,
    saved_account.address_number,
    saved_account.address_locality,
    saved_account.gender,
    saved_account.photo_url,
    saved_account.notes;
end;
$$;

revoke execute on function public.get_client_self(uuid, text, text) from public;
revoke execute on function public.update_client_self(uuid, text, text, text, text, text, date, text, text, text, text, text, text, text) from public;

grant execute on function public.get_client_self(uuid, text, text) to anon, authenticated;
grant execute on function public.update_client_self(uuid, text, text, text, text, text, date, text, text, text, text, text, text, text) to anon, authenticated;

commit;