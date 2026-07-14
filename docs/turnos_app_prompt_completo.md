# Prompt completo - Turnos App

Usa este prompt para continuar, recrear o explicar la aplicacion Turnos App en otra conversacion o con otro asistente.

## Contexto general

Turnos App es una aplicacion web React/Vite conectada a Supabase para gestionar reservas de turnos entre clientes, empleados y administradores. La app esta pensada para negocios que ofrecen servicios por empleado, con agenda semanal, seleccion por rango horario, colores por servicio, disponibilidad por fecha y control de accesos por rol.

La aplicacion debe mantener semantica horaria local. Los turnos se guardan como `timestamp without time zone` en formato local `YYYY-MM-DD HH:mm:ss`. No se debe usar `toISOString()` para persistir horarios de agenda porque introduce drift UTC.

## Stack tecnico

- Frontend: React 19 con Vite.
- UI: CSS global en `src/index.css`, algunos contenedores MUI en dashboard admin.
- Backend/BBDD: Supabase PostgreSQL.
- Auth clientes/admin Google: Supabase Auth OAuth Google.
- Auth interno empleados/admin: RPCs de Supabase + `sessionStorage` del navegador.
- Cliente Supabase: `src/api/supabaseClient.js`.
- Validacion local: `npm.cmd run lint; npm.cmd run build` en Windows.

## Roles de acceso

### Cliente

- Ingresa con Google OAuth.
- Su perfil se crea automaticamente en `profiles` con rol `client` por trigger sobre `auth.users`.
- Puede ver sus proximos turnos.
- Puede reservar turnos en la agenda.
- Puede cancelar turnos propios futuros.
- La app muestra una leyenda de colores de servicios.

### Empleado

- Ingresa con nombre y contrasena internos.
- Puede registrarse internamente; la solicitud queda pendiente hasta aprobacion admin.
- Tiene workspace con navegacion: `Resumen`, `Agenda`, `Disponibilidad`.
- Ve sus turnos asignados.
- Puede gestionar su agenda desde la grilla, limitado a su empleado vinculado.
- Puede definir sus dias y horarios semanales disponibles para atender.

### Administrador

- Recomendado operativo: usuario Supabase Auth con perfil `admin` en `profiles`.
- Ve panel completo con navbar: agenda, empleados, servicios y disponibilidad.
- Puede crear, editar, activar/desactivar y eliminar empleados si no tienen turnos.
- Puede crear, editar, activar/desactivar y eliminar servicios si no tienen turnos.
- Puede vincular empleados con servicios mediante `employee_services`.
- Puede configurar la disponibilidad por fecha o rango de fechas corridas de cada empleado, por ejemplo del 2026-07-06 al 2026-07-10 de 08:00-12:00 y 14:00-18:00.
- Puede aprobar o rechazar solicitudes internas de empleados/admin.

Nota importante: las sesiones internas actuales no son sesiones reales de Supabase Auth. Las policies basadas en `auth.uid()` protegen escrituras directas de tablas. Para administracion directa, lo mas consistente es usar un admin Google/Supabase Auth o migrar las acciones internas admin a RPCs `security definer`.

## Flujo de autenticacion

### Google / Supabase Auth

1. El usuario elige acceso cliente o Google.
2. `Login.jsx` llama `supabase.auth.signInWithOAuth({ provider: 'google' })`.
3. Supabase crea o recupera el usuario en `auth.users`.
4. El trigger `handle_new_auth_user()` crea/actualiza `profiles`.
5. `App.jsx` carga el perfil con `profiles.role`, `display_name`, `email`, `employee_id` y `active`.
6. Segun rol, la app habilita `client`, `employee` o `admin`.

### Acceso interno

1. Empleado/admin abre modal interno desde `Login.jsx`.
2. Para registrarse llama RPC `request_internal_registration`.
3. La solicitud se guarda en `internal_registration_requests` con password hasheada mediante `extensions.crypt`.
4. Un admin autenticado aprueba con `approve_internal_registration` o rechaza con `reject_internal_registration`.
5. Para ingresar llama `verify_internal_login`.
6. Si es valido, `App.jsx` guarda en `sessionStorage` una sesion interna con `id`, `role`, `displayName`, `employeeId`.

## Modelo de datos principal

### `employees`

Empleados que atienden turnos.

Campos principales:
- `id uuid`
- `name text`
- `code text`
- `active boolean`
- `created_at`, `updated_at`

