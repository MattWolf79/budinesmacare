-- Platform administration account and company onboarding RPCs.
-- Run after 040_multi_tenant_internal_access.sql.
-- Reserved frontend URL: /plataforma

begin;

insert into public.internal_accounts (
  company_id,
  role,
  username,
  display_name,
  first_name,
  last_name,
  username_normalized,
  password_hash,
  employee_id,
  active,
  must_change_password
)
select
  null,
  'admin'::public.app_role,
  'Admin',
  'Administrador plataforma',
  'Administrador',
  'Plataforma',
  public.normalize_text('Admin'),
  extensions.crypt('Admin', extensions.gen_salt('bf')),
  null,
  true,
  false
where not exists (
  select 1
  from public.internal_accounts accounts
  where accounts.company_id is null
    and accounts.role = 'admin'::public.app_role
    and accounts.username_normalized = public.normalize_text('Admin')
);

update public.internal_accounts
set username = 'Admin',
    display_name = 'Administrador plataforma',
    first_name = 'Administrador',
    last_name = 'Plataforma',
    password_hash = extensions.crypt('Admin', extensions.gen_salt('bf')),
    active = true,
    must_change_password = false,
    updated_at = now()
where internal_accounts.company_id is null
  and internal_accounts.role = 'admin'::public.app_role
  and internal_accounts.username_normalized = public.normalize_text('Admin');

