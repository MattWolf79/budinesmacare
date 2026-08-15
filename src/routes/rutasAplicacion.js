export const rutasAdministrador = {
  agenda: 'agenda',
  empleados: 'empleados',
  clientes: 'clientes',
  servicios: 'servicios',
  sucursales: 'sucursales',
  bundles: 'bundles',
  configuracion: 'configuracion',
  pedidos: 'pedidos',
  pendientes: 'pendientes',
  cerrarAtencion: 'cerrar-atencion',
  disponibilidad: 'disponibilidad'
};

export const rutasCliente = {
  inicio: 'inicio',
  reserva: 'reserva',
  misTurnos: 'mis-turnos',
  perfil: 'perfil'
};

export const rutasEmpleado = {
  inicio: '',
  agenda: 'agenda',
  clientes: 'clientes',
  productos: 'productos',
  disponibilidad: 'disponibilidad',
  perfil: 'perfil',
  cerrarAtencion: 'cerrar-atencion',
  nuevaReserva: 'nueva-reserva',
  nuevoPedido: 'nuevo-pedido'
};

/*
 * ============================================================
 * UTILIDADES
 * ============================================================
 */

const normalizarSlug = (companySlug) =>
  String(companySlug || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '');

const crearRutasConBase = (base, rutas) =>
  Object.fromEntries(
    Object.entries(rutas).map(
      ([clave, ruta]) => [
        clave,
        ruta
          ? `${base}/${ruta}`
          : base
      ]
    )
  );

/*
 * ============================================================
 * RUTAS ADMINISTRADOR
 * ============================================================
 *
 * Ejemplo:
 *
 * companySlug = "esteticatopbody"
 *
 * resultado:
 *
 * /esteticatopbody/admin
 * /esteticatopbody/admin/agenda
 * /esteticatopbody/admin/clientes
 * /esteticatopbody/admin/empleados
 * ...
 *
 * Estas funciones construyen URLs completas.
 * La navegación sigue siendo responsabilidad de React Router.
 */

export const obtenerRutasAdministrador = (companySlug) => {
  const slug = normalizarSlug(companySlug);

  const base = `/${slug}/admin`;

  return crearRutasConBase(
    base,
    rutasAdministrador
  );
};

/*
 * ============================================================
 * RUTAS CLIENTE
 * ============================================================
 */

export const obtenerRutasCliente = (companySlug) => {
  const slug = normalizarSlug(companySlug);

  const base = `/${slug}/sacarturno`;

  return crearRutasConBase(
    base,
    rutasCliente
  );
};

/*
 * ============================================================
 * RUTAS EMPLEADO
 * ============================================================
 */

export const obtenerRutasEmpleado = (companySlug) => {
  const slug = normalizarSlug(companySlug);

  const base = `/${slug}/empleado`;

  return crearRutasConBase(
    base,
    rutasEmpleado
  );
};