# Plan para convertir Turnos App en producto multiempresa

Este documento deja el paso a paso para ejecutar despues de resolver el dominio `quieroturnoapp.com.ar`.

## Objetivo

La app no debe quedar abierta para que cualquier persona con la URL pueda entrar con Google y usar `quieroturnoapp` directamente. El acceso debe depender de una empresa registrada, por ejemplo `Estetica Top Body`, y cada empresa debe tener sus propios clientes, empleados, administradores, servicios, disponibilidad, reservas y configuracion visual.

## Estado actual que hay que cambiar

- El login de cliente usa Google OAuth.
- Cuando un usuario entra con Google, la funcion `public.handle_new_auth_user()` crea o actualiza automaticamente un registro en `public.profiles` con rol `client`.
- Si el usuario no tiene perfil interno, el frontend lo trata como cliente y le permite usar la app.
- La configuracion de la app vive en tablas singleton como `public.app_configuration` y `public.mail_settings`.
- Muchas tablas todavia representan una sola empresa global: `employees`, `services`, `employee_services`, `employee_availability`, `bookings`, `profiles`, `internal_accounts`, `internal_registration_requests`.

## Decision de producto recomendada

Usar un modelo multiempresa por `tenant`.

- Empresa: entidad que contrata el producto.
- Tenant: espacio aislado de datos para una empresa.
- Slug: identificador publico de la empresa, por ejemplo `estetica-top-body`.
- URL recomendada por empresa: `https://quieroturnoapp.com.ar/estetica-top-body`.
- Alternativa futura: subdominio por empresa, por ejemplo `https://estetica-top-body.quieroturnoapp.com.ar`.

Para la primera version conviene usar rutas por slug porque evita configurar DNS por cada empresa.

## Etapa 2 - Corte local en curso

- `039_multi_tenant_client_context.sql` crea el contexto publico por empresa y hace tenant-aware la configuracion, opciones de reserva y solicitud de turnos de cliente.
- `040_multi_tenant_internal_access.sql` bloquea el fallback backend a `esteticatopbody`, ata login/registro/cambio de contraseña internos al slug de la URL y agrega RPCs usadas por admin/empleado con `company_slug_value`.
- `041_platform_admin.sql` crea el acceso plataforma `Admin/Admin`, separado de las empresas, y habilita la URL reservada `/plataforma` para crear empresas, crear el administrador inicial y blanquear passwords de administradores.
- La raiz `https://quieroturnoapp.com.ar` ya no debe abrir una agenda. El acceso esperado es `https://quieroturnoapp.com.ar/jardinmasaje`, `https://quieroturnoapp.com.ar/sanatoriorivadavia`, etc.
- El slug se normaliza en minusculas. Para `https://quieroturnoapp.com.ar/SanatorioRivadavia`, la empresa debe existir como `sanatoriorivadavia` en `public.companies.slug`.

## Paso 1 - Crear tablas base de empresas

Crear una migracion nueva, por ejemplo `database/034_multi_tenant_foundation.sql`.

Tablas nuevas:

```sql
public.companies
```

Campos sugeridos:

- `id uuid primary key`
- `name text not null`, ejemplo `Estetica Top Body`
- `slug text unique not null`, ejemplo `estetica-top-body`
- `status text not null default 'pending'`
- `owner_email text`
- `contact_email text`
- `contact_phone text`
- `created_at`
- `updated_at`

Estados sugeridos:

- `pending`: empresa creada pero no habilitada.
- `active`: empresa habilitada y usable.
- `suspended`: empresa pausada por administracion/plataforma.
- `cancelled`: empresa dada de baja.

Tambien crear:

```sql
public.company_memberships
```

Campos sugeridos:

- `id uuid primary key`
- `company_id uuid references public.companies(id)`
- `user_id uuid references auth.users(id)` nullable para usuarios invitados aun no registrados.
- `email text not null`
- `role public.app_role not null`
- `employee_id uuid references public.employees(id)` nullable.
- `status text not null default 'invited'`
- `created_at`
- `updated_at`

Estados sugeridos:

- `invited`: usuario autorizado, pero todavia no ingreso.
- `active`: usuario ya vinculado y habilitado.
- `disabled`: usuario bloqueado para esa empresa.

## Paso 2 - Agregar `company_id` a las tablas operativas

Agregar `company_id` a las tablas que hoy son globales:

- `profiles`
- `employees`
- `services`
- `employee_services`
- `employee_availability`
- `bookings`
- `internal_accounts`
- `internal_registration_requests`
- `app_configuration`
- `mail_settings`, si cada empresa va a tener remitente propio en el futuro

Regla: toda consulta operativa debe filtrar por `company_id`.

Para datos existentes, crear una empresa inicial, por ejemplo:

```txt
Nombre: Empresa inicial
Slug: empresa-inicial
```

Luego backfillear todos los registros actuales con ese `company_id`.

## Paso 3 - Cambiar el alta automatica de Google

Modificar `public.handle_new_auth_user()`.

Comportamiento actual:

- Crea `profiles` automaticamente como `client`.

Comportamiento nuevo:

- No habilitar al usuario globalmente solo por entrar con Google.
- Buscar si el email del usuario existe en `company_memberships` con estado `invited` o `active`.
- Si existe membresia, vincular `user_id`, activar membresia y crear/actualizar `profiles` con `company_id` y rol correspondiente.
- Si no existe membresia, crear un perfil bloqueado o no crear perfil usable.

Resultado esperado:

- Un usuario con Google pero sin empresa autorizada no entra a ninguna agenda.
- El frontend debe mostrar una pantalla tipo: `Tu mail no tiene acceso a ninguna empresa. Pedile al administrador que te invite.`

## Paso 4 - Resolver el tenant desde la URL

Agregar una funcion RPC publica:

```sql
public.get_company_public_context(slug_value text)
```

Debe devolver solo datos publicos:

- `company_id`
- `name`
- `slug`
- `status`
- configuracion visual publica

Debe rechazar empresas que no esten `active`.

Frontend:

- Leer el slug desde la URL: `/estetica-top-body`.
- Cargar contexto de empresa antes de mostrar login.
- Si el slug no existe o no esta activo, mostrar una pantalla de empresa no disponible.
- Guardar el `companyId`/`slug` activo en memoria mientras dure la sesion.

## Paso 5 - Cambiar el login inicial

Modificar `Login.jsx` para que no sea una puerta global.

Nuevo flujo:

1. Usuario entra a `https://quieroturnoapp.com.ar/estetica-top-body`.
2. La app carga la empresa `Estetica Top Body`.
3. Login muestra la marca/nombre de esa empresa.
4. Cliente puede ingresar con Google solo para esa empresa.
5. Despues del OAuth, la app valida que el usuario tenga membresia o invitacion en esa empresa.
6. Si no esta autorizado, se cierra la sesion o se muestra acceso denegado.

No permitir usar `https://quieroturnoapp.com.ar/` como agenda directa sin empresa.

## Paso 6 - Crear flujo de alta de empresas

Crear una pantalla o flujo interno para registrar empresas que compran el producto.

Decision recomendada:

- No crear un `ADMIN/ADMIN` fijo para cada empresa.
- Crear un unico acceso de plataforma, separado de las empresas, para administrar el producto.
- Ese acceso de plataforma crea empresas nuevas sin tocar codigo.
- Al crear una empresa, tambien crea el primer administrador real de esa empresa con datos comunes: nombre, apellido, mail, telefono y clave inicial.
- La URL de la empresa se genera automaticamente desde el slug.

Ejemplos:

```txt
https://www.quieroturnoapp.com.ar/esteticatopbody
https://www.quieroturnoapp.com.ar/clinicarivadavia
```

Flujo recomendado:

1. El administrador de plataforma entra a un panel privado.
2. Carga nombre de empresa, por ejemplo `Estetica Top Body`.
3. El sistema genera o permite editar el slug `esteticatopbody`.
4. El sistema muestra la URL final `https://www.quieroturnoapp.com.ar/esteticatopbody`.
5. El administrador de plataforma carga el primer administrador real de esa empresa.
6. El sistema crea:
	- fila en `companies`.
	- fila de configuracion inicial de empresa.
	- cuenta interna admin para la persona real.
	- membresia activa de ese admin en `company_memberships`.
7. El primer admin de empresa entra con su usuario y clave inicial.
8. En el primer ingreso se le exige cambiar la clave.
9. Ese admin ya puede crear empleados, servicios, horarios, promociones y otros administradores.

Esta decision evita tener que escribir codigo o SQL especial cada vez que una empresa compra el producto.

Usuario de plataforma:

- Debe vivir fuera de `company_memberships` o con una tabla separada, por ejemplo `platform_admins`.
- No representa una empresa cliente.
- No puede tomar turnos.
- No aparece como empleado.
- Solo administra altas, bajas, suspensiones y configuracion global del producto.

Primer administrador real de empresa:

- Tiene datos reales.
- Tiene `role = 'admin'` dentro de esa empresa.
- Puede o no tener `employee_id` asociado.
- Si tambien atiende turnos, se crea como empleado y queda asociado.
- Si solo administra, no aparece como empleado ni como opcion atendible.

Mas adelante:

- Formulario publico `Solicitar alta de empresa`.
- Estado `pending` hasta aprobacion manual.
- Mail al administrador de la plataforma.
- Panel de aprobacion.

## Paso 7 - Diferenciar admin de empresa y superadmin de plataforma

Hoy `admin` significa administrador de la app actual. En multiempresa hacen falta dos niveles:

- `company_admin`: administra una empresa especifica.
- `platform_admin`: administra empresas, altas, suspensiones y configuracion global del producto.

Opcion conservadora:

- Mantener `app_role` con `admin`, `client`, `employee` para roles dentro de una empresa.
- Crear una tabla separada `platform_admins` para administradores de la plataforma.

Evita mezclar permisos de empresa con permisos del producto SaaS.

## Paso 8 - Adaptar RPCs y RLS

Toda RPC que lee o escribe datos debe recibir o resolver `company_id`.

Ejemplos:

- `get_client_booking_options(company_slug)`
- `get_app_configuration(company_slug)`
- `save_admin_app_configuration(..., company_id/account/session)`
- `create_admin_employee(..., company_id, ...)`
- `update_admin_employee(..., company_id, ...)`
- `request_internal_registration(..., company_id, ...)`
- `approve_internal_registration(..., company_id, ...)`

Reglas:

- Un cliente solo ve y reserva dentro de su empresa.
- Un empleado solo ve agenda y disponibilidad de su empresa.
- Un admin solo administra su empresa.
- Nadie puede consultar servicios, empleados o reservas de otra empresa cambiando parametros desde el navegador.

## Paso 9 - Migrar reservas y entidades existentes

Orden sugerido:

1. Crear empresa inicial.
2. Agregar `company_id` nullable a tablas existentes.
3. Backfill de datos actuales.
4. Agregar `not null` despues del backfill.
5. Crear indices por `company_id`.
6. Actualizar constraints unique para incluir empresa.

Ejemplos de uniqueness:

- `services` puede repetir nombre entre empresas.
- `internal_accounts.username_normalized` debe ser unico por empresa, no global.
- `employees.email` puede repetirse entre empresas si una persona trabaja en mas de una, aunque conviene decidirlo explicitamente.

## Paso 10 - Configuracion visual por empresa

`app_configuration` debe dejar de ser singleton global.

Nuevo comportamiento:

- Una fila por empresa.
- Cada empresa define nombre comercial, horarios, banner, promos, colores y reglas de reserva.
- El home de cliente muestra `company.name`, no `Turnos App` global.

Campos recomendados adicionales:

- `company_name`
- `brand_color`
- `logo_data_url` o `logo_url`
- `welcome_title`
- `welcome_message`

## Paso 11 - Mail por empresa

Primera version:

- Mantener un solo remitente global: `noresponder@quieroturnoapp.com.ar`.
- Incluir nombre de empresa en `from_name`, por ejemplo `Estetica Top Body - Turnos`.

Version futura:

- `mail_settings` por empresa.
- Permitir remitentes propios solo si la empresa verifica su dominio en Resend.

Importante: para evitar complejidad al inicio, no conviene pedir dominio propio a cada empresa.

## Paso 12 - URLs y Supabase Auth

Para rutas por slug no hace falta agregar redirect URL por cada empresa. Basta con:

```txt
https://quieroturnoapp.com.ar
https://www.quieroturnoapp.com.ar
```

La app debe preservar el slug antes de iniciar OAuth y volver a la misma empresa despues del login.

Implementacion frontend sugerida:

- Guardar `company_slug` en `sessionStorage` antes de `signInWithOAuth`.
- Usar `redirectTo: https://quieroturnoapp.com.ar/{slug}` si Supabase lo permite con redirect wildcard configurado.
- Si no se usa wildcard, volver a `/` y redirigir internamente al slug guardado.

## Paso 13 - Pantallas nuevas necesarias

Agregar estas pantallas/estados:

- Empresa no encontrada.
- Empresa pendiente o suspendida.
- Acceso no autorizado para este mail.
- Solicitar acceso a esta empresa.
- Panel superadmin para crear/suspender empresas, si se decide hacerlo desde UI.

## Paso 14 - Checklist de seguridad antes de publicar

- Confirmar que ninguna tabla operativa queda sin `company_id`.
- Confirmar que todas las RPC filtran por empresa.
- Confirmar que `handle_new_auth_user()` no habilita clientes globales por defecto.
- Confirmar que un usuario de empresa A no puede ver datos de empresa B.
- Confirmar que un cliente no autorizado con Google no puede crear reservas.
- Confirmar que la URL raiz no abre una agenda usable.
- Confirmar que las policies RLS no exponen datos cross-tenant.
- Confirmar que `get_client_booking_options` no devuelve empleados/servicios de otras empresas.
- Confirmar que mails de reservas incluyen nombre de empresa correcto.

## Paso 15 - Orden recomendado de implementacion

1. Crear migracion base multiempresa.
2. Backfill de datos actuales en una empresa inicial.
3. Cambiar funciones SQL/RPC para aceptar/resolver empresa.
4. Cambiar frontend para resolver empresa por slug.
5. Bloquear OAuth sin membresia.
6. Adaptar panel admin para operar solo sobre su empresa.
7. Adaptar cliente y empleado para operar solo sobre su empresa.
8. Agregar pantallas de acceso denegado/empresa no encontrada.
9. Ejecutar pruebas manuales con dos empresas de prueba.
10. Recién despues crear flujo de alta comercial de nuevas empresas.

## Pruebas manuales minimas

Crear dos empresas:

```txt
estetica-top-body
barberia-demo
```

Probar:

- Cliente autorizado en `estetica-top-body` entra y reserva.
- Ese mismo cliente no puede entrar a `barberia-demo` si no tiene membresia.
- Admin de `estetica-top-body` no ve empleados ni reservas de `barberia-demo`.
- Empleado de una empresa no ve agenda de otra.
- Usuario Google desconocido queda bloqueado.
- URL raiz muestra selector/informacion comercial, no agenda abierta.

## Etapa 2 - Primer corte local implementado

Migracion nueva:

```txt
database/039_multi_tenant_client_context.sql
```

Alcance de este corte:

- Resolver empresa activa desde la URL por slug.
- Mantener `esteticatopbody` como empresa default para compatibilidad local.
- Crear `barberia-demo` como segunda empresa de prueba.
- Permitir una configuracion visual por empresa en `app_configuration.company_id`.
- Filtrar por empresa las RPC publicas de cliente:
	- `get_app_configuration(company_slug_value)`
	- `get_company_public_context(slug_value)`
	- `get_client_booking_options(company_slug_value)`
	- `request_client_booking(..., company_slug_value)`
- Frontend lee el slug desde `/{slug}` y pasa ese tenant a cliente, agenda, empleado y configuracion admin.
- El login ya muestra el nombre de empresa activa y OAuth vuelve a `/{slug}`.

Pruebas locales sugeridas despues de ejecutar la migracion:

```txt
http://127.0.0.1:5173/esteticatopbody
http://127.0.0.1:5173/barberia-demo
http://127.0.0.1:5173/empresa-inexistente
```

Validar:

- `esteticatopbody` carga la configuracion actual.
- `barberia-demo` carga como empresa activa pero sin servicios/promos si no se cargaron datos.
- `empresa-inexistente` muestra empresa no disponible.
- Las reservas cliente se insertan con `bookings.company_id` de la empresa de la URL.
- `get_client_booking_options('barberia-demo')` no devuelve servicios ni empleados de `esteticatopbody`.

Pendiente para cerrar aislamiento completo:

- Adaptar todas las RPC internas/admin para resolver y validar `company_id` desde la sesion interna.
- Hacer `verify_internal_login`, `request_internal_registration` y `validate_internal_session` tenant-aware.
- Crear datos de prueba completos para `barberia-demo`.
- Endurecer constraints `not null` y uniques por empresa cuando todas las RPC esten migradas.

## Decision pendiente antes de implementar

Definir como se van a vender y activar empresas:

- Alta manual por superadmin.
- Formulario publico de solicitud.
- Integracion futura con pagos/suscripcion.

Para la primera version, la opcion mas segura es alta manual por superadmin y acceso por invitacion de email.
