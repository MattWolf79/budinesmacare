-- Budines Macare: mail delivery configuration for the shared Supabase project.
-- Prerequisite: verify budinesmacare.com.ar in Resend before setting from_email.

begin;

update public.mail_settings
set
  from_email = 'pedidos@budinesmacare.com.ar',
  from_name = 'Budines Macaré - Pedidos',
  app_url = 'https://www.budinesmacare.com.ar',
  active = true,
  updated_at = now()
where company_id = (
  select id
  from public.companies
  where slug = 'budinesmacare'
  limit 1
);

commit;

-- Verification: run after the update. Do not expose resend_api_key.
select
  companies.slug,
  settings.from_email,
  settings.from_name,
  settings.app_url,
  settings.active,
  settings.resend_api_key is not null as resend_is_configured
from public.companies companies
left join public.mail_settings settings on settings.company_id = companies.id
where companies.slug = 'budinesmacare';
