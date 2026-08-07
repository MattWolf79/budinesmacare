-- Consultas utiles para soporte y diagnostico.
-- Editar el slug 'empresa-prueba' por la empresa que quieras revisar.

-- Listado de empresas cargadas en Supabase, con URLs de acceso.
select
  companies.id,
  companies.name,
  companies.slug,
  companies.status,
  'https://quieroturnoapp.com.ar/' || companies.slug || '/sacarturno' as client_url,
  'https://quieroturnoapp.com.ar/' || companies.slug || '/admin' as admin_url,
  companies.created_at,
  companies.updated_at
from public.companies companies
order by companies.created_at desc;

-- Cuentas internas por usuario, con datos de empresa y empleado asociado.
select
  accounts.company_id,
  companies.name as company_name,
  companies.slug as company_slug,
  accounts.role,
  accounts.username,
  accounts.display_name as account_name,
  accounts.employee_id,
  employees.name as employee_username,
  employees.first_name,
  employees.last_name,
  employees.email,
  employees.active as employee_active,
  employees.deleted_at as employee_deleted_at,
  accounts.active as account_active,
  accounts.created_at
from public.internal_accounts accounts
join public.companies companies
  on companies.id = accounts.company_id
left join public.employees employees
  on employees.id = accounts.employee_id
 and employees.company_id = accounts.company_id
where accounts.username_normalized = public.normalize_text('nfernandez')
order by companies.name, accounts.created_at;

-- Cuentas internas por usuario dentro de una empresa especifica.
select
  accounts.company_id,
  companies.name as company_name,
  companies.slug as company_slug,
  accounts.role,
  accounts.username,
  accounts.display_name,
  accounts.employee_id,
  accounts.active,
  accounts.created_at
from public.internal_accounts accounts
join public.companies companies
  on companies.id = accounts.company_id
where companies.slug = 'empresa-prueba'
  and accounts.username_normalized = public.normalize_text('nfernandez')
order by accounts.created_at;

-- Administradores internos de una empresa, mas recientes primero.
select *
from public.internal_accounts accounts
join public.companies companies
  on companies.id = accounts.company_id
where companies.slug = 'empresa-prueba'
  and accounts.role = 'admin'
order by accounts.created_at desc;

-- Administradores internos de una empresa.
select *
from public.internal_accounts accounts
join public.companies companies
  on companies.id = accounts.company_id
where companies.slug = 'empresa-prueba'
  and accounts.role = 'admin';

-- -----------------------------------------------------------------------------
-- Verificaciones para acceso cliente con DNI + contraseña.
-- Reemplazar 'empresa-prueba' y los datos de ejemplo antes de ejecutar.
-- -----------------------------------------------------------------------------

-- Confirmar que la columna client_account_id existe en bookings.
select
  columns.column_name,
  columns.data_type,
  columns.is_nullable
from information_schema.columns columns
where columns.table_schema = 'public'
  and columns.table_name = 'bookings'
  and columns.column_name = 'client_account_id';

-- Confirmar que la funcion request_client_booking quedo con soporte para cuenta interna cliente.
select
  routine_name,
  specific_name,
  data_type
from information_schema.routines
where specific_schema = 'public'
  and routine_name in ('register_client_access', 'verify_client_login', 'request_client_booking', 'cancel_booking')
order by routine_name, specific_name;

-- Ver parametros de request_client_booking.
select
  parameters.specific_name,
  parameters.ordinal_position,
  parameters.parameter_name,
  parameters.data_type
from information_schema.parameters parameters
where parameters.specific_schema = 'public'
  and parameters.specific_name in (
    select routines.specific_name
    from information_schema.routines routines
    where routines.specific_schema = 'public'
      and routines.routine_name = 'request_client_booking'
  )
order by parameters.specific_name, parameters.ordinal_position;

-- Registrar cliente de prueba por DNI.
select *
from public.register_client_access(
  'Juan',
  'Perez',
  '30123456',
  '11 5555 5555',
  null,
  'abc123',
  'empresa-prueba'
);

-- Login cliente por DNI.
select *
from public.verify_client_login(
  '30123456',
  'abc123',
  'empresa-prueba'
);

-- Ver cliente interno creado por DNI dentro de una empresa.
select
  accounts.id,
  accounts.company_id,
  companies.name as company_name,
  companies.slug as company_slug,
  accounts.role,
  accounts.username,
  accounts.display_name,
  accounts.email,
  accounts.client_dni,
  accounts.active,
  accounts.created_at,
  accounts.last_login_at
