-- Fix platform company creation after 041 when PL/pgSQL resolves company_id ambiguously.
-- Run after 041_platform_admin.sql. Compatible with 042_platform_mail_tenant_links.sql.

begin;

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
  on conflict on constraint app_configuration_company_id_key do update set
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
    update public.company_memberships memberships
    set role = 'admin'::public.app_role,
        status = case when memberships.status = 'disabled' then 'disabled' else 'invited' end,
        updated_at = now()
    where memberships.company_id = saved_company.id
      and lower(memberships.email) = clean_admin_email;

    if not found then
      insert into public.company_memberships (company_id, email, role, employee_id, status)
      values (saved_company.id, clean_admin_email, 'admin'::public.app_role, null, 'invited');
    end if;
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

revoke execute on function public.platform_create_company_admin(uuid, text, text, text, text, text, text, text) from public;
grant execute on function public.platform_create_company_admin(uuid, text, text, text, text, text, text, text) to anon, authenticated;

commit;
