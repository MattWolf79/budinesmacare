# Prompt de continuidad - Turnos App al 2026-07-08

Usa este prompt para continuar el trabajo de Turnos App sin perder contexto. El foco reciente fue migrar la app a una base Supabase nueva, reemplazar accesos internos basados en RLS directa por RPCs `security definer`, corregir agenda/reservas/cancelaciones por rol y dejar la app usable en responsive.

## Stack y entorno

- Frontend: React/Vite.
- Backend: Supabase PostgreSQL + Supabase Auth Google.
- Sesiones cliente Google: Supabase Auth real.
- Sesiones internas admin/empleado: login por RPC y `sessionStorage`; no son sesiones Supabase Auth.
- URL Supabase actual usada por fallback: `https://timouxhoibsjigbfrisi.supabase.co`.
- Deploy actual: Netlify manual/Drop con carpeta `dist`.
- Build: `npm.cmd run build`.
- Lint puntual: `npm.cmd exec eslint -- src/components/AgendaGrid.jsx`.

## Archivos SQL importantes

Para base nueva:

1. Ejecutar `database/000_full_schema_migration.sql`.
2. Ejecutar `database/011_internal_admin_employee_management.sql`.
3. Opcional pero seguro: ejecutar `database/012_internal_sessions_booking_cancellation_fix.sql`.

Para base existente que ya tenia un `011` viejo:

1. Ejecutar `database/012_internal_sessions_booking_cancellation_fix.sql`.
2. Si hay dudas de drift fuerte, ejecutar `database/011_internal_admin_employee_management.sql` completo y luego `012`.

`012` existe para no tener que reconstruir manualmente las ultimas correcciones. Incluye:

- `get_internal_employee_workspace(account_id_value)` con `agendaAvailability` global para agenda y `availability` propia para pantalla de disponibilidad.
- `create_internal_employee_booking(...)` para que empleado interno pueda crear turnos para clientes con cualquier empleado activo/vinculado/disponible.
- `cancel_booking(booking_id_value, account_id_value)` con permisos correctos y comparaciones `NULL-safe`.

## Reglas finales de roles

### Cliente Google

- Ingresa por Google OAuth.
- Puede solicitar turnos.
- Puede cancelar solo turnos propios futuros.
- No debe ver el nombre del empleado asignado.
- En agenda cliente, los turnos muestran la actividad/estado, no el empleado.

### Empleado interno

- Ingresa con usuario/password interno.
- Ve agenda completa, no solo su agenda propia.
- Puede crear un turno para un cliente eligiendo cualquier empleado activo que:
  - este vinculado a la actividad;
  - tenga disponibilidad para fecha/hora;
  - no tenga turno superpuesto.
- Puede cancelar solo turnos asignados a su propio `employee_id`.
- No puede cancelar turnos de otros empleados.
- Puede gestionar su disponibilidad propia en la pantalla de disponibilidad.

### Admin interno o Auth admin

- Puede administrar empleados, actividades, disponibilidades y turnos.
- Puede crear empleados y marcar `Administrador` para promoverlos.
- Puede resetear clave de empleados/admins internos a `123456`.
- Puede cancelar turnos de cualquier empleado.
- Puede asignar empleados a turnos pendientes.

## Cambios frontend relevantes

### `src/components/AgendaGrid.jsx`

- Admin interno carga datos con `get_admin_panel_data`.
- Empleado interno carga datos con `get_internal_employee_workspace`.
- Cliente sigue usando lecturas/escrituras directas bajo Supabase Auth cuando corresponde.
- Mobile muestra 3 dias paginados.
- Se corrigio seleccion tactil para que el tap abra seleccion/rango sin romper scroll.
- Cliente no recibe objeto `employee` en `BookingItem`, para no filtrar asignacion.
- Empleado interno usa datos RPC cargados (`employeeServices`, `employees`, `agendaAvailability`) en lugar de lecturas directas bloqueadas por RLS.
- Empleado interno crea turnos mediante `create_internal_employee_booking`.
- Cancelacion usa `cancel_booking`, no `delete()` directo.
- Boton cancelar para empleado aparece solo en turnos asignados a ese empleado.

### `src/components/EmployeeDashboard.jsx`