from public.internal_accounts accounts
join public.companies companies
  on companies.id = accounts.company_id
where companies.slug = 'empresa-prueba'
  and accounts.role = 'client'
order by accounts.created_at desc;

-- Ver clientes creados o vinculados por login con Google.
select
  accounts.id,
  accounts.company_id,
  companies.name as company_name,
  companies.slug as company_slug,
  accounts.auth_user_id,
  accounts.username,
  accounts.display_name,
  accounts.first_name,
  accounts.last_name,
  accounts.email,
  accounts.phone,
  accounts.photo_url,
  accounts.active,
  accounts.created_at,
  accounts.updated_at
from public.internal_accounts accounts
join public.companies companies
  on companies.id = accounts.company_id
where companies.slug = 'empresa-prueba'
  and accounts.role = 'client'
  and accounts.auth_user_id is not null
order by accounts.updated_at desc nulls last, accounts.created_at desc;

-- Ver reservas vinculadas a cliente interno por DNI.
select
  bookings.id,
  bookings.company_id,
  companies.slug as company_slug,
  bookings.client_account_id,
  accounts.username as client_username,
  accounts.client_dni,
  bookings.user_id,
  bookings.user_email,
  bookings.customer_name,
  bookings.service,
  services.name as service_name,
  bookings.employee_id,
  employees.name as employee_name,
  bookings.start_at,
  bookings.end_at,
  bookings.status,
  bookings.created_at
from public.bookings bookings
join public.companies companies
  on companies.id = bookings.company_id
left join public.internal_accounts accounts
  on accounts.id = bookings.client_account_id
left join public.services services
  on services.id = bookings.service
left join public.employees employees
  on employees.id = bookings.employee_id
where companies.slug = 'empresa-prueba'
  and bookings.client_account_id is not null
order by bookings.created_at desc;

-- -----------------------------------------------------------------------------
-- Borrado fisico por empresa solo de reservas ajenas a los flujos válidos.
-- Se preservan:
-- 1. Reservas hechas con Google -> bookings.user_id is not null
-- 2. Reservas hechas con cliente por DNI -> bookings.client_account_id is not null
-- Se eliminan fisicamente solo las reservas sin user_id y sin client_account_id.
-- Reemplazar 'empresa-prueba' antes de ejecutar.
-- Recomendado: correr dentro de una transaccion y revisar los select previos.
-- -----------------------------------------------------------------------------

-- 1. Revisar reservas válidas que se van a conservar en la empresa.
select
  bookings.id,
  companies.slug as company_slug,
  case
    when bookings.user_id is not null then 'google'
    when bookings.client_account_id is not null then 'dni'
    else 'otro'
  end as booking_origin,
  bookings.user_id,
  bookings.client_account_id,
  accounts.username as client_username,
  accounts.client_dni,
  bookings.user_email,
  bookings.customer_name,
  bookings.start_at,
  bookings.end_at,
  bookings.status,
  bookings.created_at
from public.bookings bookings
join public.companies companies
  on companies.id = bookings.company_id
left join public.internal_accounts accounts
  on accounts.id = bookings.client_account_id
where companies.slug = 'empresa-prueba'
  and (
    bookings.user_id is not null
    or bookings.client_account_id is not null
  )
order by bookings.created_at desc;

-- 2. Revisar reservas que SI se van a borrar fisicamente.
select
  bookings.id,
  companies.slug as company_slug,
  bookings.user_id,
  bookings.client_account_id,
  bookings.user_email,
  bookings.customer_name,
  bookings.service,
  services.name as service_name,
  bookings.employee_id,
  employees.name as employee_name,
  bookings.start_at,
  bookings.end_at,
  bookings.status,
  bookings.created_at
from public.bookings bookings
join public.companies companies
  on companies.id = bookings.company_id
left join public.services services
  on services.id = bookings.service
left join public.employees employees
  on employees.id = bookings.employee_id
where companies.slug = 'empresa-prueba'
  and bookings.user_id is null
  and bookings.client_account_id is null
order by bookings.created_at desc;

-- 3. Borrado fisico recomendado dentro de transaccion.
-- begin;

-- 3.a. Borrar solo reservas sin Google y sin DNI en la empresa.
delete from public.bookings bookings
using public.companies companies
where companies.id = bookings.company_id
  and companies.slug = 'empresa-prueba'
  and bookings.user_id is null
  and bookings.client_account_id is null;

-- commit;
-- rollback;
