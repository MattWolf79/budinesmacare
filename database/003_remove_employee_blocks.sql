-- Remove obsolete employee daily blocks from Turnos App.
-- Availability is now modeled only through public.employee_availability.

begin;

-- Drop internal block RPCs first so the table can be removed cleanly.
drop function if exists public.list_internal_employee_blocks(uuid);
drop function if exists public.create_internal_employee_block(uuid, timestamp without time zone, timestamp without time zone, text);
drop function if exists public.update_internal_employee_block(uuid, uuid, timestamp without time zone, timestamp without time zone, text);
drop function if exists public.update_internal_employee_block(uuid, text, timestamp without time zone, timestamp without time zone, text);
drop function if exists public.delete_internal_employee_block(uuid, uuid);
drop function if exists public.delete_internal_employee_block(uuid, text);

-- This removes old policies, triggers, indexes and constraints owned by the table.
drop table if exists public.employee_blocks cascade;

commit;
