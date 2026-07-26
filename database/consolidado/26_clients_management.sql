-- Migración 26: gestión de clientes para admin y empleado.
-- Los clientes son cuentas internas (internal_accounts, role='client').
-- Agrega columnas de perfil (género, comentario) y expone RPCs para que
-- admin (Google o interno) y empleados internos puedan listar, ver, crear,
-- editar y eliminar clientes de su empresa.
-- Ejecutar una vez en Supabase SQL Editor sobre la base actual.

begin;

-- 0) Columnas nuevas de perfil de cliente.
alter table public.internal_accounts
  add column if not exists gender text,
  add column if not exists notes text;

-- 1) Helper: valida que quien llama pueda gestionar clientes de la empresa.
--    Admite admin autenticado (Google) o sesión interna admin/empleado.
create or replace function public.resolve_client_manager_company(
  account_id_value uuid,
  session_token_value text,
  company_slug_value text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  actor_account public.internal_accounts%rowtype;
begin
  if target_company_id is null then
    raise exception 'La empresa no está disponible.';
  end if;

  if public.is_admin() then
    if not exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and p.role = 'admin'::public.app_role
        and p.active is not false
        and p.company_id = target_company_id
    ) then
      raise exception 'No podés administrar clientes de otra empresa.';
    end if;
  else
    actor_account := public.validate_internal_session(account_id_value, session_token_value, null);
    if actor_account.role not in ('admin'::public.app_role, 'employee'::public.app_role) then
      raise exception 'No tenés permisos para gestionar clientes.';
    end if;
    if actor_account.company_id is distinct from target_company_id then
      raise exception 'No podés administrar clientes de otra empresa.';
    end if;
  end if;

  return target_company_id;
end;
$$;

