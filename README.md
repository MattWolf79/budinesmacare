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

La app usa FormSubmit desde Supabase (`pg_net`), sin variables de entorno ni claves de API. Ejecutá la migración `database/033_employee_email_notifications.sql` en Supabase.

Cada empleado debe tener un mail cargado. Los administradores que deban recibir avisos también tienen que estar creados como empleados administradores con mail.

Los avisos se envían como mensajes de tipo no responder (`noresponder@turnos-app.com`).

FormSubmit pide confirmar cada casilla destino la primera vez que recibe un envío. El primer mail puede llegar como activación; después de confirmar, los siguientes avisos salen automáticamente.
