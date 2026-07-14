# Nuevo proyecto Supabase

Usar este flujo cuando se crea un Supabase nuevo para reemplazar el proyecto anterior.

## 1. Crear el proyecto

1. Entrar a Supabase con la cuenta correcta.
2. Crear un proyecto nuevo.
3. Esperar a que termine el provisioning.

## 2. Ejecutar migraciones

En SQL Editor, ejecutar en este orden:

1. `database/000_full_schema_migration.sql`
2. `database/011_internal_admin_employee_management.sql`
3. `database/012_internal_sessions_booking_cancellation_fix.sql` si la base ya tenia un `011` anterior o si se quiere reforzar explicitamente las ultimas correcciones.

La migracion `000` crea la estructura completa actual hasta solicitudes pendientes sin empleado asignado. La migracion `011` agrega la cuenta admin interna inicial y las RPCs para que admins internos administren empleados, servicios, disponibilidad, turnos y otros administradores. La migracion `012` es un parche idempotente para bases existentes que corrige la agenda de empleados internos, la creacion de turnos desde empleado para otros empleados disponibles y la cancelacion segura por perfil.

Para una base nueva creada desde estos archivos actuales, `000` + `011` deja el schema completo. Ejecutar `012` despues no rompe nada y sirve como red de seguridad.

## 3. Obtener credenciales publicas

En Supabase:

1. Ir a Project Settings.
2. Entrar en API.
3. Copiar:
   - Project URL
   - anon/public/publishable key

## 4. Configurar Netlify

En Netlify, dentro del sitio:

1. Ir a Project configuration.
2. Entrar en Environment variables.
3. Crear:

```text
VITE_SUPABASE_URL=https://tu-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=tu_publishable_o_anon_key
```

4. Hacer un nuevo deploy.

## 5. Primer ingreso admin

Despues del deploy, entrar en la app con:

```text
Perfil: Administrador
Usuario: admin
Contraseña: 123456
```

La app va a pedir cambiar la contraseña inicial.

## 6. Datos iniciales

Desde el panel admin, cargar:

1. Servicios.
2. Empleados.
3. Marcar `Administrador` en empleados que tambien deban administrar.
4. Disponibilidad por empleado.

## 7. Validaciones finales obligatorias

Antes de dar por terminada la migracion, probar:

1. Admin interno `admin` / `123456`: login y cambio de clave inicial.
2. Admin: crear/editar empleados, marcar un empleado como admin y resetear clave.
3. Admin: crear/editar servicios y asignarlos a empleados.
4. Admin: cargar disponibilidad por fecha para al menos dos empleados.
5. Empleado interno: ver agenda completa y reservar un turno para un cliente con otro empleado disponible.
6. Empleado interno: cancelar solo turnos asignados a su propio empleado.
7. Admin: cancelar turnos de cualquier empleado.
8. Cliente Google: solicitar turno sin ver el nombre del empleado asignado.
9. Mobile: agenda de 3 dias paginada, turnos visibles y seleccion de rango por tap.
