-- Support pausing/reactivating services on existing databases.
-- Fixes services_set_updated_at when the legacy services table lacks updated_at.

begin;

alter table public.services
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamp without time zone not null default now();

update public.services
set active = true
where active is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at
before update on public.services
for each row execute function public.set_updated_at();

drop policy if exists "services_admin_update" on public.services;
create policy "services_admin_update"
on public.services for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant update on public.services to authenticated;

commit;
