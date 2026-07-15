-- Tenant-aware availability fallback and filtered admin availability payload.
-- Run after 048_tenant_admin_services.sql.

begin;

create or replace function public.get_admin_panel_data(
  account_id_value uuid default null,
  request_status_value text default 'pending',
  session_token_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_account public.internal_accounts%rowtype;
  target_company_id uuid;
  payload jsonb;
begin
  if public.is_admin() then
    target_company_id := public.get_company_id_by_slug(company_slug_value);

    if target_company_id is null then
      raise exception 'La empresa no está disponible.';
    end if;

    if not exists (
      select 1
      from public.profiles profiles
      where profiles.user_id = auth.uid()
        and profiles.role = 'admin'::public.app_role
        and profiles.active is not false
        and profiles.company_id = target_company_id
    ) then
      raise exception 'No podés administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

    if target_company_id is null then
      raise exception 'La empresa no está disponible.';
    end if;

    if admin_account.company_id is distinct from target_company_id then
      raise exception 'No podés administrar otra empresa.';
    end if;
  end if;

  select jsonb_build_object(
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(booking_rows) order by booking_rows.start_at)
      from (
        select *
        from public.bookings bookings
        where bookings.company_id = target_company_id
        order by bookings.start_at
      ) booking_rows
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(to_jsonb(employee_rows) order by employee_rows.name)
      from (
        select
          employees.*,
          coalesce(accounts.role = 'admin'::public.app_role, false) as is_admin,
          accounts.username as internal_username
        from public.employees employees
        left join public.internal_accounts accounts
          on accounts.employee_id = employees.id
          and accounts.active = true
          and accounts.company_id = target_company_id
        where employees.company_id = target_company_id
          and employees.deleted_at is null
      ) employee_rows
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(to_jsonb(service_rows) order by service_rows.id)
      from (
        select *
        from public.services services
        where services.company_id = target_company_id
        order by services.id
      ) service_rows
    ), '[]'::jsonb),
    'employeeServices', coalesce((
      select jsonb_agg(to_jsonb(relation_rows))
      from (
        select *
        from public.employee_services relations
        where relations.company_id = target_company_id
      ) relation_rows
    ), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(to_jsonb(availability_rows) order by availability_rows.available_date, availability_rows.start_time)
      from (
        select *
        from public.employee_availability availability
        where availability.company_id = target_company_id
        order by availability.available_date, availability.start_time
      ) availability_rows
    ), '[]'::jsonb),
    'accessRequests', coalesce((
      select jsonb_agg(to_jsonb(request_rows) order by request_rows.created_at desc)
      from (
        select
          requests.id,
          requests.role,
          requests.username,
          requests.display_name,
          requests.first_name,
          requests.last_name,
          requests.birth_date,
          requests.phone,
          requests.address_street,
          requests.address_number,
          requests.address_locality,
          requests.photo_url,
          requests.employee_id,
          requests.status,
          requests.created_at,
          requests.reviewed_at
        from public.internal_registration_requests requests
        where requests.company_id = target_company_id
          and (request_status_value is null or requests.status = request_status_value)
      ) request_rows
    ), '[]'::jsonb)
  ) into payload;

  return payload;
end;
$$;

