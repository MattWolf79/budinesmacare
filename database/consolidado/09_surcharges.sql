-- Recargos por medio de pago.
-- Ejecutar despues de 08_platform_client_logo.sql.

begin;

alter table public.app_configuration
  add column if not exists recargos_habilitados boolean not null default true,
  add column if not exists surcharges jsonb not null default '[]'::jsonb;

alter table public.app_configuration
  drop constraint if exists app_configuration_surcharges_array_chk;

alter table public.app_configuration
  add constraint app_configuration_surcharges_array_chk check (jsonb_typeof(surcharges) = 'array');

alter table public.booking_closures
  add column if not exists surcharges jsonb not null default '[]'::jsonb,
  add column if not exists total_surcharge_total numeric(12, 2) not null default 0;

alter table public.booking_closures
  drop constraint if exists booking_closures_surcharges_array_chk;

alter table public.booking_closures
  add constraint booking_closures_surcharges_array_chk check (jsonb_typeof(surcharges) = 'array');

create or replace function public.obtener_configuracion_operativa(configuracion public.app_configuration)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'precios_habilitados', coalesce(configuracion.precios_habilitados, true),
    'descuentos_habilitados', coalesce(configuracion.descuentos_habilitados, true),
    'recargos_habilitados', coalesce(configuracion.recargos_habilitados, true),
    'promociones_habilitadas', coalesce(configuracion.promociones_habilitadas, true),
    'turnos_superpuestos_habilitados', coalesce(configuracion.turnos_superpuestos_habilitados, true),
    'intervalo_grilla_minutos', coalesce(configuracion.intervalo_grilla_minutos, 30),
    'empleados_pueden_reservar', coalesce(configuracion.empleados_pueden_reservar, true),
    'empleados_ven_agenda_completa', coalesce(configuracion.empleados_ven_agenda_completa, true),
    'visibilidad_turnos_empleado', coalesce(configuracion.visibilidad_turnos_empleado, 'completa'),
    'empleados_cancelan_turnos', coalesce(configuracion.empleados_cancelan_turnos, 'propios'),
    'empleados_ven_detalle_turnos', coalesce(configuracion.empleados_ven_detalle_turnos, 'propios'),
    'pdf_detalle_turno_habilitado', coalesce(configuracion.pdf_detalle_turno_habilitado, false)
  )
$$;

