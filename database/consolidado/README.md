# SQL consolidado

Estos archivos agrupan las migraciones de `database/*.sql` en 5 bloques cronologicos para bootstrap o portabilidad hacia otra base.

Ejecutar en este orden:

1. `01_base_e_internos_000_014.sql`
2. `02_configuracion_agenda_cierres_015_033.sql`
3. `03_multitenant_plataforma_034_049.sql`
4. `04_turnos_empleados_rendiciones_050_065.sql`
5. `05_operativa_slug_visibilidad_permisos_066_074.sql`

Notas:

- No reemplazan las migraciones originales; son una copia consolidada para levantar otra base con menos archivos.
- `consultasVarias.sql` no se incluye porque contiene consultas sueltas, no una migracion numerada.
- Si se agregan nuevas migraciones, regenerar o actualizar el ultimo bloque correspondiente.