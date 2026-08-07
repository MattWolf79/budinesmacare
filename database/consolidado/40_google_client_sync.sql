-- ============================================================================
-- Source: database/consolidado/40_google_client_sync.sql
-- ============================================================================

-- Registra clientes que ingresan con Google dentro de la base de clientes
-- (internal_accounts role='client') para todas las empresas.
-- Es idempotente y evita lecturas de datos desde el frontend: un RPC por
-- usuario/empresa/sesion cuando el perfil activo es cliente.

begin;

alter table public.internal_accounts
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

alter table public.internal_accounts
  drop constraint if exists internal_accounts_email_chk;

alter table public.internal_accounts
  add constraint internal_accounts_email_chk
  check (email is null or public.is_valid_email(email));

alter table public.internal_accounts
  drop constraint if exists internal_accounts_client_dni_required_chk;

alter table public.internal_accounts
  add constraint internal_accounts_client_dni_required_chk
  check (
    (
      role = 'client'::public.app_role
      and (
        (
          client_dni_normalized is not null
          and client_dni_normalized ~ '^[0-9]{7,10}$'
        )
        or (
          auth_user_id is not null
          and email is not null
          and public.is_valid_email(email)
        )
      )
    )
    or
    (
      role <> 'client'::public.app_role
      and client_dni is null
      and client_dni_normalized is null
      and auth_user_id is null
    )
  );

create unique index if not exists internal_accounts_company_client_auth_user_uidx
  on public.internal_accounts(company_id, auth_user_id)
  where role = 'client'::public.app_role
    and active = true
    and company_id is not null
    and auth_user_id is not null;

create index if not exists internal_accounts_company_client_email_idx
  on public.internal_accounts(company_id, lower(email))
  where role = 'client'::public.app_role
    and company_id is not null
    and email is not null;

create or replace function public.sync_google_client_account(
  first_name_value text default null,
  last_name_value text default null,
  display_name_value text default null,
  email_value text default null,
  phone_value text default null,
  photo_url_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  usuario_auth_id uuid := auth.uid();
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  auth_email text;
  email_limpio text := lower(nullif(trim(coalesce(email_value, '')), ''));
  nombre_limpio text := nullif(trim(coalesce(first_name_value, '')), '');
  apellido_limpio text := nullif(trim(coalesce(last_name_value, '')), '');
  nombre_mostrado text := nullif(trim(coalesce(display_name_value, '')), '');
  telefono_limpio text := nullif(trim(coalesce(phone_value, '')), '');
  foto_limpia text := nullif(trim(coalesce(photo_url_value, '')), '');
  usuario_base text;
  usuario_candidato text;
  sufijo integer := -1;
  cliente public.internal_accounts%rowtype;
begin
  if usuario_auth_id is null then
    raise exception 'No autorizado.';
  end if;

  if target_company_id is null then
    raise exception 'La empresa no esta disponible.';
  end if;

  select lower(nullif(trim(users.email), ''))
  into auth_email
  from auth.users users
  where users.id = usuario_auth_id
  limit 1;

  email_limpio := coalesce(auth_email, email_limpio);

  if email_limpio is null or not public.is_valid_email(email_limpio) then
    raise exception 'El email de Google no es valido.';
  end if;

  if nombre_mostrado is null then
    nombre_mostrado := nullif(trim(concat_ws(' ', nombre_limpio, apellido_limpio)), '');
  end if;

  if nombre_mostrado is null then
    nombre_mostrado := email_limpio;
  end if;

  if nombre_limpio is null then
    nombre_limpio := nullif(split_part(nombre_mostrado, ' ', 1), '');
  end if;

  if apellido_limpio is null and position(' ' in nombre_mostrado) > 0 then
    apellido_limpio := nullif(trim(regexp_replace(nombre_mostrado, '^\S+\s*', '')), '');
  end if;

  select accounts.*
  into cliente
  from public.internal_accounts accounts
  where accounts.company_id = target_company_id
    and accounts.role = 'client'::public.app_role
    and accounts.active = true
    and accounts.auth_user_id = usuario_auth_id
  order by accounts.updated_at desc nulls last, accounts.created_at desc nulls last
  limit 1;

  if cliente.id is null then
    select accounts.*
    into cliente
    from public.internal_accounts accounts
    where accounts.company_id = target_company_id
      and accounts.role = 'client'::public.app_role
      and accounts.active = true
      and accounts.auth_user_id is null
      and lower(accounts.email) = email_limpio
    order by accounts.updated_at desc nulls last, accounts.created_at desc nulls last
    limit 1;
  end if;

  if cliente.id is not null then
    update public.internal_accounts accounts
    set auth_user_id = coalesce(accounts.auth_user_id, usuario_auth_id),
        email = email_limpio,
        first_name = coalesce(nombre_limpio, accounts.first_name),
        last_name = coalesce(apellido_limpio, accounts.last_name),
        display_name = coalesce(nombre_mostrado, accounts.display_name),
        phone = coalesce(telefono_limpio, accounts.phone),
        photo_url = coalesce(foto_limpia, accounts.photo_url),
        updated_at = now()
    where accounts.id = cliente.id
      and accounts.company_id = target_company_id
      and accounts.role = 'client'::public.app_role
    returning * into cliente;

    return jsonb_build_object('id', cliente.id, 'created', false);
  end if;

  usuario_base := regexp_replace(public.normalize_text(split_part(email_limpio, '@', 1)), '[^a-z0-9]+', '', 'g');
  if length(usuario_base) < 3 then
    usuario_base := 'cliente' || left(replace(usuario_auth_id::text, '-', ''), 8);
  end if;

  usuario_candidato := usuario_base;

  while exists (
    select 1
    from public.internal_accounts accounts
    where accounts.company_id = target_company_id
      and accounts.username_normalized = public.normalize_text(usuario_candidato)
  ) loop
    sufijo := sufijo + 1;
    usuario_candidato := usuario_base || lpad(sufijo::text, 2, '0');
  end loop;

  insert into public.internal_accounts (
    company_id,
    role,
    username,
    display_name,
    first_name,
    last_name,
    phone,
    email,
    photo_url,
    auth_user_id,
    username_normalized,
    password_hash,
    employee_id,
    must_change_password,
    client_dni,
    client_dni_normalized,
    active
  ) values (
    target_company_id,
    'client'::public.app_role,
    usuario_candidato,
    nombre_mostrado,
    nombre_limpio,
    apellido_limpio,
    telefono_limpio,
    email_limpio,
    foto_limpia,
    usuario_auth_id,
    public.normalize_text(usuario_candidato),
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
    null,
    false,
    null,
    null,
    true
  )
  returning * into cliente;

  return jsonb_build_object('id', cliente.id, 'created', true);
end;
$$;

revoke execute on function public.sync_google_client_account(text, text, text, text, text, text, text) from public;
grant execute on function public.sync_google_client_account(text, text, text, text, text, text, text) to authenticated;

commit;