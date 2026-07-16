-- Consultas utiles para soporte y diagnostico.
-- Editar el slug 'empresa-prueba' por la empresa que quieras revisar.

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