create or replace function public.get_app_configuration(company_slug_value text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_company as (
    select companies.*
    from public.companies companies
    where companies.id = public.get_company_id_by_slug(company_slug_value)
    limit 1
  )
  select coalesce((
    select jsonb_build_object(
      'company_id', selected_company.id,
      'company_slug', selected_company.slug,
      'company_status', selected_company.status,
      'company_name', coalesce(nullif(config.company_name, ''), selected_company.name),
      'business_hours_text', coalesce(config.business_hours_text, ''),
      'welcome_background_data_url', config.welcome_background_data_url,
      'welcome_background_public_url', config.welcome_background_public_url,
      'welcome_background_file_name', config.welcome_background_file_name,
      'welcome_background_mime_type', config.welcome_background_mime_type,
      'client_logo_data_url', config.client_logo_data_url,
      'client_logo_file_name', config.client_logo_file_name,
      'client_logo_mime_type', config.client_logo_mime_type,
      'banner_data_url', config.banner_data_url,
      'banner_file_name', config.banner_file_name,
      'banner_mime_type', config.banner_mime_type,
      'banner_images', coalesce(config.banner_images, '[]'::jsonb),
      'promotions', coalesce(config.promotions, '[]'::jsonb),
      'discounts', coalesce(config.discounts, '[]'::jsonb),
      'surcharges', coalesce(config.surcharges, '[]'::jsonb),
      'client_can_choose_employee', coalesce(config.client_can_choose_employee, false),
      'configuracion_operativa', coalesce(public.obtener_configuracion_operativa(config), jsonb_build_object(
        'precios_habilitados', true,
        'descuentos_habilitados', true,
        'recargos_habilitados', true,
        'promociones_habilitadas', true,
        'turnos_superpuestos_habilitados', true,
        'intervalo_grilla_minutos', 30,
        'empleados_pueden_reservar', true,
        'empleados_ven_agenda_completa', true,
        'visibilidad_turnos_empleado', 'completa',
        'empleados_cancelan_turnos', 'propios',
        'empleados_ven_detalle_turnos', 'propios',
        'pdf_detalle_turno_habilitado', false
      ))
    )
    from selected_company
    left join public.app_configuration config on config.company_id = selected_company.id
    limit 1
  ), jsonb_build_object(
    'company_id', null,
    'company_slug', lower(trim(coalesce(company_slug_value, ''))),
    'company_status', 'not_found',
    'company_name', 'Empresa no disponible',
    'business_hours_text', '',
    'welcome_background_data_url', null,
    'welcome_background_public_url', null,
    'welcome_background_file_name', null,
    'welcome_background_mime_type', null,
    'client_logo_data_url', null,
    'client_logo_file_name', null,
    'client_logo_mime_type', null,
    'banner_data_url', null,
    'banner_file_name', null,
    'banner_mime_type', null,
    'banner_images', '[]'::jsonb,
    'promotions', '[]'::jsonb,
    'discounts', '[]'::jsonb,
    'surcharges', '[]'::jsonb,
    'client_can_choose_employee', false,
    'configuracion_operativa', jsonb_build_object(
      'precios_habilitados', true,
      'descuentos_habilitados', true,
      'recargos_habilitados', true,
      'promociones_habilitadas', true,
      'turnos_superpuestos_habilitados', true,
      'intervalo_grilla_minutos', 30,
      'empleados_pueden_reservar', true,
      'empleados_ven_agenda_completa', true,
      'visibilidad_turnos_empleado', 'completa',
      'empleados_cancelan_turnos', 'propios',
      'empleados_ven_detalle_turnos', 'propios',
      'pdf_detalle_turno_habilitado', false
    )
  ))
$$;

drop function if exists public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text, text, text);

create or replace function public.save_admin_app_configuration(
  company_name_value text default 'Turnos App',
  business_hours_text_value text default '',
  welcome_background_data_url_value text default null,
  welcome_background_file_name_value text default null,
  welcome_background_mime_type_value text default null,
  banner_data_url_value text default null,
  banner_file_name_value text default null,
  banner_mime_type_value text default null,
  banner_images_value jsonb default '[]'::jsonb,
  promotions_value jsonb default '[]'::jsonb,
  discounts_value jsonb default '[]'::jsonb,
  surcharges_value jsonb default '[]'::jsonb,
  client_can_choose_employee_value boolean default false,
  account_id_value uuid default null,
  session_token_value text default null,
  company_slug_value text default null,
  welcome_background_public_url_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid := public.get_company_id_by_slug(company_slug_value);
  admin_account public.internal_accounts%rowtype;
  clean_public_url text := nullif(trim(coalesce(welcome_background_public_url_value, '')), '');
begin
  if target_company_id is null then
    raise exception 'La empresa no esta disponible.';
  end if;

  if jsonb_typeof(coalesce(surcharges_value, '[]'::jsonb)) <> 'array' then
    raise exception 'Los recargos deben enviarse como arreglo.';
  end if;

  if clean_public_url is not null and clean_public_url not like 'https://%' then
    raise exception 'La imagen para mails debe tener una URL publica HTTPS.';
  end if;

  if public.is_admin() then
    if not exists (
      select 1
      from public.profiles profiles
      where profiles.user_id = auth.uid()
        and profiles.role = 'admin'::public.app_role
        and profiles.active is not false
        and profiles.company_id = target_company_id
    ) then
      raise exception 'No podes administrar otra empresa.';
    end if;
  else
    admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);

    if admin_account.company_id is distinct from target_company_id then
      raise exception 'No podes administrar otra empresa.';
    end if;
  end if;

  perform public.save_admin_app_configuration_039(
    company_name_value,
    business_hours_text_value,
    welcome_background_data_url_value,
    welcome_background_file_name_value,
    welcome_background_mime_type_value,
    banner_data_url_value,
    banner_file_name_value,
    banner_mime_type_value,
    banner_images_value,
    promotions_value,
    discounts_value,
    client_can_choose_employee_value,
    account_id_value,
    session_token_value,
    company_slug_value
  );

  update public.app_configuration configurations
  set welcome_background_public_url = clean_public_url,
      surcharges = coalesce(surcharges_value, '[]'::jsonb),
      updated_at = now()
  where configurations.company_id = target_company_id;

  return public.get_app_configuration(company_slug_value);