### `services`

Servicios configurables por el admin.

Campos principales:
- `id bigint`
- `name text`
- `icon text`: emoji para representar el servicio.
- `color text`: color usado en la agenda y referencias visuales.
- `default_duration integer`
- `active boolean`
- `name_normalized text`: usado para evitar duplicados por mayusculas/acentos/espacios.

### `employee_services`

Relacion N a N entre empleados y servicios que atienden.

Campos:
- `employee_id uuid`
- `service_id bigint`

### `bookings`

Reservas/turnos.

Campos principales:
- `id uuid`
- `user_id uuid`: usuario Supabase Auth del cliente; puede ser null cuando reserva admin/empleado para un tercero.
- `user_email text`: email del cliente real del turno.
- `customer_name text`: nombre del cliente real del turno.
- `service bigint`
- `employee_id uuid`
- `start_at timestamp without time zone`
- `end_at timestamp without time zone`
- `status text`: `reserved`, `confirmed`, `cancelled`.
- `created_at`, `updated_at`

### `employee_availability`

Disponibilidad positiva por fecha de empleados. Define en que fechas y rangos horarios un empleado puede recibir reservas.

Campos principales:
- `id uuid`
- `employee_id uuid`
- `available_date date`: fecha concreta disponible.
- `weekday smallint`: `0` domingo, `1` lunes, ..., `6` sabado.
- `start_time time without time zone`
- `end_time time without time zone`
- `active boolean`
- `created_at`, `updated_at`

Reglas:
- `employee_availability_valid_range_chk`: la hora fin debe ser posterior a la hora inicio.
- `employee_availability_no_overlap_excl`: evita rangos activos superpuestos para el mismo empleado y fecha.

### `profiles`

Perfiles vinculados a Supabase Auth.

Campos principales:
- `id uuid`
- `user_id uuid`
- `role app_role`: `admin`, `client`, `employee`.
- `display_name text`
- `email text`
- `employee_id uuid`
- `active boolean`

### `internal_accounts`

Cuentas internas para empleados/admin.

Campos principales:
- `id uuid`
- `role app_role`
- `display_name text`
- `username_normalized text`
- `password_hash text`
- `employee_id uuid`
- `active boolean`
- `last_login_at`, `created_at`, `updated_at`

### `internal_registration_requests`

Solicitudes internas pendientes de aprobacion.

Campos principales:
- `id uuid`
- `role app_role`
- `display_name text`
- `username_normalized text`
- `password_hash text`
- `employee_id uuid`
- `status text`: `pending`, `approved`, `rejected`.
- `reviewed_by`, `reviewed_at`, `created_at`

## Reglas de agenda

- La agenda muestra 7 dias en escritorio, 5 dias en tablet y 3 dias en celular.
- Hora inicial: 08:00.
- Slots: 30 minutos.
- Cantidad de slots: 30.
- Se puede navegar hacia dias futuros con flechas. El salto depende de la cantidad visible: 7, 5 o 3 dias.
- No se puede volver antes del dia actual.
- No se pueden seleccionar dias pasados.
- El usuario selecciona un rango arrastrando con mouse o touch sobre los cuadros horarios. La grilla usa eventos `pointer` para soportar celular.
- Al terminar seleccion:
  1. Se abre modal de servicio.
  2. Se abre modal de empleado disponible para ese servicio y para ese rango segun `employee_availability`.
  3. Si agenda cliente, se reserva directamente para el usuario autenticado.
  4. Si agenda admin/empleado, se abre modal para ingresar nombre y email del cliente real.
- En celular la grilla es compacta: celdas mas bajas, columna horaria mas angosta y turnos reducidos.
- En la grilla movil cada turno muestra solo el empleado dentro del color de la reserva; no muestra horario porque ya esta al costado.
- En la grilla movil el boton de cancelar turno permanece visible, con area tactil propia, y corta `pointerDown` para no disparar una nueva seleccion de turno.

## Reglas de conflictos

La app valida conflictos en frontend y la base los refuerza con exclusion constraints.

- Un empleado no puede tener dos turnos activos superpuestos.
- Un empleado no puede recibir turnos dentro de un bloqueo superpuesto.
- Un empleado solo puede recibir turnos dentro de un rango de `employee_availability` que cubra completamente la seleccion para esa fecha.
- Un cliente/persona no puede tener dos turnos activos superpuestos, aunque sean con empleados o servicios distintos.
- Para clientes autenticados se valida por `user_id`.
- Para reservas creadas por admin/empleado se valida por `user_email` normalizado.
- Los estados activos son `confirmed` y `reserved`.
- `cancelled` no bloquea nuevos turnos.

