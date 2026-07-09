-- Optional booking description, used when a client reserves from a promotion.
-- Run after 015_app_configuration.sql on existing databases.

begin;

alter table public.bookings
  add column if not exists booking_description text;

commit;
