-- Update email sender and visible email copy from Actividades to Servicios.
-- Run after 035_booking_email_links_and_reminders.sql on existing databases.

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
    to_regprocedure('public.send_resend_email(text,text,text,text,text)'),
    to_regprocedure('public.format_booking_notification_message(public.bookings,text)'),
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
    updated_sql := replace(updated_sql, 'Actividad:', 'Servicio:');
    updated_sql := replace(updated_sql, '>Actividad</td>', '>Servicio</td>');
    updated_sql := replace(updated_sql, 'Solo un administrador puede guardar actividades.', 'Solo un administrador puede guardar servicios.');
    updated_sql := replace(updated_sql, 'Ingresá el nombre de la actividad.', 'Ingresá el nombre del servicio.');
    updated_sql := replace(updated_sql, 'Ingresa el nombre de la actividad.', 'Ingresa el nombre del servicio.');
    updated_sql := replace(updated_sql, 'La duración de la actividad debe ser mayor a cero.', 'La duración del servicio debe ser mayor a cero.');
    updated_sql := replace(updated_sql, 'La duracion de la actividad debe ser mayor a cero.', 'La duracion del servicio debe ser mayor a cero.');
    updated_sql := replace(updated_sql, 'La actividad no existe.', 'El servicio no existe.');
    updated_sql := replace(updated_sql, 'Solo un administrador puede eliminar actividades.', 'Solo un administrador puede eliminar servicios.');
    updated_sql := replace(updated_sql, 'No se puede eliminar una actividad con turnos cargados. Podés desactivarla para que no se ofrezca más.', 'No se puede eliminar un servicio con turnos cargados. Podés desactivarlo para que no se ofrezca más.');
    updated_sql := replace(updated_sql, 'El empleado no esta vinculado a esa actividad.', 'El empleado no esta vinculado a ese servicio.');
    updated_sql := replace(updated_sql, 'El empleado no está vinculado a esa actividad.', 'El empleado no está vinculado a ese servicio.');
    updated_sql := replace(updated_sql, 'Seleccioná una actividad o promoción.', 'Seleccioná un servicio o promoción.');
    updated_sql := replace(updated_sql, 'La actividad seleccionada no está disponible.', 'El servicio seleccionado no está disponible.');
    updated_sql := replace(updated_sql, '''Actividad''', '''Servicio''');

    if updated_sql is distinct from original_sql then
      execute updated_sql;
    end if;
  end loop;
end;
$$;

commit;