Constraints importantes:
- `bookings_employee_no_active_overlap_excl`
- `bookings_user_no_active_overlap_excl`
- `bookings_customer_email_no_active_overlap_excl`
- `employee_availability_no_overlap_excl`

## Manejo de fechas y UTC

Regla central: toda fecha de agenda se crea y persiste como hora local.

Implementacion:
- Se construyen objetos `Date` locales con `new Date(year, month, day, hour, minute, 0, 0)`.
- Se persiste con helper tipo:

```js
const formatDateForDb = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};
```

No usar `toISOString()` para `start_at` o `end_at`.

## Componentes principales

### `App.jsx`

- Carga sesion Supabase Auth.
- Carga sesion interna desde `sessionStorage`.
- Carga perfil desde `profiles`.
- Decide si renderizar `Login`, selector de rol, workspace cliente/empleado o dashboard admin.

### `Login.jsx`

- Muestra accesos: Clientes, Empleados, Administrador.
- Clientes usan Google OAuth.
- Empleados/admin usan modal interno con tabs `Ingresar` y `Registrarse`.
- Tiene toggles de visibilidad para contrasenas.
- Llama RPCs `request_internal_registration` y `verify_internal_login`.

### `RoleAccess.jsx`

- Shell por rol.
- Cliente: muestra hero, leyenda de colores y `ClientDashboard`.
- Empleado: muestra navbar con `Resumen`, `Agenda`, `Disponibilidad` y `EmployeeDashboard`.
- Admin: si se pasa `children`, renderiza `Dashboard`.

### `ClientDashboard.jsx`

- Muestra `Proximos turnos` del cliente autenticado.
- Renderiza tarjetas con icono/emoji de servicio, empleado, fecha y horario.
- En celular, `Proximos turnos` se reduce a servicio + horario para ocupar menos alto/ancho.
- Incluye `AgendaGrid` para reservar.

### `AgendaGrid.jsx`

- Grilla semanal reutilizable para cliente, empleado y admin.
- Adapta cantidad de dias visibles con `getVisibleDayCount()`: 7 escritorio, 5 tablet, 3 celular.
- Carga bookings, services, employees y employee_availability.
- Permite seleccion por arrastre con mouse y touch mediante eventos `pointer`.
- Calcula alturas dinamicas por cantidad de reservas en fila.
- En celular usa una grilla compacta con menor alto de celda, menor columna de hora y menor altura por turno.
- Valida disponibilidad por fecha, conflictos de empleado y cliente.
- Reserva con payload local:
  - Cliente: `user_id = user.id`, `user_email = user.email`.
  - Staff/admin: `user_id = null`, `customer_name` y `user_email` ingresados en modal.

### `BookingItem.jsx`

- Renderiza cada reserva dentro de la grilla.
- En escritorio muestra icono de servicio, empleado, boton de cancelar y popover de detalle al hover.
- En celular usa `.agenda-booking-mobile-label` para mostrar solo empleado dentro del bloque de color.
- En celular mantiene visible `.agenda-booking-cancel` como boton tactil compacto.
- El contenedor del turno y el boton cancelar frenan `onPointerDown` para que tocar cancelar no inicie seleccion de un turno nuevo.

### `AdminPanel.jsx`

- ABM empleados.
- ABM servicios.
- Gestion de disponibilidad por fecha de empleados desde vista `Disponibilidad`.
- Aprobacion/rechazo de solicitudes internas.
- Verifica que Supabase realmente haya aplicado inserts/updates para detectar problemas de RLS.

### `EmployeeDashboard.jsx`

- Resumen de turnos de hoy, proximos y disponibilidad.
- Agenda asignada.
- Gestion de agenda propia.
- Panel de disponibilidad por fecha propia.

### `EmployeeAvailabilityPanel.jsx`

- Permite al admin o empleado definir disponibilidad por fecha o por rango de fechas corridas.
- Soporta fraccionar cada dia seleccionado en dos rangos, por ejemplo manana y tarde.
- Agrupa la disponibilidad por fecha en una tabla compacta.
- Si el empleado tiene sesion interna usa RPCs:
  - `list_internal_employee_availability`
  - `create_internal_employee_availability`
  - `update_internal_employee_availability`
  - `delete_internal_employee_availability`

