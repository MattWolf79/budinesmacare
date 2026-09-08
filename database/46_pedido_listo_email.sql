-- ============================================================================
-- 46_pedido_listo_email.sql
-- ============================================================================
-- Cuando se cierra un pedido (close_booking_attention_pedido, exclusivo de
-- empresas en modo_operacion = 'pedido' como Budines Macare) el cliente no
-- recibia ningun mail avisando que su pedido quedo listo.
--
-- Este script agrega ese aviso: al final del cierre, si hay un mail de
-- cliente valido, se envia un mail con:
--   * Asunto: "Tu pedido esta listo" (con el prefijo [Empresa] agregado por
--     format_company_mail_subject).
--   * Cuerpo: "Tu pedido esta listo y se enviara de la manera pactada."
--
-- No afecta a close_booking_attention (modo turno), que no se toca.
--
-- Ejecutar una vez en el SQL Editor de Supabase, despues de
-- 45_pedido_mode_email_texts.sql.
-- ============================================================================

begin;

create or replace function public.close_booking_attention_pedido(
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
  notify_email text;
  notify_label text := 'Tu pedido está listo.';
  notify_message text := 'Tu pedido está listo y se enviará de la manera pactada.';
  notify_html text;
  company_name text;
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
    and lower(trim(coalesce(bookings.status, ''))) not in ('completed', 'closed', 'cancelled', 'canceled', 'cancelado', 'cancelada')
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
      and lower(trim(coalesce(bookings.status, ''))) not in ('completed', 'closed', 'cancelled', 'canceled', 'cancelado', 'cancelada')
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

  -- Aviso al cliente: pedido listo, se envia de la manera pactada.
  notify_email := coalesce(
    saved_closure.client_email,
    (
      select bx.user_email
      from public.bookings bx
      where bx.id = any(booking_ids_value)
        and bx.user_email is not null
      limit 1
    )
  );

  if public.is_valid_email(notify_email) then
    company_name := public.get_company_mail_display_name(account_record.company_id);
    notify_html := '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;background:#eef7f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937">'
      || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#eef7f8;padding:0;margin:0"><tr><td align="center" style="padding:28px 12px">'
      || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:620px;background:#ffffff;border:1px solid #d6e7ea;border-radius:16px;overflow:hidden;box-shadow:0 14px 34px rgba(15,23,42,0.10)">'
      || '<tr><td style="padding:24px 26px;background:#26313a;color:#ffffff">'
      || '<div style="margin-top:10px;color:#ffffff;font-size:21px;line-height:1.2;font-weight:900">' || public.html_escape(company_name) || '</div>'
      || '<div style="margin-top:12px;display:inline-block;border:1px solid rgba(141,225,232,.55);border-radius:999px;padding:6px 10px;color:#dffcff;background:rgba(36,174,187,.16);font-size:12px;font-weight:700">Pedido listo</div>'
      || '<h1 style="margin:14px 0 0;color:#ffffff;font-size:24px;line-height:1.22;font-weight:800">' || public.html_escape(notify_label) || '</h1>'
      || '<p style="margin:10px 0 0;color:#d7e4e8;font-size:15px;line-height:1.55">' || public.html_escape(notify_message) || '</p>'
      || '</td></tr>'
      || '<tr><td style="padding:18px 26px;background:#f6fbfc;border-top:1px solid #e3edf0;color:#64748b;font-size:13px;line-height:1.5;text-align:center">Este es un mensaje automático de ' || public.html_escape(company_name) || '. No respondas este mail.</td></tr>'
      || '</table>'
      || '</td></tr></table>'
      || '</body></html>';

    perform public.send_resend_email(
      notify_email,
      notify_label,
      notify_message,
      'Budines Macaré - No responder',
      null,
      notify_html,
      account_record.company_id
    );
  end if;

  return to_jsonb(saved_closure);
end;
$$;

grant execute on function public.close_booking_attention_pedido(date, text, text, uuid[], jsonb, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text) to anon, authenticated;

commit;
