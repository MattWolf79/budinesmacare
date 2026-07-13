# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
# turnos-app

## Notificaciones por mail

La app usa Resend desde Supabase (`pg_net`). Ejecutá la migración `database/033_employee_email_notifications.sql` en Supabase y cargá una API key gratuita de Resend en `mail_settings`.

```sql
update public.mail_settings
set resend_api_key = 're_xxxxxxxxx',
	from_email = 'noresponder@quieroturnoapp.com.ar',
	from_name = 'Turnos App - No responder',
	active = true,
	updated_at = now()
where id = true;
```

Para `quieroturnoapp.com.ar`, verificá el dominio en Resend y cargá en NIC.ar los registros DNS que Resend te indique para SPF/DKIM. Hasta que Resend marque el dominio como verificado, puede rechazar envíos con `from_email = noresponder@quieroturnoapp.com.ar`.

Los avisos se envían como mensajes de tipo no responder. Resend exige verificar el dominio usado en `from_email`; para pruebas iniciales podés usar el remitente de prueba que te habilite Resend.
