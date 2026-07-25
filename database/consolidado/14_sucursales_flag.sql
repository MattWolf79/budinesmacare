-- ============================================================================
-- Fase 1: Flag sucursales_habilitadas (nivel empresa / plataforma)
-- ============================================================================
-- Controla si la empresa usa multi-sucursal. Default false: las empresas
-- existentes siguen operando en modo una sola sucursal ("Principal") hasta que
-- Plataforma lo habilite. Se expone via obtener_configuracion_operativa, por lo
-- que fluye a get_company_public_context, get_app_configuration y a la vista de
-- plataforma sin cambios adicionales.
-- Ejecutar despues de 13_sucursales.sql.

begin;

alter table public.app_configuration
  add column if not exists sucursales_habilitadas boolean not null default false;

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

-- Reemplazar la firma anterior (19 args) por una que agrega sucursales_habilitadas_valor.
drop function if exists public.plataforma_actualizar_configuracion_empresa(uuid, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text, text, text, boolean, boolean, text, text, text, boolean);

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
  recargos_habilitados_valor boolean default true,
  sucursales_habilitadas_valor boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_account public.internal_accounts%rowtype;
  target_company public.companies%rowtype;
  clean_intervalo integer := coalesce(intervalo_grilla_minutos_valor, 30);
  clean_visibilidad text := coalesce(nullif(trim(visibilidad_turnos_empleado_valor), ''), 'completa');
  clean_slug_url text := lower(regexp_replace(trim(coalesce(slug_url_valor, slug_empresa_valor, '')), '[^a-zA-Z0-9-]', '', 'g'));
  clean_cancelacion text := coalesce(nullif(trim(empleados_cancelan_turnos_valor), ''), 'propios');
  clean_detalle text := coalesce(nullif(trim(empleados_ven_detalle_turnos_valor), ''), 'propios');
  clean_logo_data_url text := nullif(trim(coalesce(client_logo_data_url_valor, '')), '');
  clean_logo_file_name text := nullif(trim(coalesce(client_logo_file_name_valor, '')), '');
  clean_logo_mime_type text := nullif(trim(coalesce(client_logo_mime_type_valor, '')), '');
begin
  platform_account := public.validate_platform_admin_session(cuenta_plataforma_id_valor, token_sesion_valor);

  if clean_intervalo not in (15, 30, 45, 60) then raise exception 'El intervalo de grilla debe ser 15, 30, 45 o 60 minutos.'; end if;
  if clean_visibilidad not in ('completa', 'cliente_servicio', 'solo_ocupado', 'cliente_sin_empleado', 'solo_propios') then raise exception 'La visibilidad de turnos del empleado no es valida.'; end if;
  if clean_cancelacion not in ('propios', 'todos', 'ninguno') then raise exception 'La configuracion de cancelacion de empleados no es valida.'; end if;
  if clean_detalle not in ('propios', 'todos', 'ninguno') then raise exception 'La configuracion de detalle de empleados no es valida.'; end if;
  if clean_slug_url !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then raise exception 'El slug URL debe tener entre 3 y 63 caracteres, con letras minusculas, numeros o guion.'; end if;
  if clean_slug_url = 'plataforma' then raise exception 'Ese slug URL esta reservado para administracion plataforma.'; end if;
  if clean_logo_mime_type is not null and clean_logo_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'El logo debe ser JPG, PNG o WEBP.'; end if;
  if clean_logo_data_url is not null and char_length(clean_logo_data_url) > 1200000 then raise exception 'El logo no puede superar el tamano permitido.'; end if;

  select * into target_company
  from public.companies companies
  where companies.slug = lower(trim(coalesce(slug_empresa_valor, '')))
  limit 1;

  if target_company.id is null then
    raise exception 'La empresa no existe.';
  end if;

  if clean_slug_url <> target_company.slug and exists (
    select 1
    from public.companies companies
    where companies.slug = clean_slug_url
      and companies.id is distinct from target_company.id
    limit 1
  ) then
    raise exception 'Ya existe una empresa con ese slug URL.';
  end if;

  update public.companies companies
  set slug = clean_slug_url,
      updated_at = now()
  where companies.id = target_company.id
  returning * into target_company;

  insert into public.app_configuration (
    id,
    company_id,
    company_name,
    banner_images,
    promotions,
    discounts,
    precios_habilitados,
    descuentos_habilitados,
    recargos_habilitados,
    promociones_habilitadas,
    sucursales_habilitadas,
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
    target_company.id,
    target_company.name,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    coalesce(precios_habilitados_valor, true),
    coalesce(descuentos_habilitados_valor, true),
    coalesce(recargos_habilitados_valor, true),
    coalesce(promociones_habilitadas_valor, true),
    coalesce(sucursales_habilitadas_valor, false),
    coalesce(turnos_superpuestos_habilitados_valor, true),
    clean_intervalo,
    coalesce(empleados_pueden_reservar_valor, true),
    clean_visibilidad <> 'solo_propios',
    clean_visibilidad,
    clean_cancelacion,
    clean_detalle,
    coalesce(pdf_detalle_turno_habilitado_valor, false),
    clean_logo_data_url,
    clean_logo_file_name,
    clean_logo_mime_type
  )
  on conflict on constraint app_configuration_company_id_key do update set
    precios_habilitados = excluded.precios_habilitados,
    descuentos_habilitados = excluded.descuentos_habilitados,
    recargos_habilitados = excluded.recargos_habilitados,
    promociones_habilitadas = excluded.promociones_habilitadas,
    sucursales_habilitadas = excluded.sucursales_habilitadas,
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

  return public.plataforma_obtener_configuracion_empresa(cuenta_plataforma_id_valor, token_sesion_valor, target_company.slug);
end;
$$;

grant execute on function public.plataforma_actualizar_configuracion_empresa(uuid, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text, text, text, boolean, boolean, text, text, text, boolean, boolean) to anon, authenticated;

commit;