create or replace function public.list_internal_employee_availability(
  account_id_value uuid,
  session_token_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  target_company_id uuid;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), account_record.company_id);

  if target_company_id is null or account_record.company_id is distinct from target_company_id then
    raise exception 'La cuenta interna no pertenece a esta empresa.';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(availability) order by availability.available_date, availability.start_time)
    from public.employee_availability availability
    where availability.company_id = target_company_id
      and availability.employee_id = account_record.employee_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.save_admin_employee_availability(
  availability_id_value text,
  employee_id_value uuid,
  available_date_value date,
  start_time_value time without time zone,
  end_time_value time without time zone,
  active_value boolean default true,
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
  target_company_id uuid;
  admin_account public.internal_accounts%rowtype;
  result jsonb;
begin
  if public.is_admin() then
    target_company_id := public.get_company_id_by_slug(company_slug_value);

    if target_company_id is null then
      raise exception 'La empresa no está disponible.';
    end if;

    if not exists (
      select 1
      from public.profiles profiles
      where profiles.user_id = auth.uid()
        and profiles.role = 'admin'::public.app_role
        and profiles.active is not false
        and profiles.company_id = target_company_id
    ) then
      raise exception 'No podés administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

    if target_company_id is null then
      raise exception 'La empresa no está disponible.';
    end if;

    if admin_account.company_id is distinct from target_company_id then
      raise exception 'No podés administrar otra empresa.';
    end if;
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

  if availability_id_value is not null and not exists (
    select 1
    from public.employee_availability availability
    where availability.id = availability_id_value::uuid
      and availability.company_id = target_company_id
  ) then
    raise exception 'La disponibilidad no pertenece a esta empresa.';
  end if;

  result := public.save_admin_employee_availability_legacy(
    availability_id_value,
    employee_id_value,
    available_date_value,
    start_time_value,
    end_time_value,
    active_value,
    account_id_value
  );

  update public.employee_availability
  set company_id = target_company_id
  where id = (result->>'id')::uuid;

  return result || jsonb_build_object('company_id', target_company_id);
end;
$$;

create or replace function public.delete_admin_employee_availability(
  availability_id_value text,
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
  target_company_id uuid;
  admin_account public.internal_accounts%rowtype;
begin
  if public.is_admin() then
    target_company_id := public.get_company_id_by_slug(company_slug_value);

    if target_company_id is null then
      raise exception 'La empresa no está disponible.';
    end if;

    if not exists (
      select 1
      from public.profiles profiles
      where profiles.user_id = auth.uid()
        and profiles.role = 'admin'::public.app_role
        and profiles.active is not false
        and profiles.company_id = target_company_id
    ) then
      raise exception 'No podés administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
    target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

    if target_company_id is null then
      raise exception 'La empresa no está disponible.';
    end if;

    if admin_account.company_id is distinct from target_company_id then
      raise exception 'No podés administrar otra empresa.';
    end if;
  end if;

  if not exists (
    select 1
    from public.employee_availability availability
    where availability.id = availability_id_value::uuid
      and availability.company_id = target_company_id
  ) then
    raise exception 'La disponibilidad no pertenece a esta empresa.';
  end if;

  perform public.delete_admin_employee_availability_legacy(availability_id_value, account_id_value);
end;
$$;

create or replace function public.create_internal_employee_availability(
  account_id_value uuid,
  available_date_value date,
  start_time_value time without time zone,
  end_time_value time without time zone,
  active_value boolean default true,
  session_token_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  target_company_id uuid;
  result jsonb;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), account_record.company_id);

  if target_company_id is null or account_record.company_id is distinct from target_company_id then
    raise exception 'La cuenta interna no pertenece a esta empresa.';
  end if;

  result := public.create_internal_employee_availability_legacy(
    account_id_value,
    available_date_value,
    start_time_value,
    end_time_value,
    active_value
  );

  update public.employee_availability
  set company_id = target_company_id
  where id = (result->>'id')::uuid;

  return result || jsonb_build_object('company_id', target_company_id);
end;
$$;

create or replace function public.update_internal_employee_availability(
  account_id_value uuid,
  availability_id_value text,
  available_date_value date,
  start_time_value time without time zone,
  end_time_value time without time zone,
  active_value boolean default true,
  session_token_value text default null,
  company_slug_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  target_company_id uuid;
  result jsonb;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), account_record.company_id);

  if target_company_id is null or account_record.company_id is distinct from target_company_id then
    raise exception 'La cuenta interna no pertenece a esta empresa.';
  end if;

  if not exists (
    select 1
    from public.employee_availability availability
    where availability.id = availability_id_value::uuid
      and availability.company_id = target_company_id
      and availability.employee_id = account_record.employee_id
  ) then
    raise exception 'La disponibilidad no pertenece a esta empresa.';
  end if;

  result := public.update_internal_employee_availability_legacy(
    account_id_value,
    availability_id_value,
    available_date_value,
    start_time_value,
    end_time_value,
    active_value
  );

  update public.employee_availability
  set company_id = target_company_id
  where id = availability_id_value::uuid;

  return result || jsonb_build_object('company_id', target_company_id);
end;
$$;

create or replace function public.delete_internal_employee_availability(
  account_id_value uuid,
  availability_id_value text,
  session_token_value text default null,
  company_slug_value text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  target_company_id uuid;
begin
  account_record := public.validate_internal_session(account_id_value, session_token_value, 'employee'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), account_record.company_id);

  if target_company_id is null or account_record.company_id is distinct from target_company_id then
    raise exception 'La cuenta interna no pertenece a esta empresa.';
  end if;

  if not exists (
    select 1
    from public.employee_availability availability
    where availability.id = availability_id_value::uuid
      and availability.company_id = target_company_id
      and availability.employee_id = account_record.employee_id
  ) then
    raise exception 'La disponibilidad no pertenece a esta empresa.';
  end if;

  perform public.delete_internal_employee_availability_legacy(account_id_value, availability_id_value);
end;
$$;

grant execute on function public.get_admin_panel_data(uuid, text, text, text) to anon, authenticated;
grant execute on function public.list_internal_employee_availability(uuid, text, text) to anon, authenticated;
grant execute on function public.save_admin_employee_availability(text, uuid, date, time without time zone, time without time zone, boolean, uuid, text, text) to anon, authenticated;
grant execute on function public.delete_admin_employee_availability(text, uuid, text, text) to anon, authenticated;
grant execute on function public.create_internal_employee_availability(uuid, date, time without time zone, time without time zone, boolean, text, text) to anon, authenticated;
grant execute on function public.update_internal_employee_availability(uuid, text, date, time without time zone, time without time zone, boolean, text, text) to anon, authenticated;
grant execute on function public.delete_internal_employee_availability(uuid, text, text, text) to anon, authenticated;

commit;
