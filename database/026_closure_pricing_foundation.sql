-- Pricing and closure foundation for attended bookings.
-- Run after 025_company_name_configuration.sql on existing databases.

begin;

alter table public.services
  add column if not exists base_price numeric(12, 2) not null default 0;

alter table public.services
  drop constraint if exists services_base_price_chk;

alter table public.services
  add constraint services_base_price_chk check (base_price >= 0);

alter table public.app_configuration
  add column if not exists discounts jsonb not null default '[]'::jsonb;

alter table public.app_configuration
  drop constraint if exists app_configuration_discounts_array_chk;

alter table public.app_configuration
  add constraint app_configuration_discounts_array_chk
  check (jsonb_typeof(discounts) = 'array');

alter table public.bookings
  drop constraint if exists bookings_status_chk;

alter table public.bookings
  add constraint bookings_status_chk
  check (status in ('reserved', 'confirmed', 'pending_assignment', 'cancelled', 'completed'));

alter table public.bookings
  add column if not exists closed_at timestamp without time zone;

create table if not exists public.booking_closures (
  id uuid primary key default gen_random_uuid(),
  client_name text,
  client_email text,
  service_date date not null,
  gross_total numeric(12, 2) not null default 0,
  line_discount_total numeric(12, 2) not null default 0,
  total_discount_total numeric(12, 2) not null default 0,
  total_discounts jsonb not null default '[]'::jsonb,
  final_total numeric(12, 2) not null default 0,
  cash_amount numeric(12, 2) not null default 0,
  transfer_amount numeric(12, 2) not null default 0,
  card_amount numeric(12, 2) not null default 0,
  closed_by_account_id uuid,
  closed_by_role text not null,
  created_at timestamp without time zone not null default now(),
  constraint booking_closures_non_negative_chk check (
    gross_total >= 0 and
    line_discount_total >= 0 and
    total_discount_total >= 0 and
    final_total >= 0 and
    cash_amount >= 0 and
    transfer_amount >= 0 and
    card_amount >= 0
  ),
  constraint booking_closures_total_discounts_array_chk check (jsonb_typeof(total_discounts) = 'array'),
  constraint booking_closures_role_chk check (closed_by_role in ('admin', 'employee'))
);

alter table public.booking_closures
  add column if not exists total_discounts jsonb not null default '[]'::jsonb;

alter table public.booking_closures
  drop constraint if exists booking_closures_total_discounts_array_chk;

alter table public.booking_closures
  add constraint booking_closures_total_discounts_array_chk check (jsonb_typeof(total_discounts) = 'array');

create table if not exists public.booking_closure_items (
  id uuid primary key default gen_random_uuid(),
  closure_id uuid not null references public.booking_closures(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  service_name text not null,
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text,
  base_price numeric(12, 2) not null default 0,
  line_discount_total numeric(12, 2) not null default 0,
  subtotal numeric(12, 2) not null default 0,
  applied_discounts jsonb not null default '[]'::jsonb,
  created_at timestamp without time zone not null default now(),
  constraint booking_closure_items_amounts_chk check (base_price >= 0 and line_discount_total >= 0 and subtotal >= 0),
  constraint booking_closure_items_discounts_array_chk check (jsonb_typeof(applied_discounts) = 'array')
);

create unique index if not exists booking_closure_items_booking_uidx
  on public.booking_closure_items(booking_id);

alter table public.bookings
  add column if not exists closure_id uuid references public.booking_closures(id) on delete set null;

create index if not exists bookings_closure_id_idx
  on public.bookings(closure_id);

create index if not exists booking_closures_service_date_idx
  on public.booking_closures(service_date);

create or replace function public.get_app_configuration()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'company_name', company_name,
      'banner_data_url', banner_data_url,
      'banner_file_name', banner_file_name,
      'banner_mime_type', banner_mime_type,
      'banner_images', banner_images,
      'promotions', promotions,
      'discounts', discounts,
      'client_can_choose_employee', client_can_choose_employee
    )
    from public.app_configuration
    where id = true
    limit 1
  ), jsonb_build_object(
    'company_name', 'Turnos App',
    'banner_data_url', null,
    'banner_file_name', null,
    'banner_mime_type', null,
    'banner_images', '[]'::jsonb,
    'promotions', '[]'::jsonb,
    'discounts', '[]'::jsonb,
    'client_can_choose_employee', false
  ))
