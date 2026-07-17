-- Permitir cambiar el slug URL de una empresa desde plataforma.
-- Run after 068_bloquear_turnos_superpuestos_empresa.sql.

begin;

drop function if exists public.plataforma_actualizar_configuracion_empresa(uuid, text, text, boolean, boolean, integer, boolean, boolean, text, boolean);

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
  slug_url_valor text default null
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
begin
  platform_account := public.validate_platform_admin_session(cuenta_plataforma_id_valor, token_sesion_valor);

  if clean_intervalo not in (15, 30, 45, 60) then raise exception 'El intervalo de grilla debe ser 15, 30, 45 o 60 minutos.'; end if;
  if clean_visibilidad not in ('completa', 'solo_ocupado', 'cliente_sin_empleado', 'solo_propios') then raise exception 'La visibilidad de turnos del empleado no es válida.'; end if;
  if clean_slug_url !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then raise exception 'El slug URL debe tener entre 3 y 63 caracteres, con letras minúsculas, números o guion.'; end if;
  if clean_slug_url = 'plataforma' then raise exception 'Ese slug URL está reservado para administración plataforma.'; end if;

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
    turnos_superpuestos_habilitados,
    intervalo_grilla_minutos,
    empleados_pueden_reservar,
    empleados_ven_agenda_completa,
    visibilidad_turnos_empleado,
    pdf_detalle_turno_habilitado
  ) values (
    true,
    target_company.id,
    target_company.name,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    coalesce(precios_habilitados_valor, true),
    coalesce(turnos_superpuestos_habilitados_valor, true),
    clean_intervalo,
    coalesce(empleados_pueden_reservar_valor, true),
    coalesce(empleados_ven_agenda_completa_valor, true),
    clean_visibilidad,
    coalesce(pdf_detalle_turno_habilitado_valor, false)
  )
  on conflict on constraint app_configuration_company_id_key do update set
    precios_habilitados = excluded.precios_habilitados,
    turnos_superpuestos_habilitados = excluded.turnos_superpuestos_habilitados,
    intervalo_grilla_minutos = excluded.intervalo_grilla_minutos,
    empleados_pueden_reservar = excluded.empleados_pueden_reservar,
    empleados_ven_agenda_completa = excluded.empleados_ven_agenda_completa,
    visibilidad_turnos_empleado = excluded.visibilidad_turnos_empleado,
    pdf_detalle_turno_habilitado = excluded.pdf_detalle_turno_habilitado,
    updated_at = now();

  return public.plataforma_obtener_configuracion_empresa(cuenta_plataforma_id_valor, token_sesion_valor, target_company.slug);
end;
$$;

grant execute on function public.plataforma_actualizar_configuracion_empresa(uuid, text, text, boolean, boolean, integer, boolean, boolean, text, boolean, text) to anon, authenticated;

commit;