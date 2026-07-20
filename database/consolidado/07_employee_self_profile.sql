-- Patch: permite al empleado editar sus propios datos de perfil.
-- Ejecutar una vez en Supabase SQL Editor sobre la base actual.

begin;

create or replace function public.update_internal_employee_profile(
  account_id_value uuid,
  session_token_value text,
  company_slug_value text default null,
  first_name_value text default null,
  last_name_value text default null,
  birth_date_value date default null,
  phone_value text default null,
  email_value text default null,
  address_street_value text default null,
  address_number_value text default null,
  address_locality_value text default null,
  photo_url_value text default null
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
  updated_at timestamp without time zone
)
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_account public.internal_accounts%rowtype;
  target_company_id uuid;
  clean_first_name text := nullif(trim(coalesce(first_name_value, '')), '');
  clean_last_name text := nullif(trim(coalesce(last_name_value, '')), '');
  clean_email text := lower(nullif(trim(coalesce(email_value, '')), ''));
  saved_employee public.employees%rowtype;
begin
  employee_account := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), employee_account.company_id);

  if target_company_id is null then
    raise exception 'La empresa no esta disponible.';
  end if;

  if employee_account.company_id is distinct from target_company_id then
    raise exception 'No podes editar datos de otra empresa.';
  end if;

  if employee_account.employee_id is null then
    raise exception 'Tu usuario no esta vinculado a un empleado.';
  end if;

  if clean_first_name is null or clean_last_name is null then
    raise exception 'Ingresa nombre y apellido.';
  end if;

  if birth_date_value is not null and birth_date_value > current_date then
    raise exception 'La fecha de nacimiento no puede ser futura.';
  end if;

  if clean_email is not null and not public.is_valid_email(clean_email) then
    raise exception 'Ingresa un mail valido.';
  end if;

  update public.employees employees
  set name = trim(concat_ws(' ', clean_first_name, clean_last_name)),
      first_name = clean_first_name,
      last_name = clean_last_name,
      birth_date = birth_date_value,
      phone = nullif(trim(coalesce(phone_value, '')), ''),
      email = clean_email,
      address_street = nullif(trim(coalesce(address_street_value, '')), ''),
      address_number = nullif(trim(coalesce(address_number_value, '')), ''),
      address_locality = nullif(trim(coalesce(address_locality_value, '')), ''),
      photo_url = nullif(photo_url_value, ''),
      updated_at = now()
  where employees.id = employee_account.employee_id
    and employees.company_id = target_company_id
    and employees.deleted_at is null
  returning * into saved_employee;

  if saved_employee.id is null then
    raise exception 'No se encontro tu ficha de empleado.';
  end if;

  update public.internal_accounts accounts
  set display_name = saved_employee.name,
      photo_url = saved_employee.photo_url,
      updated_at = now()
  where accounts.id = employee_account.id
    and accounts.company_id = target_company_id;

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
    saved_employee.updated_at;
end;
$$;

grant execute on function public.update_internal_employee_profile(uuid, text, text, text, text, date, text, text, text, text, text, text) to anon, authenticated;

commit;
