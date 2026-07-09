-- Remove older internal booking RPC overloads that make PostgREST function resolution ambiguous.
-- Run after 020_internal_promotional_bookings.sql on existing databases.

begin;

drop function if exists public.create_admin_booking(
  bigint,
  uuid,
  timestamp without time zone,
  timestamp without time zone,
  text,
  text,
  uuid,
  text
);

drop function if exists public.create_internal_employee_booking(
  bigint,
  uuid,
  timestamp without time zone,
  timestamp without time zone,
  text,
  text,
  uuid,
  text
);

commit;