end;
$$;

grant execute on function public.save_admin_app_configuration(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, boolean, uuid, text, text, text) to anon, authenticated;

drop function if exists public.close_booking_attention(date, text, text, uuid[], jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text);

create or replace function public.close_booking_attention(
  service_date_value date,
  client_name_value text default null,
  client_email_value text default null,
  booking_ids_value uuid[] default '{}',
  closure_items_value jsonb default '[]'::jsonb,
  total_discounts_value jsonb default '[]'::jsonb,
  surcharges_value jsonb default '[]'::jsonb,
  gross_total_value numeric default 0,
  line_discount_total_value numeric default 0,
  total_discount_total_value numeric default 0,
  total_surcharge_total_value numeric default 0,
  final_total_value numeric default 0,
  cash_amount_value numeric default 0,
  transfer_amount_value numeric default 0,
  card_amount_value numeric default 0,
  account_id_value uuid default null,
  session_token_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_record public.internal_accounts%rowtype;
  saved_closure public.booking_closures%rowtype;
  booking_count integer;
  item jsonb;
begin
  if service_date_value is null then
    raise exception 'Selecciona la fecha del cierre.';
  end if;

  if service_date_value > current_date then
    raise exception 'No se pueden cerrar turnos de dias futuros.';
  end if;

  if booking_ids_value is null or array_length(booking_ids_value, 1) is null then
    raise exception 'Selecciona al menos un turno para cerrar.';
  end if;

  account_record := public.validate_internal_session(account_id_value, session_token_value, null);

  if account_record.role not in ('admin'::public.app_role, 'employee'::public.app_role) then
    raise exception 'No tenes permisos para cerrar turnos.';
  end if;

  if jsonb_typeof(coalesce(closure_items_value, '[]'::jsonb)) <> 'array' then
    raise exception 'El detalle del cierre debe enviarse como arreglo.';
  end if;

  if jsonb_typeof(coalesce(total_discounts_value, '[]'::jsonb)) <> 'array' then
    raise exception 'Los descuentos generales deben enviarse como arreglo.';
  end if;

  if jsonb_typeof(coalesce(surcharges_value, '[]'::jsonb)) <> 'array' then
    raise exception 'Los recargos deben enviarse como arreglo.';
  end if;

  if abs(coalesce(cash_amount_value, 0) + coalesce(transfer_amount_value, 0) + coalesce(card_amount_value, 0) - coalesce(final_total_value, 0)) > 0.01 then
    raise exception 'La suma de los pagos debe coincidir con el total final.';
  end if;

  select count(*)
  into booking_count
  from public.bookings bookings
  where bookings.id = any(booking_ids_value)
    and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
    and bookings.start_at::date = service_date_value
    and (
      nullif(trim(coalesce(client_email_value, '')), '') is null
      or lower(coalesce(bookings.user_email, '')) = lower(trim(client_email_value))
    )
    and (
      nullif(trim(coalesce(client_email_value, '')), '') is not null
      or nullif(trim(coalesce(client_name_value, '')), '') is null
      or public.normalize_text(coalesce(bookings.customer_name, '')) = public.normalize_text(client_name_value)
    );

  if booking_count <> array_length(booking_ids_value, 1) then
    raise exception 'Hay turnos que no corresponden al cliente, fecha o estado seleccionado.';
  end if;

  if account_record.role = 'employee'::public.app_role and not exists (
    select 1
    from public.bookings bookings
    where bookings.start_at::date = service_date_value
      and bookings.status in ('reserved', 'confirmed', 'pending_assignment')
      and bookings.employee_id = account_record.employee_id
      and (
        nullif(trim(coalesce(client_email_value, '')), '') is null
        or lower(coalesce(bookings.user_email, '')) = lower(trim(client_email_value))
      )
      and (
        nullif(trim(coalesce(client_email_value, '')), '') is not null
        or nullif(trim(coalesce(client_name_value, '')), '') is null
        or public.normalize_text(coalesce(bookings.customer_name, '')) = public.normalize_text(client_name_value)
      )
  ) then
    raise exception 'Solo podes cerrar clientes que tengan al menos un turno asignado a tu empleado ese dia.';
  end if;

  insert into public.booking_closures (
    company_id,
    client_name,
    client_email,
    service_date,
    gross_total,
    line_discount_total,
    total_discount_total,
    total_discounts,
    total_surcharge_total,
    surcharges,
    final_total,
    cash_amount,
    transfer_amount,
    card_amount,
    closed_by_account_id,
    closed_by_role
  ) values (
    account_record.company_id,
    nullif(trim(coalesce(client_name_value, '')), ''),
    nullif(trim(coalesce(client_email_value, '')), ''),
    service_date_value,
    coalesce(gross_total_value, 0),
    coalesce(line_discount_total_value, 0),
    coalesce(total_discount_total_value, 0),
    coalesce(total_discounts_value, '[]'::jsonb),
    coalesce(total_surcharge_total_value, 0),
    coalesce(surcharges_value, '[]'::jsonb),
    coalesce(final_total_value, 0),
    coalesce(cash_amount_value, 0),
    coalesce(transfer_amount_value, 0),
    coalesce(card_amount_value, 0),
    account_record.id,
    account_record.role::text
  ) returning * into saved_closure;

  for item in select * from jsonb_array_elements(coalesce(closure_items_value, '[]'::jsonb))
  loop
    insert into public.booking_closure_items (
      company_id,
      closure_id,
      booking_id,
      service_name,
      employee_id,
      employee_name,
      base_price,
      line_discount_total,
      subtotal,
      applied_discounts
    ) values (
      account_record.company_id,
      saved_closure.id,
      (item->>'bookingId')::uuid,
      coalesce(nullif(trim(item->>'serviceName'), ''), 'Servicio'),
      nullif(item->>'employeeId', '')::uuid,
      nullif(trim(item->>'employeeName'), ''),
      coalesce((item->>'basePrice')::numeric, 0),
      coalesce((item->>'lineDiscountTotal')::numeric, 0),
      coalesce((item->>'subtotal')::numeric, 0),
      coalesce(item->'appliedDiscounts', '[]'::jsonb)
    );
  end loop;

  update public.bookings
  set status = 'completed',
      closed_at = now(),
      closure_id = saved_closure.id
  where bookings.id = any(booking_ids_value)
    and bookings.company_id = account_record.company_id;

  return to_jsonb(saved_closure);
end;
$$;

grant execute on function public.close_booking_attention(date, text, text, uuid[], jsonb, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text) to anon, authenticated;

create or replace function public.get_employee_pending_settlement_bookings(
  employee_id_value uuid,
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
  admin_account public.internal_accounts%rowtype;
  target_company_id uuid;
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null or admin_account.company_id is distinct from target_company_id then
    raise exception 'No podes administrar otra empresa.';
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

  return coalesce((
    with closure_totals as (
      select closure_items.closure_id, sum(closure_items.subtotal) as subtotal
      from public.booking_closure_items closure_items
      group by closure_items.closure_id
    ), pending_rows as (
      select
        bookings.id,
        bookings.employee_id,
        employees.name as employee_name,
        coalesce(nullif(closure_items.service_name, ''), services.name, bookings.booking_description, 'Servicio') as service_name,
        coalesce(nullif(bookings.customer_name, ''), 'Cliente sin nombre') as customer_name,
        bookings.user_email,
        bookings.start_at,
        bookings.end_at,
        case
          when coalesce(closure_totals.subtotal, 0) > 0 then
            (coalesce(closure_items.subtotal, 0) / closure_totals.subtotal) * coalesce(closures.total_surcharge_total, 0)
          else 0
        end as surcharge_amount,
        greatest(
          0,
          coalesce(closure_items.subtotal, services.base_price, 0)
          - case
              when coalesce(closure_totals.subtotal, 0) > 0 then
                (coalesce(closure_items.subtotal, 0) / closure_totals.subtotal) * coalesce(closures.total_discount_total, 0)
              else 0
            end
          + case
              when coalesce(closure_totals.subtotal, 0) > 0 then
                (coalesce(closure_items.subtotal, 0) / closure_totals.subtotal) * coalesce(closures.total_surcharge_total, 0)
              else 0
            end
        ) as total_amount
      from public.bookings bookings
      left join public.booking_closure_items closure_items on closure_items.booking_id = bookings.id
      left join public.booking_closures closures on closures.id = closure_items.closure_id
      left join closure_totals on closure_totals.closure_id = closure_items.closure_id
      left join public.services services on services.id = bookings.service and services.company_id = target_company_id
      left join public.employees employees on employees.id = bookings.employee_id and employees.company_id = target_company_id
      where bookings.company_id = target_company_id
        and bookings.employee_id = employee_id_value
        and bookings.status = 'completed'
        and bookings.is_settled is false
      order by bookings.start_at
    )
    select jsonb_agg(to_jsonb(pending_rows))
    from pending_rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.settle_employee_bookings(
  employee_id_value uuid,
  booking_ids_value uuid[],
  commission_percent_value numeric,
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
  admin_account public.internal_accounts%rowtype;
  target_company_id uuid;
  clean_percent numeric(5, 2) := round(coalesce(commission_percent_value, 0), 2);
  selected_count integer;
  expected_count integer;
  selected_items jsonb;
begin
  admin_account := public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  target_company_id := coalesce(public.get_company_id_by_slug(company_slug_value), admin_account.company_id);

  if target_company_id is null or admin_account.company_id is distinct from target_company_id then
    raise exception 'No podes administrar otra empresa.';
  end if;

  if booking_ids_value is null or array_length(booking_ids_value, 1) is null then
    raise exception 'Selecciona al menos un turno para rendir.';
  end if;

  if clean_percent < 0 or clean_percent > 100 then
    raise exception 'El porcentaje debe estar entre 0 y 100.';
  end if;

  expected_count := array_length(booking_ids_value, 1);

  with closure_totals as (
    select closure_items.closure_id, sum(closure_items.subtotal) as subtotal
    from public.booking_closure_items closure_items
    group by closure_items.closure_id
  ), selected_rows as (
    select
      bookings.id,
      bookings.employee_id,
      employees.name as employee_name,
      coalesce(nullif(closure_items.service_name, ''), services.name, bookings.booking_description, 'Servicio') as service_name,
      coalesce(nullif(bookings.customer_name, ''), 'Cliente sin nombre') as customer_name,
      bookings.user_email,
      bookings.start_at,
      bookings.end_at,
      case
        when coalesce(closure_totals.subtotal, 0) > 0 then
          (coalesce(closure_items.subtotal, 0) / closure_totals.subtotal) * coalesce(closures.total_surcharge_total, 0)
        else 0
      end as surcharge_amount,
      greatest(
        0,
        coalesce(closure_items.subtotal, services.base_price, 0)
        - case
            when coalesce(closure_totals.subtotal, 0) > 0 then
              (coalesce(closure_items.subtotal, 0) / closure_totals.subtotal) * coalesce(closures.total_discount_total, 0)
            else 0
          end
        + case
            when coalesce(closure_totals.subtotal, 0) > 0 then
              (coalesce(closure_items.subtotal, 0) / closure_totals.subtotal) * coalesce(closures.total_surcharge_total, 0)
            else 0
          end
      ) as total_amount
    from public.bookings bookings
    left join public.booking_closure_items closure_items on closure_items.booking_id = bookings.id
    left join public.booking_closures closures on closures.id = closure_items.closure_id
    left join closure_totals on closure_totals.closure_id = closure_items.closure_id
    left join public.services services on services.id = bookings.service and services.company_id = target_company_id
    left join public.employees employees on employees.id = bookings.employee_id and employees.company_id = target_company_id
    where bookings.company_id = target_company_id
      and bookings.employee_id = employee_id_value
      and bookings.status = 'completed'
      and bookings.is_settled is false
      and bookings.id = any(booking_ids_value)
  )
  select count(*), coalesce(jsonb_agg(to_jsonb(selected_rows) order by selected_rows.start_at), '[]'::jsonb)
  into selected_count, selected_items
  from selected_rows;

  if selected_count <> expected_count then
    raise exception 'Hay turnos que no estan pendientes de rendicion.';
  end if;

  update public.bookings bookings
  set is_settled = true,
      settled_at = now(),
      settled_by_account_id = admin_account.id,
      settlement_percent = clean_percent,
      settlement_employee_amount = round((amounts.total_amount * clean_percent / 100)::numeric, 2),
      settlement_company_amount = round((amounts.total_amount - (amounts.total_amount * clean_percent / 100))::numeric, 2)
  from (
    select
      (item->>'id')::uuid as booking_id,
      (item->>'total_amount')::numeric as total_amount
    from jsonb_array_elements(selected_items) item
  ) amounts
  where bookings.id = amounts.booking_id;

  return jsonb_build_object(
    'commissionPercent', clean_percent,
    'items', selected_items,
    'totalAmount', coalesce((select sum((item->>'total_amount')::numeric) from jsonb_array_elements(selected_items) item), 0),
    'surchargeAmount', coalesce((select sum((item->>'surcharge_amount')::numeric) from jsonb_array_elements(selected_items) item), 0),
    'employeeAmount', coalesce((select sum((item->>'total_amount')::numeric * clean_percent / 100) from jsonb_array_elements(selected_items) item), 0),
    'companyAmount', coalesce((select sum((item->>'total_amount')::numeric * (100 - clean_percent) / 100) from jsonb_array_elements(selected_items) item), 0)
  );
end;
$$;

grant execute on function public.get_employee_pending_settlement_bookings(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.settle_employee_bookings(uuid, uuid[], numeric, uuid, text, text) to anon, authenticated;

create or replace function public.platform_create_company_admin(
  platform_account_id_value uuid,
  session_token_value text,
  company_name_value text,
  company_slug_value text,
  admin_username_value text,
  admin_first_name_value text default null,
  admin_last_name_value text default null,
  admin_email_value text default null,
  precios_habilitados_valor boolean default true,
  turnos_superpuestos_habilitados_valor boolean default true,
  intervalo_grilla_minutos_valor integer default 30,
  empleados_pueden_reservar_valor boolean default true,
  empleados_ven_agenda_completa_valor boolean default true,
  visibilidad_turnos_empleado_valor text default 'completa',
  pdf_detalle_turno_habilitado_valor boolean default false,
  empleados_cancelan_turnos_valor text default 'propios',
  empleados_ven_detalle_turnos_valor text default 'propios',
  descuentos_habilitados_valor boolean default true,
  promociones_habilitadas_valor boolean default true,
  client_logo_data_url_valor text default null,
  client_logo_file_name_valor text default null,
  client_logo_mime_type_valor text default null,
  recargos_habilitados_valor boolean default true
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
  created_company record;
begin
  select * into created_company
  from public.platform_create_company_admin(
    platform_account_id_value,
    session_token_value,
    company_name_value,
    company_slug_value,
    admin_username_value,
    admin_first_name_value,
    admin_last_name_value,
    admin_email_value,
    precios_habilitados_valor,
    turnos_superpuestos_habilitados_valor,
    intervalo_grilla_minutos_valor,
    empleados_pueden_reservar_valor,
    empleados_ven_agenda_completa_valor,
    visibilidad_turnos_empleado_valor,
    pdf_detalle_turno_habilitado_valor,
    empleados_cancelan_turnos_valor,
    empleados_ven_detalle_turnos_valor,
    descuentos_habilitados_valor,
    promociones_habilitadas_valor,
    client_logo_data_url_valor,
    client_logo_file_name_valor,
    client_logo_mime_type_valor
  )
  limit 1;

  update public.app_configuration configurations
  set recargos_habilitados = coalesce(recargos_habilitados_valor, true),
      updated_at = now()
  where configurations.company_id = created_company.company_id;

  company_id := created_company.company_id;
  company_name := created_company.company_name;
  company_slug := created_company.company_slug;
  admin_account_id := created_company.admin_account_id;
  admin_username := created_company.admin_username;
  temporary_password := created_company.temporary_password;
  return next;
end;
$$;

grant execute on function public.platform_create_company_admin(uuid, text, text, text, text, text, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text, text, boolean, boolean, text, text, text, boolean) to anon, authenticated;

create or replace function public.plataforma_actualizar_configuracion_empresa(
  cuenta_plataforma_id_valor uuid,
  token_sesion_valor text,
  slug_empresa_valor text,
  precios_habilitados_valor boolean default true,
  turnos_superpuestos_habilitados_valor boolean default true,
  intervalo_grilla_minutos_valor integer default 30,
  empleados_pueden_reservar_valor boolean default true,
  empleados_ven_agenda_completa_valor boolean default true,
  visibilidad_turnos_empleado_valor text default 'completa',
  pdf_detalle_turno_habilitado_valor boolean default false,
  slug_url_valor text default null,
  empleados_cancelan_turnos_valor text default 'propios',
  empleados_ven_detalle_turnos_valor text default 'propios',
  descuentos_habilitados_valor boolean default true,
  promociones_habilitadas_valor boolean default true,
  client_logo_data_url_valor text default null,
  client_logo_file_name_valor text default null,
  client_logo_mime_type_valor text default null,
  recargos_habilitados_valor boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_config jsonb;
  updated_company_id uuid;
begin
  updated_config := public.plataforma_actualizar_configuracion_empresa(
    cuenta_plataforma_id_valor,
    token_sesion_valor,
    slug_empresa_valor,
    precios_habilitados_valor,
    turnos_superpuestos_habilitados_valor,
    intervalo_grilla_minutos_valor,
    empleados_pueden_reservar_valor,
    empleados_ven_agenda_completa_valor,
    visibilidad_turnos_empleado_valor,
    pdf_detalle_turno_habilitado_valor,
    slug_url_valor,
    empleados_cancelan_turnos_valor,
    empleados_ven_detalle_turnos_valor,
    descuentos_habilitados_valor,
    promociones_habilitadas_valor,
    client_logo_data_url_valor,
    client_logo_file_name_valor,
    client_logo_mime_type_valor
  );

  updated_company_id := nullif(updated_config->>'company_id', '')::uuid;

  update public.app_configuration configurations
  set recargos_habilitados = coalesce(recargos_habilitados_valor, true),
      updated_at = now()
  where configurations.company_id = updated_company_id;

  return public.plataforma_obtener_configuracion_empresa(cuenta_plataforma_id_valor, token_sesion_valor, updated_config->>'company_slug');
end;
$$;

grant execute on function public.plataforma_actualizar_configuracion_empresa(uuid, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text, text, text, boolean, boolean, text, text, text, boolean) to anon, authenticated;

commit;
