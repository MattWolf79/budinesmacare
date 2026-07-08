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

La migracion `000` crea la estructura completa actual hasta solicitudes pendientes sin empleado asignado. La migracion `011` agrega la cuenta admin interna inicial y las RPCs para que admins internos administren empleados y otros administradores.

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

1. Actividades.
2. Empleados.
3. Marcar `Administrador` en empleados que tambien deban administrar.
4. Disponibilidad por empleado.