-- 2) Listado de clientes de la empresa (con búsqueda por nombre / teléfono / DNI).
create or replace function public.list_company_clients(
  account_id_value uuid default null,
  session_token_value text default null,
  company_slug_value text default null,
  search_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.resolve_client_manager_company(account_id_value, session_token_value, company_slug_value);
  clean_search text := nullif(trim(coalesce(search_value, '')), '');
  normalized_search text := public.normalize_text(coalesce(nullif(trim(coalesce(search_value, '')), ''), ''));
begin
  return coalesce((
    select jsonb_agg(to_jsonb(c) order by c.display_name)
    from (
      select
        a.id,
        a.first_name,
        a.last_name,
        a.display_name,
        a.phone,
        a.email,
        a.client_dni,
        a.birth_date,
        a.gender,
        a.address_street,
        a.address_number,
        a.address_locality,
        a.notes,
        a.photo_url,
        a.active,
        a.created_at
      from public.internal_accounts a
      where a.company_id = target_company_id
        and a.role = 'client'::public.app_role
        and (
          clean_search is null
          or public.normalize_text(coalesce(a.display_name, '')) like '%' || normalized_search || '%'
          or public.normalize_text(coalesce(a.first_name, '')) like '%' || normalized_search || '%'
          or public.normalize_text(coalesce(a.last_name, '')) like '%' || normalized_search || '%'
          or coalesce(a.phone, '') like '%' || clean_search || '%'
          or coalesce(a.client_dni, '') like '%' || clean_search || '%'
        )
    ) c
  ), '[]'::jsonb);
end;
$$;

-- 3) Detalle de un cliente.
create or replace function public.get_company_client(
  client_id_value uuid,
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
  target_company_id uuid := public.resolve_client_manager_company(account_id_value, session_token_value, company_slug_value);
  result jsonb;
begin
  select to_jsonb(c)
  into result
  from (
    select
      a.id,
      a.first_name,
      a.last_name,
      a.display_name,
      a.phone,
      a.email,
      a.client_dni,
      a.birth_date,
      a.gender,
      a.address_street,
      a.address_number,
      a.address_locality,
      a.notes,
      a.photo_url,
      a.active,
      a.created_at
    from public.internal_accounts a
    where a.id = client_id_value
      and a.company_id = target_company_id
      and a.role = 'client'::public.app_role
  ) c;

  if result is null then
    raise exception 'No se encontró el cliente.';
  end if;

  return result;
end;
$$;

-- 4) Alta / edición de cliente (upsert). client_id_value null => alta.
create or replace function public.save_company_client(
  client_id_value uuid,
  first_name_value text,
  last_name_value text,
  dni_value text,
  phone_value text default null,
  email_value text default null,
  birth_date_value date default null,
  gender_value text default null,
  address_street_value text default null,
  address_number_value text default null,
  address_locality_value text default null,
  notes_value text default null,
  photo_url_value text default null,
  blocked_value boolean default false,
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
  target_company_id uuid := public.resolve_client_manager_company(account_id_value, session_token_value, company_slug_value);
  clean_first_name text := nullif(trim(coalesce(first_name_value, '')), '');
  clean_last_name text := nullif(trim(coalesce(last_name_value, '')), '');
  clean_dni text := regexp_replace(trim(coalesce(dni_value, '')), '[^0-9]+', '', 'g');
  clean_phone text := nullif(trim(coalesce(phone_value, '')), '');
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
  clean_gender text := nullif(trim(coalesce(gender_value, '')), '');
  clean_notes text := nullif(trim(coalesce(notes_value, '')), '');
  clean_street text := nullif(trim(coalesce(address_street_value, '')), '');
  clean_number text := nullif(trim(coalesce(address_number_value, '')), '');
  clean_locality text := nullif(trim(coalesce(address_locality_value, '')), '');
  clean_photo text := nullif(trim(coalesce(photo_url_value, '')), '');
  clean_display_name text;
  is_active boolean := not coalesce(blocked_value, false);
  initial_password constant text := '123456';
  base_username text;
  candidate_username text;
  suffix integer := -1;
  saved public.internal_accounts%rowtype;
  company_name text;
  login_url text;
  welcome_text text;
  welcome_html text;
begin
  if clean_first_name is null or length(clean_first_name) < 2 or clean_last_name is null or length(clean_last_name) < 2 then
    raise exception 'Ingresá nombre y apellido.';
  end if;

  if clean_dni !~ '^[0-9]{7,10}$' then
    raise exception 'Ingresá un DNI válido de 7 a 10 dígitos.';
  end if;

  if clean_email is not null and not public.is_valid_email(clean_email) then
    raise exception 'Si ingresás mail, debe tener un formato válido.';
  end if;

  clean_display_name := trim(concat_ws(' ', clean_first_name, clean_last_name));

  if exists (
    select 1
    from public.internal_accounts a
    where a.company_id = target_company_id
      and a.role = 'client'::public.app_role
      and a.active = true
      and a.client_dni_normalized = clean_dni
      and (client_id_value is null or a.id <> client_id_value)
  ) then
    raise exception 'Ya existe un cliente activo con ese DNI.';
  end if;

  if client_id_value is null then
    base_username := regexp_replace(
      substring(public.normalize_text(clean_first_name) from 1 for 1) || public.normalize_text(clean_last_name),
      '[^a-z0-9]+',
      '',
      'g'
    );

    if length(base_username) < 3 then
      raise exception 'No se pudo generar un usuario válido con ese nombre y apellido.';
    end if;

    candidate_username := base_username;

    while exists (
      select 1
      from public.internal_accounts a
      where a.company_id = target_company_id
        and a.username_normalized = public.normalize_text(candidate_username)
    ) loop
      suffix := suffix + 1;
      candidate_username := base_username || lpad(suffix::text, 2, '0');
    end loop;

    insert into public.internal_accounts (
      company_id,
      role,
      username,
      display_name,
      first_name,
      last_name,
      birth_date,
      phone,
      email,
      address_street,
      address_number,
      address_locality,
      photo_url,
      gender,
      notes,
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
      candidate_username,
      clean_display_name,
      clean_first_name,
      clean_last_name,
      birth_date_value,
      clean_phone,
      clean_email,
      clean_street,
      clean_number,
      clean_locality,
      clean_photo,
      clean_gender,
      clean_notes,
      public.normalize_text(candidate_username),
      extensions.crypt(initial_password, extensions.gen_salt('bf')),
      null,
      true,
      clean_dni,
      clean_dni,
      is_active
    )
    returning * into saved;

    -- Aviso por mail al cliente con su usuario y contraseña temporal.
    if clean_email is not null then
      select c.name into company_name
      from public.companies c
      where c.id = target_company_id
      limit 1;

      login_url := public.build_mail_app_link(target_company_id, '');

      welcome_text :=
        'Hola ' || clean_first_name || ',' || chr(10) || chr(10)
        || 'Se creó tu usuario para ingresar' || coalesce(' a ' || company_name, '') || '.' || chr(10) || chr(10)
        || 'Usuario (DNI): ' || clean_dni || chr(10)
        || 'Contraseña temporal: ' || initial_password || chr(10) || chr(10)
        || 'Por seguridad, deberás cambiar la contraseña la primera vez que ingreses.' || chr(10) || chr(10)
        || 'Ingresá acá: ' || login_url;

      welcome_html :=
        '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0f172a;line-height:1.5">'
        || '<p>Hola ' || public.html_escape(clean_first_name) || ',</p>'
        || '<p>Se creó tu usuario para ingresar'
        || coalesce(' a <strong>' || public.html_escape(company_name) || '</strong>', '') || '.</p>'
        || '<p><strong>Usuario (DNI):</strong> ' || public.html_escape(clean_dni) || '<br>'
        || '<strong>Contraseña temporal:</strong> ' || public.html_escape(initial_password) || '</p>'
        || '<p>Por seguridad, deberás cambiar la contraseña la primera vez que ingreses.</p>'
        || '<p><a href="' || public.html_escape(login_url) || '" '
        || 'style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;'
        || 'padding:10px 18px;border-radius:8px;font-weight:700">Ingresar al sistema</a></p>'
        || '</div>';

      perform public.send_resend_email(
        clean_email,
        'Se creó tu usuario para ingresar',
        welcome_text,
        'Quiero Turno App - No responder',
        null,
        welcome_html,
        target_company_id
      );
    end if;
  else
    update public.internal_accounts a
    set first_name = clean_first_name,
        last_name = clean_last_name,
        display_name = clean_display_name,
        birth_date = birth_date_value,
        phone = clean_phone,
        email = clean_email,
        address_street = clean_street,
        address_number = clean_number,
        address_locality = clean_locality,
        photo_url = clean_photo,
        gender = clean_gender,
        notes = clean_notes,
        client_dni = clean_dni,
        client_dni_normalized = clean_dni,
        active = is_active,
        updated_at = now()
    where a.id = client_id_value
      and a.company_id = target_company_id
      and a.role = 'client'::public.app_role
    returning * into saved;

    if saved.id is null then
      raise exception 'No se encontró el cliente a actualizar.';
    end if;
  end if;

  return jsonb_build_object(
    'id', saved.id,
    'first_name', saved.first_name,
    'last_name', saved.last_name,
    'display_name', saved.display_name,
    'phone', saved.phone,
    'email', saved.email,
    'client_dni', saved.client_dni,
    'birth_date', saved.birth_date,
    'gender', saved.gender,
    'address_street', saved.address_street,
    'address_number', saved.address_number,
    'address_locality', saved.address_locality,
    'notes', saved.notes,
    'photo_url', saved.photo_url,
    'active', saved.active,
    'created_at', saved.created_at
  );
end;
$$;

-- 5) Eliminación de cliente. Bloquea si tiene turnos futuros activos; caso
--    contrario, elimina la cuenta (los turnos históricos conservan sus datos
--    porque bookings.client_account_id es on delete set null).
create or replace function public.delete_company_client(
  client_id_value uuid,
  account_id_value uuid default null,
  session_token_value text default null,
  company_slug_value text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.resolve_client_manager_company(account_id_value, session_token_value, company_slug_value);
  has_future boolean;
begin
  if not exists (
    select 1
    from public.internal_accounts a
    where a.id = client_id_value
      and a.company_id = target_company_id
      and a.role = 'client'::public.app_role
  ) then
    raise exception 'No se encontró el cliente.';
  end if;

  select exists (
    select 1
    from public.bookings b
    where b.company_id = target_company_id
      and b.client_account_id = client_id_value
      and b.status <> 'cancelled'
      and b.start_at > now()
  ) into has_future;

  if has_future then
    raise exception 'No podés eliminar un cliente con turnos futuros activos. Cancelá o reasigná esos turnos primero.';
  end if;

  update public.internal_sessions s
  set revoked_at = now()
  where s.account_id = client_id_value
    and s.revoked_at is null;

  delete from public.internal_accounts a
  where a.id = client_id_value
    and a.company_id = target_company_id
    and a.role = 'client'::public.app_role;
end;
$$;

-- 6) Perfil propio del cliente: amplía get_client_self con fecha de nacimiento y dirección.
drop function if exists public.get_client_self(uuid, text, text);
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
  address_locality text
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
    client_account.client_dni,
    client_account.birth_date,
    client_account.address_street,
    client_account.address_number,
    client_account.address_locality;
