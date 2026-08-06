-- Fase 1 Pedidos V1
-- Persistencia explicita de tipo de operacion por empresa.

begin;

alter table public.app_configuration
  add column if not exists modo_operacion text not null default 'turno';

alter table public.app_configuration
  add column if not exists usa_agenda boolean not null default true;

alter table public.app_configuration
  drop constraint if exists app_configuration_modo_operacion_chk;

alter table public.app_configuration
  add constraint app_configuration_modo_operacion_chk
  check (modo_operacion in ('turno', 'pedido'));

update public.app_configuration
set modo_operacion = coalesce(nullif(trim(modo_operacion), ''), 'turno');

update public.app_configuration
set usa_agenda = coalesce(usa_agenda, true);

create or replace function public.obtener_configuracion_operativa(configuracion public.app_configuration)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'modo_operacion', coalesce(nullif(trim(configuracion.modo_operacion), ''), 'turno'),
    'usa_agenda', coalesce(configuracion.usa_agenda, true),
    'precios_habilitados', coalesce(configuracion.precios_habilitados, true),
    'descuentos_habilitados', coalesce(configuracion.descuentos_habilitados, true),
    'recargos_habilitados', coalesce(configuracion.recargos_habilitados, true),
    'promociones_habilitadas', coalesce(configuracion.promociones_habilitadas, true),
    'packs_habilitados', coalesce(configuracion.packs_habilitados, false),
    'sucursales_habilitadas', coalesce(configuracion.sucursales_habilitadas, false),
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