$$;

create or replace function public.save_admin_app_configuration(
  company_name_value text default 'Turnos App',
  banner_data_url_value text default null,
  banner_file_name_value text default null,
  banner_mime_type_value text default null,
  banner_images_value jsonb default '[]'::jsonb,
  promotions_value jsonb default '[]'::jsonb,
  discounts_value jsonb default '[]'::jsonb,
  client_can_choose_employee_value boolean default false,
  account_id_value uuid default null,
  session_token_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_company_name text := nullif(trim(coalesce(company_name_value, '')), '');
  next_banner_images jsonb := coalesce(banner_images_value, '[]'::jsonb);
  next_promotions jsonb := coalesce(promotions_value, '[]'::jsonb);
  next_discounts jsonb := coalesce(discounts_value, '[]'::jsonb);
  banner_image jsonb;
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if next_company_name is null then
    next_company_name := 'Turnos App';
  end if;

  if char_length(next_company_name) > 40 then
    raise exception 'El nombre de la empresa debe tener hasta 40 caracteres.';
  end if;

  if banner_mime_type_value is not null and banner_mime_type_value not in ('image/jpeg', 'image/png') then
    raise exception 'El banner debe ser JPG o PNG.';
  end if;

  if banner_data_url_value is not null
    and banner_data_url_value not like 'data:image/jpeg;base64,%'
    and banner_data_url_value not like 'data:image/png;base64,%' then
    raise exception 'El banner debe estar codificado como imagen JPG o PNG.';
  end if;

  if jsonb_typeof(next_banner_images) <> 'array' then
    raise exception 'Las imagenes del banner deben enviarse como arreglo.';
  end if;

  if jsonb_array_length(next_banner_images) > 4 then
    raise exception 'El carrusel permite hasta 4 imagenes.';
  end if;

  for banner_image in select * from jsonb_array_elements(next_banner_images)
  loop
    if coalesce(banner_image->>'mimeType', '') not in ('image/jpeg', 'image/png') then
      raise exception 'Las imagenes del banner deben ser JPG o PNG.';
    end if;

    if coalesce(banner_image->>'dataUrl', '') not like 'data:image/jpeg;base64,%'
      and coalesce(banner_image->>'dataUrl', '') not like 'data:image/png;base64,%' then
      raise exception 'Las imagenes del banner deben estar codificadas como JPG o PNG.';
    end if;
  end loop;

  if jsonb_typeof(next_promotions) <> 'array' then
    raise exception 'Las promociones deben enviarse como arreglo.';
  end if;

  if jsonb_typeof(next_discounts) <> 'array' then
    raise exception 'Los descuentos deben enviarse como arreglo.';
  end if;

  insert into public.app_configuration (
    id,
    company_name,
    banner_data_url,
    banner_file_name,
    banner_mime_type,
    banner_images,
    promotions,
    discounts,
    client_can_choose_employee
  ) values (
    true,
    next_company_name,
    nullif(banner_data_url_value, ''),
    nullif(banner_file_name_value, ''),
    nullif(banner_mime_type_value, ''),
    next_banner_images,
    next_promotions,
    next_discounts,
    coalesce(client_can_choose_employee_value, false)
  )
  on conflict (id) do update set
    company_name = excluded.company_name,
    banner_data_url = excluded.banner_data_url,
    banner_file_name = excluded.banner_file_name,
    banner_mime_type = excluded.banner_mime_type,
    banner_images = excluded.banner_images,
    promotions = excluded.promotions,
    discounts = excluded.discounts,
    client_can_choose_employee = excluded.client_can_choose_employee;

  return public.get_app_configuration();
end;
$$;

create or replace function public.save_admin_service(
  service_id_value bigint,
  name_value text,
  icon_value text,
  color_value text,
  default_duration_value integer,
  base_price_value numeric,
  active_value boolean,
  account_id_value uuid default null,
  session_token_value text default null
)
returns table (
  id bigint,
  name text,
  icon text,
  color text,
  default_duration integer,
  base_price numeric,
  active boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := nullif(trim(coalesce(name_value, '')), '');
  clean_color text := coalesce(nullif(trim(coalesce(color_value, '')), ''), '#42A5F5');
  clean_duration integer := coalesce(default_duration_value, 30);
  clean_base_price numeric := coalesce(base_price_value, 0);
begin
  if not public.is_admin() then
    perform public.validate_internal_session(account_id_value, session_token_value, 'admin'::public.app_role);
  end if;

  if clean_name is null then
    raise exception 'Ingresa el nombre del servicio.';
  end if;

  if clean_duration <= 0 then
    raise exception 'La duracion del servicio debe ser mayor a cero.';
  end if;

  if clean_base_price < 0 then
    raise exception 'El precio base no puede ser negativo.';
  end if;

  if service_id_value is null then
    return query
    insert into public.services (name, icon, color, default_duration, base_price, active)
    values (
      clean_name,
      nullif(trim(coalesce(icon_value, '')), ''),
      clean_color,
      clean_duration,
      clean_base_price,
      coalesce(active_value, true)
    )
    returning services.id, services.name, services.icon, services.color, services.default_duration, services.base_price, services.active;

    return;
  end if;

  return query
  update public.services
  set name = clean_name,
      icon = nullif(trim(coalesce(icon_value, '')), ''),
      color = clean_color,
      default_duration = clean_duration,
      base_price = clean_base_price,
      active = coalesce(active_value, true)
  where services.id = service_id_value
  returning services.id, services.name, services.icon, services.color, services.default_duration, services.base_price, services.active;

  if not found then
    raise exception 'El servicio no existe.';
  end if;
end;
$$;

create or replace function public.close_booking_attention(
  service_date_value date,
  client_name_value text default null,
  client_email_value text default null,
  booking_ids_value uuid[] default '{}',
  closure_items_value jsonb default '[]'::jsonb,
  total_discounts_value jsonb default '[]'::jsonb,
  gross_total_value numeric default 0,
  line_discount_total_value numeric default 0,
  total_discount_total_value numeric default 0,
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
    client_name,
    client_email,
    service_date,
    gross_total,
    line_discount_total,
    total_discount_total,
    total_discounts,
    final_total,
    cash_amount,
    transfer_amount,
    card_amount,
    closed_by_account_id,
    closed_by_role
  ) values (
    nullif(trim(coalesce(client_name_value, '')), ''),
    nullif(trim(coalesce(client_email_value, '')), ''),
    service_date_value,
    coalesce(gross_total_value, 0),
    coalesce(line_discount_total_value, 0),
    coalesce(total_discount_total_value, 0),
    coalesce(total_discounts_value, '[]'::jsonb),
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
  where bookings.id = any(booking_ids_value);

  return to_jsonb(saved_closure);
end;
$$;

revoke execute on function public.get_app_configuration() from public;
revoke execute on function public.save_admin_app_configuration(text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text) from public;
revoke execute on function public.save_admin_service(bigint, text, text, text, integer, numeric, boolean, uuid, text) from public;
revoke execute on function public.close_booking_attention(date, text, text, uuid[], jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text) from public;

grant execute on function public.get_app_configuration() to anon, authenticated;
grant execute on function public.save_admin_app_configuration(text, text, text, text, jsonb, jsonb, jsonb, boolean, uuid, text) to anon, authenticated;
grant execute on function public.save_admin_service(bigint, text, text, text, integer, numeric, boolean, uuid, text) to anon, authenticated;
grant execute on function public.close_booking_attention(date, text, text, uuid[], jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text) to anon, authenticated;

grant select, insert, update on public.booking_closures to authenticated;
grant select, insert on public.booking_closure_items to authenticated;

commit;
