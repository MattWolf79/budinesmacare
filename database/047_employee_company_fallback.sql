-- Infer employee company from the internal admin session when company_slug_value is missing.
-- Run after 046_drop_ambiguous_employee_rpcs.sql.

begin;

create or replace function public.create_admin_employee(
  name_value text,
  first_name_value text default null,
  last_name_value text default null,
  birth_date_value date default null,
  phone_value text default null,
  address_street_value text default null,
  address_number_value text default null,
  address_locality_value text default null,
  photo_url_value text default null,
  code_value text default null,
  service_ids_value text[] default array[]::text[],
  is_admin_value boolean default false,
  account_id_value uuid default null,
  session_token_value text default null,
  email_value text default null,
  company_slug_value text default null
)
returns table (
  id uuid,
  name text,
  first_name text,
  last_name text,
  birth_date date,
  phone text,
  email text,
  address_street text,
  address_number text,
  address_locality text,
  photo_url text,
  code text,
  active boolean,
  deleted_at timestamp without time zone,
  created_at timestamp without time zone,
  updated_at timestamp without time zone,
  internal_username text,
  is_admin boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  admin_account public.internal_accounts%rowtype;
  created_employee record;
  saved_employee public.employees%rowtype;
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
  welcome_message text;
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null then
    raise exception 'La empresa no está disponible.';
  end if;

  if admin_account.company_id is distinct from target_company_id then
    raise exception 'No podés administrar otra empresa.';
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'Ingresá un mail válido para el empleado.';
  end if;

  for created_employee in
    select *
    from public.create_admin_employee_legacy(
      name_value,
      first_name_value,
      last_name_value,
      birth_date_value,
      phone_value,
      address_street_value,
      address_number_value,
      address_locality_value,
      photo_url_value,
      code_value,
      service_ids_value,
      is_admin_value,
      account_id_value
    )
  loop
    update public.employees
    set email = clean_email,
        company_id = target_company_id,
        updated_at = now()
    where employees.id = created_employee.id
    returning * into saved_employee;

    update public.internal_accounts
    set company_id = target_company_id,
        updated_at = now()
    where internal_accounts.employee_id = saved_employee.id;

    update public.employee_services
    set company_id = target_company_id
    where employee_services.employee_id = saved_employee.id;

    welcome_message := concat_ws(E'\n',
      'Tu acceso interno fue creado.',
      'Usuario: ' || created_employee.internal_username,
      'Contraseña inicial: 123456',
      'Al ingresar se te va a pedir cambiar la contraseña.',
      'Este es un mensaje automático, no respondas este mail.'
    );

    perform public.send_resend_email(
      clean_email::text,
      'Tu acceso interno fue creado'::text,
      welcome_message::text,
      'Quiero Turno App - No responder'::text,
      null::text,
      null::text,
      target_company_id::uuid
    );

    return query
    select
      saved_employee.id,
      saved_employee.name,
      saved_employee.first_name,
      saved_employee.last_name,
      saved_employee.birth_date,
      saved_employee.phone,
      saved_employee.email,
      saved_employee.address_street,
      saved_employee.address_number,
      saved_employee.address_locality,
      saved_employee.photo_url,
      saved_employee.code,
      saved_employee.active,
      saved_employee.deleted_at,
      saved_employee.created_at,
      saved_employee.updated_at,
      created_employee.internal_username,
      created_employee.is_admin;
  end loop;
end;
$$;

create or replace function public.update_admin_employee(
  employee_id_value uuid,
  name_value text,
  first_name_value text default null,
  last_name_value text default null,
  birth_date_value date default null,
  phone_value text default null,
  address_street_value text default null,
  address_number_value text default null,
  address_locality_value text default null,
  photo_url_value text default null,
  code_value text default null,
  active_value boolean default true,
  is_admin_value boolean default false,
  service_ids_value text[] default array[]::text[],
  account_id_value uuid default null,
  session_token_value text default null,
  email_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  admin_account public.internal_accounts%rowtype;
  updated_employee jsonb;
  saved_employee public.employees%rowtype;
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null then
    raise exception 'La empresa no está disponible.';
  end if;

  if admin_account.company_id is distinct from target_company_id then
    raise exception 'No podés administrar otra empresa.';
  end if;

  if clean_email is null or not public.is_valid_email(clean_email) then
    raise exception 'Ingresá un mail válido para el empleado.';
  end if;

  if not exists (
    select 1
    from public.employees employees
    where employees.id = employee_id_value
      and employees.company_id = target_company_id
      and employees.deleted_at is null
  ) then
    raise exception 'El empleado no pertenece a esta empresa.';
  end if;

  updated_employee := public.update_admin_employee_legacy(
    employee_id_value,
    name_value,
    first_name_value,
    last_name_value,
    birth_date_value,
    phone_value,
    address_street_value,
    address_number_value,
    address_locality_value,
    photo_url_value,
    code_value,
    active_value,
    is_admin_value,
    service_ids_value,
    account_id_value
  );

  update public.employees
  set email = clean_email,
      company_id = target_company_id,
      updated_at = now()
  where employees.id = employee_id_value
  returning * into saved_employee;

  update public.internal_accounts
  set company_id = target_company_id,
      updated_at = now()
  where internal_accounts.employee_id = employee_id_value;

  update public.employee_services
  set company_id = target_company_id
  where employee_services.employee_id = employee_id_value;

  return to_jsonb(saved_employee) || jsonb_build_object(
    'is_admin', is_admin_value,
    'internal_username', coalesce(updated_employee ->> 'internal_username', saved_employee.name)
  );
end;
$$;

commit;