create or replace function public.platform_create_company_admin(
  platform_account_id_value uuid,
  session_token_value text,
  company_name_value text,
  company_slug_value text,
  admin_username_value text,
  admin_first_name_value text default null,
  admin_last_name_value text default null,
  admin_email_value text default null,
  modo_operacion_valor text default 'turno',
  usa_agenda_valor boolean default true,
  precios_habilitados_valor boolean default true,
  descuentos_habilitados_valor boolean default true,
  recargos_habilitados_valor boolean default true,
  promociones_habilitadas_valor boolean default true,
  sucursales_habilitadas_valor boolean default false,
  packs_habilitados_valor boolean default false,
  turnos_superpuestos_habilitados_valor boolean default true,
  intervalo_grilla_minutos_valor integer default 30,
  empleados_pueden_reservar_valor boolean default true,
  empleados_ven_agenda_completa_valor boolean default true,
  visibilidad_turnos_empleado_valor text default 'completa',
  empleados_cancelan_turnos_valor text default 'propios',
  empleados_ven_detalle_turnos_valor text default 'propios',
  pdf_detalle_turno_habilitado_valor boolean default false,
  client_logo_data_url_valor text default null,
  client_logo_file_name_valor text default null,
  client_logo_mime_type_valor text default null
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
  cuenta_plataforma public.internal_accounts%rowtype;
  nombre_empresa_limpio text := nullif(trim(coalesce(company_name_value, '')), '');
  slug_empresa_limpio text := lower(regexp_replace(trim(coalesce(company_slug_value, '')), '[^a-zA-Z0-9-]', '', 'g'));
  usuario_admin_limpio text := trim(coalesce(admin_username_value, ''));
  nombre_admin_limpio text := nullif(trim(coalesce(admin_first_name_value, '')), '');
  apellido_admin_limpio text := nullif(trim(coalesce(admin_last_name_value, '')), '');
  email_admin_limpio text := lower(nullif(trim(coalesce(admin_email_value, '')), ''));
  modo_operacion_limpio text := lower(coalesce(nullif(trim(modo_operacion_valor), ''), 'turno'));
  visibilidad_limpia text := coalesce(nullif(trim(visibilidad_turnos_empleado_valor), ''), 'completa');
  cancelacion_limpia text := coalesce(nullif(trim(empleados_cancelan_turnos_valor), ''), 'propios');
  detalle_limpio text := coalesce(nullif(trim(empleados_ven_detalle_turnos_valor), ''), 'propios');
  intervalo_limpio integer := coalesce(intervalo_grilla_minutos_valor, 30);
  usa_agenda_limpio boolean := coalesce(usa_agenda_valor, true);
  logo_data_url_limpio text := nullif(trim(coalesce(client_logo_data_url_valor, '')), '');
  logo_file_name_limpio text := nullif(trim(coalesce(client_logo_file_name_valor, '')), '');
  logo_mime_type_limpio text := nullif(trim(coalesce(client_logo_mime_type_valor, '')), '');
  nombre_visual_admin text;
  empresa_guardada public.companies%rowtype;
  cuenta_admin_guardada public.internal_accounts%rowtype;
  password_temporal text := '123456';
begin
  cuenta_plataforma := public.validate_platform_admin_session(platform_account_id_value, session_token_value);

  if nombre_empresa_limpio is null then raise exception 'Ingresa el nombre de la empresa.'; end if;
  if slug_empresa_limpio !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then raise exception 'El slug debe tener entre 3 y 63 caracteres, con letras minusculas, numeros o guion.'; end if;
  if slug_empresa_limpio = 'plataforma' then raise exception 'Ese slug esta reservado para administracion plataforma.'; end if;
  if length(usuario_admin_limpio) < 3 or usuario_admin_limpio !~ '^[A-Za-z0-9._-]+$' then raise exception 'El usuario administrador debe tener al menos 3 caracteres y solo puede usar letras, numeros, punto, guion o guion bajo.'; end if;
  if email_admin_limpio is not null and not public.is_valid_email(email_admin_limpio) then raise exception 'Ingresa un mail valido para el administrador.'; end if;
  if intervalo_limpio not in (15, 30, 45, 60) then raise exception 'El intervalo de grilla debe ser 15, 30, 45 o 60 minutos.'; end if;
  if modo_operacion_limpio not in ('turno', 'pedido') then raise exception 'El modo de operacion debe ser turno o pedido.'; end if;
  if visibilidad_limpia not in ('completa', 'cliente_servicio', 'solo_ocupado', 'cliente_sin_empleado', 'solo_propios') then raise exception 'La visibilidad de turnos del empleado no es valida.'; end if;
  if cancelacion_limpia not in ('propios', 'todos', 'ninguno') then raise exception 'La configuracion de cancelacion de empleados no es valida.'; end if;
  if detalle_limpio not in ('propios', 'todos', 'ninguno') then raise exception 'La configuracion de detalle de empleados no es valida.'; end if;
  if logo_mime_type_limpio is not null and logo_mime_type_limpio not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'El logo debe ser JPG, PNG o WEBP.'; end if;
  if logo_data_url_limpio is not null and char_length(logo_data_url_limpio) > 1200000 then raise exception 'El logo no puede superar el tamano permitido.'; end if;

  if modo_operacion_limpio = 'pedido' then
    usa_agenda_limpio := false;
  end if;

  nombre_visual_admin := trim(concat_ws(' ', nombre_admin_limpio, apellido_admin_limpio));
  if nombre_visual_admin = '' then nombre_visual_admin := usuario_admin_limpio; end if;

  insert into public.companies (name, slug, status, owner_email, contact_email)
  values (nombre_empresa_limpio, slug_empresa_limpio, 'active', email_admin_limpio, email_admin_limpio)
  on conflict (slug) do update set
    name = excluded.name,
    status = 'active',
    owner_email = coalesce(excluded.owner_email, public.companies.owner_email),
    contact_email = coalesce(excluded.contact_email, public.companies.contact_email),
    updated_at = now()
  returning * into empresa_guardada;

  insert into public.app_configuration (
    id,
    company_id,
    company_name,
    business_hours_text,
    banner_images,
    promotions,
    discounts,
    client_can_choose_employee,
    modo_operacion,
    usa_agenda,
    precios_habilitados,
    descuentos_habilitados,
    recargos_habilitados,
    promociones_habilitadas,
    sucursales_habilitadas,
    packs_habilitados,
    turnos_superpuestos_habilitados,
    intervalo_grilla_minutos,
    empleados_pueden_reservar,
    empleados_ven_agenda_completa,
    visibilidad_turnos_empleado,
    empleados_cancelan_turnos,
    empleados_ven_detalle_turnos,
    pdf_detalle_turno_habilitado,
    client_logo_data_url,
    client_logo_file_name,
    client_logo_mime_type
  ) values (
    true,
    empresa_guardada.id,
    nombre_empresa_limpio,
    '',
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    false,
    modo_operacion_limpio,
    usa_agenda_limpio,
    coalesce(precios_habilitados_valor, true),
    coalesce(descuentos_habilitados_valor, true),
    coalesce(recargos_habilitados_valor, true),
    coalesce(promociones_habilitadas_valor, true),
    coalesce(sucursales_habilitadas_valor, false),
    coalesce(packs_habilitados_valor, false),
    coalesce(turnos_superpuestos_habilitados_valor, true),
    intervalo_limpio,
    coalesce(empleados_pueden_reservar_valor, true),
    visibilidad_limpia <> 'solo_propios',
    visibilidad_limpia,
    cancelacion_limpia,
    detalle_limpio,
    coalesce(pdf_detalle_turno_habilitado_valor, false),
    logo_data_url_limpio,
    logo_file_name_limpio,
    logo_mime_type_limpio
  )
  on conflict on constraint app_configuration_company_id_key do update set
    company_name = excluded.company_name,
    modo_operacion = excluded.modo_operacion,
    usa_agenda = excluded.usa_agenda,
    precios_habilitados = excluded.precios_habilitados,
    descuentos_habilitados = excluded.descuentos_habilitados,
    recargos_habilitados = excluded.recargos_habilitados,
    promociones_habilitadas = excluded.promociones_habilitadas,
    sucursales_habilitadas = excluded.sucursales_habilitadas,
    packs_habilitados = excluded.packs_habilitados,
    turnos_superpuestos_habilitados = excluded.turnos_superpuestos_habilitados,
    intervalo_grilla_minutos = excluded.intervalo_grilla_minutos,
    empleados_pueden_reservar = excluded.empleados_pueden_reservar,
    empleados_ven_agenda_completa = excluded.empleados_ven_agenda_completa,
    visibilidad_turnos_empleado = excluded.visibilidad_turnos_empleado,
    empleados_cancelan_turnos = excluded.empleados_cancelan_turnos,
    empleados_ven_detalle_turnos = excluded.empleados_ven_detalle_turnos,
    pdf_detalle_turno_habilitado = excluded.pdf_detalle_turno_habilitado,
    client_logo_data_url = excluded.client_logo_data_url,
    client_logo_file_name = excluded.client_logo_file_name,
    client_logo_mime_type = excluded.client_logo_mime_type,
    updated_at = now();

  select *
  into cuenta_admin_guardada
  from public.internal_accounts cuentas
  where cuentas.company_id = empresa_guardada.id
    and cuentas.username_normalized = public.normalize_text(usuario_admin_limpio)
  limit 1;

  if cuenta_admin_guardada.id is null then
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
      empresa_guardada.id,
      'admin'::public.app_role,
      usuario_admin_limpio,
      nombre_visual_admin,
      nombre_admin_limpio,
      apellido_admin_limpio,
      public.normalize_text(usuario_admin_limpio),
      extensions.crypt(password_temporal, extensions.gen_salt('bf')),
      null,
      true,
      true
    )
    returning * into cuenta_admin_guardada;
  else
    update public.internal_accounts
    set role = 'admin'::public.app_role,
        display_name = nombre_visual_admin,
        first_name = nombre_admin_limpio,
        last_name = apellido_admin_limpio,
        active = true,
        must_change_password = true,
        password_hash = extensions.crypt(password_temporal, extensions.gen_salt('bf')),
        updated_at = now()
    where id = cuenta_admin_guardada.id
    returning * into cuenta_admin_guardada;
  end if;

  company_id := empresa_guardada.id;
  company_name := empresa_guardada.name;
  company_slug := empresa_guardada.slug;
  admin_account_id := cuenta_admin_guardada.id;
  admin_username := cuenta_admin_guardada.username;
  temporary_password := password_temporal;
  return next;
