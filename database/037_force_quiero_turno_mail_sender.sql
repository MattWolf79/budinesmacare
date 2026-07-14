-- Force existing email functions/settings to use Quiero Turno App as sender/brand.
-- Run once after 035_booking_email_links_and_reminders.sql.

begin;

update public.mail_settings
set from_name = 'Quiero Turno App - No responder',
    updated_at = now()
where id = true;

do $$
declare
  function_identity regprocedure;
  original_sql text;
  updated_sql text;
begin
  foreach function_identity in array array[
    to_regprocedure('public.send_resend_email(text,text,text,text,text,text)'),
    to_regprocedure('public.send_resend_email(text,text,text,text,text)'),
    to_regprocedure('public.notify_admin_emails(text,text,text)'),
    to_regprocedure('public.format_booking_notification_html(public.bookings,text,text,text)'),
    to_regprocedure('public.send_booking_email_notifications()'),
    to_regprocedure('public.send_due_booking_reminders()')
  ]
  loop
    if function_identity is null then
      continue;
    end if;

    original_sql := pg_get_functiondef(function_identity);
    updated_sql := replace(original_sql, 'Turnos App - No responder', 'Quiero Turno App - No responder');
    updated_sql := replace(updated_sql, '''Turnos App''', '''Quiero Turno App''');
    updated_sql := replace(updated_sql, '>Turnos App<', '>Quiero Turno App<');

    if updated_sql is distinct from original_sql then
      execute updated_sql;
    end if;
  end loop;
end;
$$;

commit;

select from_name
from public.mail_settings
where id = true;
