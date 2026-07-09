-- Additional hardening for internal session helpers.
-- Run after 013_harden_internal_sessions.sql on existing databases.

begin;

-- Helper functions must only be callable from trusted security-definer RPCs.
-- PostgreSQL grants EXECUTE on functions to PUBLIC by default, so revoke it explicitly.
revoke execute on function public.create_internal_session(uuid) from public, anon, authenticated;
revoke execute on function public.validate_internal_session(uuid, text, public.app_role) from public, anon, authenticated;

-- Keep the session table closed even if future grants are changed accidentally.
alter table public.internal_sessions enable row level security;

drop policy if exists "internal_sessions_no_direct_select" on public.internal_sessions;
drop policy if exists "internal_sessions_no_direct_insert" on public.internal_sessions;
drop policy if exists "internal_sessions_no_direct_update" on public.internal_sessions;
drop policy if exists "internal_sessions_no_direct_delete" on public.internal_sessions;

create policy "internal_sessions_no_direct_select"
  on public.internal_sessions
  for select
  using (false);

create policy "internal_sessions_no_direct_insert"
  on public.internal_sessions
  for insert
  with check (false);

create policy "internal_sessions_no_direct_update"
  on public.internal_sessions
  for update
  using (false)
  with check (false);

create policy "internal_sessions_no_direct_delete"
  on public.internal_sessions
  for delete
  using (false);

commit;