end;
$$;

-- 7) Perfil propio del cliente: amplía update_client_self con fecha de nacimiento y dirección.
drop function if exists public.update_client_self(uuid, text, text, text, text, text, text);
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
  address_locality text
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
  clean_street text := nullif(trim(coalesce(address_street_value, '')), '');
  clean_number text := nullif(trim(coalesce(address_number_value, '')), '');
  clean_locality text := nullif(trim(coalesce(address_locality_value, '')), '');
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
      birth_date = birth_date_value,
      address_street = clean_street,
      address_number = clean_number,
      address_locality = clean_locality,
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
    saved_account.address_locality;
end;
$$;

-- 8) Registro directo de cliente (Login): amplía register_client_access con
--    fecha de nacimiento y dirección.
drop function if exists public.register_client_access(text, text, text, text, text, text, text);
create or replace function public.register_client_access(
  first_name_value text,
  last_name_value text,
  dni_value text,
  phone_value text,
  email_value text,
  password_value text,
  birth_date_value date default null,
  address_street_value text default null,
  address_number_value text default null,
  address_locality_value text default null,
  company_slug_value text default null
)
returns table (
  id uuid,
  role public.app_role,
  username text,
  display_name text,
  first_name text,
  last_name text,
  photo_url text,
  employee_id uuid,
  must_change_password boolean,
  session_token text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  clean_first_name text := trim(coalesce(first_name_value, ''));
  clean_last_name text := trim(coalesce(last_name_value, ''));
  clean_display_name text := trim(concat_ws(' ', nullif(trim(coalesce(first_name_value, '')), ''), nullif(trim(coalesce(last_name_value, '')), '')));
  clean_phone text := nullif(trim(coalesce(phone_value, '')), '');
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
  clean_password text := trim(coalesce(password_value, ''));
  clean_dni text := regexp_replace(trim(coalesce(dni_value, '')), '[^0-9]+', '', 'g');
  clean_street text := nullif(trim(coalesce(address_street_value, '')), '');
  clean_number text := nullif(trim(coalesce(address_number_value, '')), '');
  clean_locality text := nullif(trim(coalesce(address_locality_value, '')), '');
  base_username text;
  candidate_username text;
  suffix integer := -1;
  inserted_account public.internal_accounts%rowtype;
begin
  if target_company_id is null then
    raise exception 'La empresa no está disponible.';
  end if;

  if length(clean_first_name) < 2 or length(clean_last_name) < 2 then
    raise exception 'Ingresá nombre y apellido.';
  end if;

  if clean_phone is null then
    raise exception 'Ingresá un celular de contacto.';
  end if;

  if clean_dni !~ '^[0-9]{7,10}$' then
    raise exception 'Ingresá un DNI válido de 7 a 10 dígitos.';
  end if;

  if clean_email is not null and not public.is_valid_email(clean_email) then
    raise exception 'Si ingresás mail, debe tener un formato válido.';
  end if;

  if length(clean_password) < 6 or clean_password !~ '^[A-Za-z0-9]+$' then
    raise exception 'La contraseña debe ser alfanumérica y tener al menos 6 caracteres.';
  end if;

  if exists (
    select 1
    from public.internal_accounts accounts
    where accounts.company_id = target_company_id
      and accounts.role = 'client'::public.app_role
      and accounts.active = true
      and accounts.client_dni_normalized = clean_dni
  ) then
    raise exception 'Ya existe una cuenta cliente con ese DNI.';
  end if;

  base_username := regexp_replace(
    substring(public.normalize_text(clean_first_name) from 1 for 1) || public.normalize_text(clean_last_name),
    '[^a-z0-9]+',
    '',
    'g'
  );

  if length(base_username) < 3 then
    raise exception 'No se pudo generar un usuario válido con ese nombre y apellido.';
  end if;

  candidate_username := base_username;

  while exists (
    select 1
    from public.internal_accounts accounts
    where accounts.company_id = target_company_id
      and accounts.username_normalized = public.normalize_text(candidate_username)
  ) loop
    suffix := suffix + 1;
    candidate_username := base_username || lpad(suffix::text, 2, '0');
  end loop;

  insert into public.internal_accounts (
    company_id,
    role,
    username,
    display_name,
    first_name,
    last_name,
    birth_date,
    phone,
    email,
    address_street,
    address_number,
    address_locality,
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
    candidate_username,
    clean_display_name,
    clean_first_name,
    clean_last_name,
    birth_date_value,
    clean_phone,
    clean_email,
    clean_street,
    clean_number,
    clean_locality,
    public.normalize_text(candidate_username),
    extensions.crypt(clean_password, extensions.gen_salt('bf')),
    null,
    false,
    clean_dni,
    clean_dni,
    true
  )
  returning * into inserted_account;

  return query
  select
    inserted_account.id,
    inserted_account.role,
    inserted_account.username,
    inserted_account.display_name,
    inserted_account.first_name,
    inserted_account.last_name,
    inserted_account.photo_url,
    inserted_account.employee_id,
    inserted_account.must_change_password,
    public.create_internal_session(inserted_account.id);
end;
$$;

-- 9) Historial de turnos de un cliente para admin / empleado.
create or replace function public.get_company_client_bookings(
  client_id_value uuid,
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
  target_company_id uuid := public.resolve_client_manager_company(account_id_value, session_token_value, company_slug_value);
begin
  if not exists (
    select 1
    from public.internal_accounts a
    where a.id = client_id_value
      and a.company_id = target_company_id
      and a.role = 'client'::public.app_role
  ) then
    raise exception 'No se encontró el cliente.';
  end if;

  return coalesce((
    select jsonb_agg(row_data order by (row_data->>'start_at') desc)
    from (
      select jsonb_build_object(
        'id', b.id,
        'start_at', b.start_at,
        'end_at', b.end_at,
        'status', b.status,
        'service_name', s.name,
        'employee_name', e.name,
        'customer_name', b.customer_name
      ) as row_data
      from public.bookings b
      left join public.services s on s.id = b.service
      left join public.employees e on e.id = b.employee_id
      where b.company_id = target_company_id
        and b.client_account_id = client_id_value
      order by b.start_at desc
      limit 100
    ) rows
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.resolve_client_manager_company(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.get_client_self(uuid, text, text) from public;
revoke execute on function public.update_client_self(uuid, text, text, text, text, text, date, text, text, text, text) from public;
revoke execute on function public.register_client_access(text, text, text, text, text, text, date, text, text, text, text) from public;
revoke execute on function public.get_company_client_bookings(uuid, uuid, text, text) from public;
revoke execute on function public.list_company_clients(uuid, text, text, text) from public;
revoke execute on function public.get_company_client(uuid, uuid, text, text) from public;
revoke execute on function public.save_company_client(uuid, text, text, text, text, text, date, text, text, text, text, text, text, boolean, uuid, text, text) from public;
revoke execute on function public.delete_company_client(uuid, uuid, text, text) from public;

grant execute on function public.list_company_clients(uuid, text, text, text) to anon, authenticated;
grant execute on function public.get_company_client(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.save_company_client(uuid, text, text, text, text, text, date, text, text, text, text, text, text, boolean, uuid, text, text) to anon, authenticated;
grant execute on function public.delete_company_client(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.get_client_self(uuid, text, text) to anon, authenticated;
grant execute on function public.update_client_self(uuid, text, text, text, text, text, date, text, text, text, text) to anon, authenticated;
grant execute on function public.register_client_access(text, text, text, text, text, text, date, text, text, text, text) to anon, authenticated;
grant execute on function public.get_company_client_bookings(uuid, uuid, text, text) to anon, authenticated;

commit;
