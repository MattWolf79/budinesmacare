begin;

-- Reparacion quirurgica del cierre de atencion. Usar cuando una migracion vieja
-- haya pisado public.close_booking_attention y se pierdan calculos/snapshots.
create table if not exists public.booking_closure_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  closure_id uuid not null references public.booking_closures(id) on delete cascade,
  invoice_number text not null,
  invoiced_at timestamp without time zone not null default now(),
  client_name text,
  client_email text,
  items jsonb not null default '[]'::jsonb,
  discount_details jsonb not null default '[]'::jsonb,
  surcharge_details jsonb not null default '[]'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  payments jsonb not null default '{}'::jsonb,
  created_at timestamp without time zone not null default now(),
  constraint booking_closure_invoices_closure_uidx unique (closure_id),
  constraint booking_closure_invoices_number_uidx unique (company_id, invoice_number),
  constraint booking_closure_invoices_items_array_chk check (jsonb_typeof(items) = 'array'),
  constraint booking_closure_invoices_discount_details_array_chk check (jsonb_typeof(discount_details) = 'array'),
  constraint booking_closure_invoices_surcharge_details_array_chk check (jsonb_typeof(surcharge_details) = 'array'),
  constraint booking_closure_invoices_totals_object_chk check (jsonb_typeof(totals) = 'object'),
  constraint booking_closure_invoices_payments_object_chk check (jsonb_typeof(payments) = 'object')
);

create index if not exists booking_closure_invoices_company_id_idx
  on public.booking_closure_invoices(company_id);

drop function if exists public.close_booking_attention(date, text, text, uuid[], jsonb, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text);

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
    and bookings.company_id = account_record.company_id
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
    where bookings.company_id = account_record.company_id
      and bookings.start_at::date = service_date_value
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

  insert into public.booking_closure_invoices (
    company_id,
    closure_id,
    invoice_number,
    invoiced_at,
    client_name,
    client_email,
    items,
    discount_details,
    surcharge_details,
    totals,
    payments
  ) values (
    account_record.company_id,
    saved_closure.id,
    'FAC-' || upper(left(replace(saved_closure.id::text, '-', ''), 8)),
    now(),
    saved_closure.client_name,
    saved_closure.client_email,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'serviceName', closure_items.service_name,
        'employeeName', coalesce(closure_items.employee_name, 'Sin empleado'),
        'basePrice', closure_items.base_price,
        'startAt', bookings.start_at,
        'endAt', bookings.end_at
      ) order by bookings.start_at)
      from public.booking_closure_items closure_items
      join public.bookings bookings on bookings.id = closure_items.booking_id
      where closure_items.closure_id = saved_closure.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(details.detail)
      from (
        select jsonb_build_object(
          'label', 'Desc. ' || coalesce(nullif(closure_items.service_name, ''), 'servicio'),
          'amount', closure_items.line_discount_total
        ) as detail
        from public.booking_closure_items closure_items
        where closure_items.closure_id = saved_closure.id
          and coalesce(closure_items.line_discount_total, 0) > 0
        union all
        select jsonb_build_object(
          'label', case
            when jsonb_array_length(coalesce(saved_closure.total_discounts, '[]'::jsonb)) = 1 then 'Desc. ' || coalesce(saved_closure.total_discounts->0->>'name', 'sobre total')
            else 'Desc. sobre total'
          end,
          'amount', saved_closure.total_discount_total
        )
        where coalesce(saved_closure.total_discount_total, 0) > 0
      ) details
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', 'Recargo ' || coalesce(nullif(surcharge->>'name', ''), coalesce(nullif(surcharge->>'paymentMethod', ''), 'sobre pago')) || ' (+' || coalesce(nullif(surcharge->>'value', ''), nullif(surcharge->>'percent', ''), '0') || '%)',
        'amount', coalesce(nullif(surcharge->>'amount', '')::numeric, 0)
      ))
      from jsonb_array_elements(coalesce(saved_closure.surcharges, '[]'::jsonb)) surcharge
      where coalesce(nullif(surcharge->>'amount', '')::numeric, 0) > 0
    ), '[]'::jsonb),
    jsonb_build_object(
      'grossTotal', saved_closure.gross_total,
      'discountTotal', coalesce(saved_closure.line_discount_total, 0) + coalesce(saved_closure.total_discount_total, 0),
      'surchargeTotal', saved_closure.total_surcharge_total,
      'finalTotal', saved_closure.final_total
    ),
    jsonb_build_object(
      'cash', saved_closure.cash_amount,
      'transfer', saved_closure.transfer_amount,
      'card', saved_closure.card_amount
    )
  );

  update public.bookings
  set status = 'completed',
      closed_at = now(),
      closure_id = saved_closure.id
  where bookings.id = any(booking_ids_value)
    and bookings.company_id = account_record.company_id;

  return to_jsonb(saved_closure);
end;
$$;

grant select, insert on public.booking_closure_invoices to authenticated;
grant execute on function public.close_booking_attention(date, text, text, uuid[], jsonb, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text) to anon, authenticated;

commit;