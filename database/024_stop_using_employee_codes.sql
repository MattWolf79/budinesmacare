drop index if exists public.employees_code_uidx;

update public.employees
set code = null
where code is not null;