### `ActivityIcon.jsx`

- Usa `service.icon` como emoji si existe.
- Si no hay emoji, usa SVG fallback segun nombre de servicio.
- Variantes:
  - `agenda`: icono pequeno dentro de la grilla.
  - `summary`: icono grande en `Proximos turnos`.

## UI y estilo actual

- Estilo principal en `src/index.css`.
- Agenda con encabezado semanal y botones de navegacion.
- Tarjetas de proximos turnos compactas; en celular se muestran como lista vertical con solo servicio y horario.
- Iconos por servicio con fondo del color del servicio.
- En `Proximos turnos`, el glyph del emoji se centra absoluto y se agranda sin modificar el recuadro.
- La grilla de agenda conserva iconos pequenos para no romper densidad visual.
- En celular, la grilla no muestra iconos de servicio dentro del turno; muestra solo empleado y boton cancelar.
- El navbar movil esta compactado: menos padding, subtitulo oculto, badge de perfil oculto y acciones reducidas.
- Los modales en celular funcionan como panel inferior con ancho completo y scroll interno.
- La app es responsive por breakpoint:
  - Escritorio: 7 dias de agenda, tarjetas completas, navbar completo.
  - Tablet: 5 dias de agenda y layouts apilados.
  - Celular: 3 dias de agenda, celdas compactas, turnos compactos, navbar reducido.
- El cancelador movil debe ser facil de tocar y no debe sobresalir del bloque de color.
- No usar landing page: la primera pantalla es el login operativo.

## Seguridad y RLS

- RLS habilitado en tablas publicas principales.
- Lecturas amplias de agenda para usuarios autenticados, porque la grilla necesita disponibilidad general.
- Escrituras directas restringidas por admin, empleado autenticado vinculado o cliente propietario.
- Cuentas internas no tienen acceso directo a tablas `internal_accounts` ni `internal_registration_requests`.
- Passwords internos se guardan con hash `extensions.crypt` y `extensions.gen_salt('bf')`.
- Para produccion, si se quiere que admin interno opere todo sin Supabase Auth, conviene crear RPCs `security definer` para ABM y reservas administrativas, o convertir el admin a usuario Supabase Auth con perfil `admin`.

## Bootstrap recomendado en una base nueva

1. Ejecutar el SQL completo de migracion en Supabase SQL Editor: `database/000_full_schema_migration.sql`.
2. Configurar Google OAuth en Supabase Auth.
3. Ingresar una vez con la cuenta Google administradora.
4. Promover ese perfil:

```sql
update public.profiles
set role = 'admin', updated_at = now()
where email = 'tu-email@gmail.com';
```

5. Desde la app, crear servicios, empleados y asignaciones.
6. Aprobar solicitudes internas si se van a usar empleados internos.

Para bases existentes que ya tenian disponibilidad por fecha, ejecutar tambien `database/005_internal_user_profiles.sql` para habilitar usuario unico, datos personales y foto de perfil en accesos internos.

El archivo `database/001_profiles_internal_access.sql` conserva la evolucion incremental usada durante el desarrollo, pero para migrar a una base nueva desde cero conviene usar `database/000_full_schema_migration.sql`.

Para una guia de migracion detallada, con checklist, tablas, constraints, policies, RPCs, grants, validaciones y pruebas post-migracion, usar `docs/database_migration_prompt.md`.

## Comandos utiles

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run lint
npm.cmd run build
```

## Requisitos clave a preservar

- No romper la semantica local de fechas.
- No permitir doble reserva del mismo empleado.
- No permitir doble reserva de la misma persona.
- Permitir turnos superpuestos de empleados distintos si son clientes/personas distintas.
- Permitir que admin/empleado reserven para terceros ingresando nombre y email del cliente real.
- Mantener ABM de empleados, servicios y disponibilidad.
- Mantener aprobacion de registros internos.
- Mantener leyenda de colores de servicios.
- Mantener la grilla densa y legible.
- Mantener responsive real para celulares: agenda de 3 dias, celdas compactas, navbar chico, proximos turnos reducidos.
- En celular, dentro de la grilla mostrar color + empleado + boton cancelar; no mostrar horario ni icono de servicio.
- El boton cancelar movil no debe disparar seleccion de turno nuevo; debe detener `pointerDown` y `click`.