create or replace function public.create_platform_admin_session(account_id_value uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  session_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into public.internal_sessions (account_id, company_id, token_hash)
  values (account_id_value, null, extensions.crypt(session_token, extensions.gen_salt('bf')));

  return session_token;
end;
$$;

create or replace function public.validate_platform_admin_session(
  account_id_value uuid,
  session_token_value text
)
returns public.internal_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  session_id_value uuid;
begin
  if account_id_value is null or nullif(trim(coalesce(session_token_value, '')), '') is null then
    raise exception 'Sesión de plataforma inválida.';
  end if;

  select accounts.*
  into account_record
  from public.internal_accounts accounts
  join public.internal_sessions sessions on sessions.account_id = accounts.id
  where accounts.id = account_id_value
    and accounts.company_id is null
    and accounts.role = 'admin'::public.app_role
    and accounts.active = true
    and sessions.company_id is null
    and sessions.revoked_at is null
    and sessions.expires_at > now()
    and sessions.token_hash = extensions.crypt(trim(session_token_value), sessions.token_hash)
  order by sessions.created_at desc
  limit 1;

  if account_record.id is null then
    raise exception 'Sesión de plataforma inválida o vencida.';
  end if;

  select sessions.id
  into session_id_value
  from public.internal_sessions sessions
  where sessions.account_id = account_record.id
    and sessions.company_id is null
    and sessions.revoked_at is null
    and sessions.expires_at > now()
    and sessions.token_hash = extensions.crypt(trim(session_token_value), sessions.token_hash)
  order by sessions.created_at desc
  limit 1;

  update public.internal_sessions
  set last_used_at = now()
  where internal_sessions.id = session_id_value;

  return account_record;
end;
$$;

create or replace function public.verify_platform_admin_login(
  username_value text,
  password_value text
)
returns table (
  id uuid,
  username text,
  display_name text,
  session_token text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
begin
  select *
  into account_record
  from public.internal_accounts
  where internal_accounts.company_id is null
    and internal_accounts.role = 'admin'::public.app_role
    and internal_accounts.username_normalized = public.normalize_text(username_value)
    and internal_accounts.active = true
  limit 1;

  if account_record.id is null or account_record.password_hash <> extensions.crypt(trim(coalesce(password_value, '')), account_record.password_hash) then
    raise exception 'Usuario o password inválidos.';
  end if;

  update public.internal_accounts
  set last_login_at = now(), updated_at = now()
  where internal_accounts.id = account_record.id;

  return query
  select
    account_record.id,
    account_record.username,
    account_record.display_name,
    public.create_platform_admin_session(account_record.id);
end;
$$;

create or replace function public.platform_create_company_admin(
  platform_account_id_value uuid,
  session_token_value text,
  company_name_value text,
  company_slug_value text,
  admin_username_value text,
  admin_first_name_value text default null,
  admin_last_name_value text default null,
  admin_email_value text default null
)
returns table (
  company_id uuid,
  company_name text,
  company_slug text,
  admin_account_id uuid,
  admin_username text,
  temporary_password text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_account public.internal_accounts%rowtype;
  clean_company_name text := nullif(trim(coalesce(company_name_value, '')), '');
  clean_company_slug text := lower(regexp_replace(trim(coalesce(company_slug_value, '')), '[^a-zA-Z0-9-]', '', 'g'));
  clean_admin_username text := trim(coalesce(admin_username_value, ''));
  clean_admin_first_name text := nullif(trim(coalesce(admin_first_name_value, '')), '');
  clean_admin_last_name text := nullif(trim(coalesce(admin_last_name_value, '')), '');
  clean_admin_email text := lower(nullif(trim(coalesce(admin_email_value, '')), ''));
  next_display_name text;
  saved_company public.companies%rowtype;
  saved_account public.internal_accounts%rowtype;
  temp_password text := '123456';
begin
  platform_account := public.validate_platform_admin_session(platform_account_id_value, session_token_value);

  if clean_company_name is null then
    raise exception 'Ingresá el nombre de la empresa.';
  end if;

  if clean_company_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then
    raise exception 'El slug debe tener entre 3 y 63 caracteres, con letras minúsculas, números o guion.';
  end if;

  if clean_company_slug = 'plataforma' then
    raise exception 'Ese slug está reservado para administración plataforma.';
  end if;

  if length(clean_admin_username) < 3 or clean_admin_username !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'El usuario administrador debe tener al menos 3 caracteres y solo puede usar letras, números, punto, guion o guion bajo.';
  end if;

  if clean_admin_email is not null and not public.is_valid_email(clean_admin_email) then
    raise exception 'Ingresá un mail válido para el administrador.';
  end if;

  next_display_name := trim(concat_ws(' ', clean_admin_first_name, clean_admin_last_name));
  if next_display_name = '' then
    next_display_name := clean_admin_username;
  end if;

  insert into public.companies (name, slug, status, owner_email, contact_email)
  values (clean_company_name, clean_company_slug, 'active', clean_admin_email, clean_admin_email)
  on conflict (slug) do update set
    name = excluded.name,
    status = 'active',
    owner_email = coalesce(excluded.owner_email, public.companies.owner_email),
    contact_email = coalesce(excluded.contact_email, public.companies.contact_email),
    updated_at = now()
  returning * into saved_company;

  insert into public.app_configuration (
    id,
    company_id,
    company_name,
    business_hours_text,
    banner_images,
    promotions,
    discounts,
    client_can_choose_employee
  ) values (
    true,
    saved_company.id,
    clean_company_name,
    '',
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    false
  )
  on conflict (company_id) do update set
    company_name = excluded.company_name,
    updated_at = now();

  select *
  into saved_account
  from public.internal_accounts accounts
  where accounts.company_id = saved_company.id
    and accounts.username_normalized = public.normalize_text(clean_admin_username)
  limit 1;

  if saved_account.id is null then
    insert into public.internal_accounts (
      company_id,
      role,
      username,
      display_name,
      first_name,
      last_name,
      username_normalized,
      password_hash,
      employee_id,
      active,
      must_change_password
    ) values (
      saved_company.id,
      'admin'::public.app_role,
      clean_admin_username,
      next_display_name,
      clean_admin_first_name,
      clean_admin_last_name,
      public.normalize_text(clean_admin_username),
      extensions.crypt(temp_password, extensions.gen_salt('bf')),
      null,
      true,
      true
    )
    returning * into saved_account;
  else
    update public.internal_accounts
    set role = 'admin'::public.app_role,
        display_name = next_display_name,
        first_name = clean_admin_first_name,
        last_name = clean_admin_last_name,
        password_hash = extensions.crypt(temp_password, extensions.gen_salt('bf')),
        active = true,
        must_change_password = true,
        updated_at = now()
    where internal_accounts.id = saved_account.id
    returning * into saved_account;
  end if;

  if clean_admin_email is not null then
    insert into public.company_memberships (company_id, email, role, employee_id, status)
    values (saved_company.id, clean_admin_email, 'admin'::public.app_role, null, 'invited')
    on conflict (company_id, lower(email)) do update set
      role = 'admin'::public.app_role,
      status = case when public.company_memberships.status = 'disabled' then 'disabled' else 'invited' end,
      updated_at = now();
  end if;

  return query
  select
    saved_company.id,
    saved_company.name,
    saved_company.slug,
    saved_account.id,
    saved_account.username,
    temp_password;
end;
$$;

create or replace function public.platform_reset_company_admin_password(
  platform_account_id_value uuid,
  session_token_value text,
  company_slug_value text,
  admin_username_value text
)
returns table (
  company_id uuid,
  company_slug text,
  admin_account_id uuid,
  admin_username text,
  temporary_password text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_account public.internal_accounts%rowtype;
  target_company public.companies%rowtype;
  target_account public.internal_accounts%rowtype;
  clean_company_slug text := lower(regexp_replace(trim(coalesce(company_slug_value, '')), '[^a-zA-Z0-9-]', '', 'g'));
  clean_admin_username text := trim(coalesce(admin_username_value, ''));
  temp_password text := '123456';
begin
  platform_account := public.validate_platform_admin_session(platform_account_id_value, session_token_value);

  select *
  into target_company
  from public.companies companies
  where companies.slug = clean_company_slug
    and companies.status = 'active'
  limit 1;

  if target_company.id is null then
    raise exception 'La empresa no está disponible.';
  end if;

  select *
  into target_account
  from public.internal_accounts accounts
  where accounts.company_id = target_company.id
    and accounts.role = 'admin'::public.app_role
    and accounts.username_normalized = public.normalize_text(clean_admin_username)
    and accounts.active = true
  limit 1;

  if target_account.id is null then
    raise exception 'No se encontró un administrador activo con ese usuario para la empresa.';
  end if;

  update public.internal_sessions
  set revoked_at = now()
  where internal_sessions.account_id = target_account.id
    and internal_sessions.revoked_at is null;

  update public.internal_accounts
  set password_hash = extensions.crypt(temp_password, extensions.gen_salt('bf')),
      must_change_password = true,
      updated_at = now()
  where internal_accounts.id = target_account.id
  returning * into target_account;

  return query
  select
    target_company.id,
    target_company.slug,
    target_account.id,
    target_account.username,
    temp_password;
end;
$$;

revoke execute on function public.create_platform_admin_session(uuid) from public;
revoke execute on function public.validate_platform_admin_session(uuid, text) from public;
revoke execute on function public.verify_platform_admin_login(text, text) from public;
revoke execute on function public.platform_create_company_admin(uuid, text, text, text, text, text, text, text) from public;
revoke execute on function public.platform_reset_company_admin_password(uuid, text, text, text) from public;

grant execute on function public.verify_platform_admin_login(text, text) to anon, authenticated;
grant execute on function public.platform_create_company_admin(uuid, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.platform_reset_company_admin_password(uuid, text, text, text) to anon, authenticated;

commit;