end;
$$;

create or replace function public.plataforma_actualizar_configuracion_empresa(
  cuenta_plataforma_id_valor uuid,
  token_sesion_valor text,
  slug_empresa_valor text,
  modo_operacion_valor text default 'turno',
  usa_agenda_valor boolean default true,
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
  recargos_habilitados_valor boolean default true,
  sucursales_habilitadas_valor boolean default false,
  packs_habilitados_valor boolean default false,
  landing_config_valor jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cuenta_plataforma public.internal_accounts%rowtype;
  empresa_objetivo public.companies%rowtype;
  intervalo_limpio integer := coalesce(intervalo_grilla_minutos_valor, 30);
  visibilidad_limpia text := coalesce(nullif(trim(visibilidad_turnos_empleado_valor), ''), 'completa');
  slug_url_limpio text := lower(regexp_replace(trim(coalesce(slug_url_valor, slug_empresa_valor, '')), '[^a-zA-Z0-9-]', '', 'g'));
  cancelacion_limpia text := coalesce(nullif(trim(empleados_cancelan_turnos_valor), ''), 'propios');
  detalle_limpio text := coalesce(nullif(trim(empleados_ven_detalle_turnos_valor), ''), 'propios');
  modo_operacion_limpio text := lower(coalesce(nullif(trim(modo_operacion_valor), ''), 'turno'));
  usa_agenda_limpio boolean := coalesce(usa_agenda_valor, true);
  logo_data_url_limpio text := nullif(trim(coalesce(client_logo_data_url_valor, '')), '');
  logo_file_name_limpio text := nullif(trim(coalesce(client_logo_file_name_valor, '')), '');
  logo_mime_type_limpio text := nullif(trim(coalesce(client_logo_mime_type_valor, '')), '');
  landing_limpio jsonb := coalesce(landing_config_valor, '{}'::jsonb);
begin
  cuenta_plataforma := public.validate_platform_admin_session(cuenta_plataforma_id_valor, token_sesion_valor);

  if intervalo_limpio not in (15, 30, 45, 60) then raise exception 'El intervalo de grilla debe ser 15, 30, 45 o 60 minutos.'; end if;
  if visibilidad_limpia not in ('completa', 'cliente_servicio', 'solo_ocupado', 'cliente_sin_empleado', 'solo_propios') then raise exception 'La visibilidad de turnos del empleado no es valida.'; end if;
  if cancelacion_limpia not in ('propios', 'todos', 'ninguno') then raise exception 'La configuracion de cancelacion de empleados no es valida.'; end if;
  if detalle_limpio not in ('propios', 'todos', 'ninguno') then raise exception 'La configuracion de detalle de empleados no es valida.'; end if;
  if modo_operacion_limpio not in ('turno', 'pedido') then raise exception 'El modo de operacion debe ser turno o pedido.'; end if;
  if slug_url_limpio !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then raise exception 'El slug URL debe tener entre 3 y 63 caracteres, con letras minusculas, numeros o guion.'; end if;
  if slug_url_limpio = 'plataforma' then raise exception 'Ese slug URL esta reservado para administracion plataforma.'; end if;
  if logo_mime_type_limpio is not null and logo_mime_type_limpio not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'El logo debe ser JPG, PNG o WEBP.'; end if;
  if logo_data_url_limpio is not null and char_length(logo_data_url_limpio) > 1200000 then raise exception 'El logo no puede superar el tamano permitido.'; end if;
  if jsonb_typeof(landing_limpio) <> 'object' then raise exception 'La configuracion de la landing no es valida.'; end if;
  if char_length(landing_limpio::text) > 1600000 then raise exception 'La imagen de la landing supera el tamano permitido.'; end if;

  if modo_operacion_limpio = 'pedido' then
    usa_agenda_limpio := false;
  end if;

  select * into empresa_objetivo
  from public.companies empresas
  where empresas.slug = lower(trim(coalesce(slug_empresa_valor, '')))
  limit 1;

  if empresa_objetivo.id is null then
    raise exception 'La empresa no existe.';
  end if;

  if slug_url_limpio <> empresa_objetivo.slug and exists (
    select 1
    from public.companies empresas
    where empresas.slug = slug_url_limpio
      and empresas.id is distinct from empresa_objetivo.id
    limit 1
  ) then
    raise exception 'Ya existe una empresa con ese slug URL.';
  end if;

  update public.companies empresas
  set slug = slug_url_limpio,
      updated_at = now()
  where empresas.id = empresa_objetivo.id
  returning * into empresa_objetivo;

  insert into public.app_configuration (
    id,
    company_id,
    company_name,
    banner_images,
    promotions,
    discounts,
    modo_operacion,
    usa_agenda,
    precios_habilitados,
    descuentos_habilitados,
    recargos_habilitados,
    promociones_habilitadas,
    sucursales_habilitadas,
    packs_habilitados,
    turnos_superpuestos_habilitados,
    intervalo_grilla_minutos,
    empleados_pueden_reservar,
    empleados_ven_agenda_completa,
    visibilidad_turnos_empleado,
    empleados_cancelan_turnos,
    empleados_ven_detalle_turnos,
    pdf_detalle_turno_habilitado,
    client_logo_data_url,
    client_logo_file_name,
    client_logo_mime_type,
    landing_config
  ) values (
    true,
    empresa_objetivo.id,
    empresa_objetivo.name,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    modo_operacion_limpio,
    usa_agenda_limpio,
    coalesce(precios_habilitados_valor, true),
    coalesce(descuentos_habilitados_valor, true),
    coalesce(recargos_habilitados_valor, true),
    coalesce(promociones_habilitadas_valor, true),
    coalesce(sucursales_habilitadas_valor, false),
    coalesce(packs_habilitados_valor, false),
    coalesce(turnos_superpuestos_habilitados_valor, true),
    intervalo_limpio,
    coalesce(empleados_pueden_reservar_valor, true),
    visibilidad_limpia <> 'solo_propios',
    visibilidad_limpia,
    cancelacion_limpia,
    detalle_limpio,
    coalesce(pdf_detalle_turno_habilitado_valor, false),
    logo_data_url_limpio,
    logo_file_name_limpio,
    logo_mime_type_limpio,
    landing_limpio
  )
  on conflict on constraint app_configuration_company_id_key do update set
    modo_operacion = excluded.modo_operacion,
    usa_agenda = excluded.usa_agenda,
    precios_habilitados = excluded.precios_habilitados,
    descuentos_habilitados = excluded.descuentos_habilitados,
    recargos_habilitados = excluded.recargos_habilitados,
    promociones_habilitadas = excluded.promociones_habilitadas,
    sucursales_habilitadas = excluded.sucursales_habilitadas,
    packs_habilitados = excluded.packs_habilitados,
    turnos_superpuestos_habilitados = excluded.turnos_superpuestos_habilitados,
    intervalo_grilla_minutos = excluded.intervalo_grilla_minutos,
    empleados_pueden_reservar = excluded.empleados_pueden_reservar,
    empleados_ven_agenda_completa = excluded.empleados_ven_agenda_completa,
    visibilidad_turnos_empleado = excluded.visibilidad_turnos_empleado,
    empleados_cancelan_turnos = excluded.empleados_cancelan_turnos,
    empleados_ven_detalle_turnos = excluded.empleados_ven_detalle_turnos,
    pdf_detalle_turno_habilitado = excluded.pdf_detalle_turno_habilitado,
    client_logo_data_url = excluded.client_logo_data_url,
    client_logo_file_name = excluded.client_logo_file_name,
    client_logo_mime_type = excluded.client_logo_mime_type,
    landing_config = excluded.landing_config,
    updated_at = now();

  return public.plataforma_obtener_configuracion_empresa(cuenta_plataforma_id_valor, token_sesion_valor, empresa_objetivo.slug);
end;
$$;

grant execute on function public.platform_create_company_admin(uuid, text, text, text, text, text, text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, integer, boolean, boolean, text, text, text, boolean, text, text, text) to anon, authenticated;

grant execute on function public.plataforma_actualizar_configuracion_empresa(uuid, text, text, text, boolean, boolean, boolean, integer, boolean, boolean, text, boolean, text, text, text, boolean, boolean, text, text, text, boolean, boolean, boolean, jsonb) to anon, authenticated;

commit;
