# SQL consolidado

Estos archivos agrupan las migraciones de `database/*.sql` en 5 bloques cronologicos para bootstrap o portabilidad hacia otra base.

Ejecutar en este orden:

1. `01_base_e_internos_000_014.sql`
2. `02_configuracion_agenda_cierres_015_033.sql`
3. `03_multitenant_plataforma_034_049.sql`
4. `04_turnos_empleados_rendiciones_050_065.sql`
5. `05_operativa_slug_visibilidad_permisos_066_074.sql`
6. `06_patch_banners_reservables.sql`
7. `07_employee_self_profile.sql`
8. `08_platform_client_logo.sql`
9. `09_surcharges.sql`
10. `10_surcharges_platform_rpc_fix.sql`
11. `11_closure_invoice_snapshots.sql`
12. `12_client_login_usuario_dni.sql`

Notas:

- No reemplazan las migraciones originales; son una copia consolidada para levantar otra base con menos archivos.
- `consultasVarias.sql` no se incluye porque contiene consultas sueltas, no una migracion numerada.
- Si se agregan nuevas migraciones, regenerar o actualizar el ultimo bloque correspondiente.