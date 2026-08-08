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
13. `13_sucursales.sql`
14. `14_sucursales_flag.sql`
15. `15_sucursales_rpcs.sql`
16. `16_sucursales_availability.sql`
17. `17_sucursales_bookings.sql`
18. `18_sucursales_relations.sql`
19. `19_employee_branches_all.sql`
20. `20_bundles_base.sql`
21. `21_bundles_rpcs.sql`
22. `22_packs_flag.sql`
23. `23_booking_groups.sql`
24. `24_client_self_and_reschedule.sql`
25. `25_client_bookings_rpc.sql`
26. `26_clients_management.sql`
27. `27_admin_booking_client_link.sql`
28. `28_client_booking_waitlist.sql`
29. `29_client_booking_options_waitlist.sql`
30. `30_client_self_profile_gender_photo_notes.sql`
31. `31_company_landing.sql`
32. `32_repair_close_booking_attention.sql`
33. `33_appearance_palette.sql`
34. `34_tipo_empresa_modo_operacion.sql`
35. `35_product_types_master.sql`
36. `36_employee_username_tenant_and_close_pedido.sql`
37. `37_close_pedido_dataset_optimization.sql`
38. `38_admin_panel_30d_window.sql`
39. `39_close_pedido_function.sql`
40. `40_google_client_sync.sql`
41. `41_google_client_self_profile.sql`
42. `42_product_images.sql`

Notas:

- No reemplazan las migraciones originales; son una copia consolidada para levantar otra base con menos archivos.
- `consultasVarias.sql` no se incluye porque contiene consultas sueltas, no una migracion numerada.
- Si se agregan nuevas migraciones, regenerar o actualizar el ultimo bloque correspondiente.