- Resumen del empleado filtra sus turnos propios.
- Agenda del empleado usa `AgendaGrid` y puede ver agenda completa.
- Disponibilidad propia debe seguir usando `availability` propia, no `agendaAvailability`.

### `src/components/AdminPanel.jsx`

- Admin interno usa RPCs para:
  - cargar panel;
  - crear/editar/eliminar empleados;
  - marcar empleados como admin;
  - resetear claves;
  - crear/editar/eliminar actividades;
  - manejar solicitudes internas.

## RPCs criticas actuales

- `is_internal_admin(account_id_value)`.
- `get_admin_panel_data(account_id_value, request_status_value)`.
- `get_internal_employee_workspace(account_id_value)`.
- `create_admin_employee(...)`.
- `update_admin_employee(...)`.
- `delete_admin_employee(employee_id_value, account_id_value)`.
- `reset_admin_employee_password(employee_id_value, account_id_value)`.
- `save_admin_service(...)`.
- `delete_admin_service(...)`.
- `save_admin_employee_availability(...)`.
- `delete_admin_employee_availability(...)`.
- `create_admin_booking(...)`.
- `create_internal_employee_booking(...)`.
- `cancel_booking(booking_id_value, account_id_value)`.
- `assign_admin_booking_employee(...)`.

## Reglas de cancelacion finales

`cancel_booking` marca `bookings.status = 'cancelled'`. No borra fisicamente la fila.

Permisos:

- Admin Auth: permitido para todos.
- Admin interno: permitido para todos si `is_internal_admin(account_id_value)`.
- Empleado interno: permitido solo si `booking.employee_id = internal_accounts.employee_id`.
- Empleado Auth: permitido si `is_employee_for(booking.employee_id)`.
- Cliente Auth: permitido si `booking.user_id = auth.uid()`.

La condicion debe ser `NULL-safe` con `coalesce(..., false)` para evitar que comparaciones con `NULL` salteen el `raise exception`.

## Reglas de reserva finales

- Admin crea turno confirmado con `create_admin_booking`.
- Empleado interno crea turno confirmado con `create_internal_employee_booking`.
- Cliente crea solicitud/turno propio sin elegir empleado visible; el admin asigna luego si aplica.
- Se valida:
  - empleado activo;
  - empleado vinculado a actividad;
  - disponibilidad exacta por fecha/hora;
  - no superposicion del empleado;
  - no superposicion del cliente/email.

## Responsive / mobile

- La agenda mobile debe mostrar 3 dias con paginado.
- Los slots deben poder tocarse por tap para crear rango.
- El tap en turno existente no debe abrir una seleccion nueva al cancelar.
- Turnos deben verse legibles en mobile.

## Validaciones antes de gastar deploy Netlify

1. Ejecutar SQL necesario en Supabase primero.
2. Probar en app local o produccion actual si el cambio fue solo SQL.
3. Solo deployar Netlify cuando el cambio requiera frontend nuevo.

Checklist funcional:

- Admin interno entra con `admin` / `123456` en base nueva y cambia clave.
- Admin crea empleado y marca admin.
- Admin crea actividad y asigna empleados.
- Admin crea disponibilidad por fecha.
- Empleado `clobo` puede reservar para cliente con empleado `nfernandez` si nfernandez esta activo/vinculado/disponible.
- `clobo` no puede cancelar turnos de `nfernandez`.
- Admin si puede cancelar turnos de `nfernandez`.
- Cliente no ve nombres de empleados.
- Mobile muestra agenda de 3 dias y permite seleccionar turno.

## Prompt corto para retomar

Continuar Turnos App. Ya se migraron sesiones internas a RPCs `security definer` porque admin/empleado interno usan `sessionStorage` y no Supabase Auth. La base debe aplicar `000`, `011` y, para bases existentes con 011 viejo, `012_internal_sessions_booking_cancellation_fix.sql`. Reglas finales: admin cancela todos; empleado cancela solo sus turnos; cliente solo propios; empleado interno puede reservar para cliente con otro empleado disponible pero no cancelar turnos ajenos; cliente no ve nombre de empleado. Frontend clave: `AgendaGrid.jsx` usa RPCs para admin/empleado interno, mobile 3 dias, cancelacion por `cancel_booking`. Validar antes de gastar deploy Netlify.
