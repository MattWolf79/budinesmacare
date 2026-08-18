/*
 * ============================================================
 * RUTAS ADMINISTRADOR
 * ============================================================
 */

export const rutasAdministrador = {

  agenda:
    'agenda',

  empleados:
    'empleados',

  clientes:
    'clientes',

  servicios:
    'servicios',

  sucursales:
    'sucursales',

  bundles:
    'bundles',

  configuracion:
    'configuracion',

  pedidos:
    'pedidos',

  pendientes:
    'pendientes',

  cerrarAtencion:
    'cerrar-atencion',

  disponibilidad:
    'disponibilidad'

};


/*
 * ============================================================
 * RUTAS CLIENTE
 * ============================================================
 */

export const rutasCliente = {

  inicio:
    'inicio',

  reserva:
    'reserva',

  misTurnos:
    'mis-turnos',

  perfil:
    'perfil'

};


/*
 * ============================================================
 * RUTAS EMPLEADO
 * ============================================================
 */

export const rutasEmpleado = {

  /*
   * La raíz del empleado no tiene segmento adicional.
   *
   * /empresa/empleado
   */

  inicio:
    '',

  agenda:
    'agenda',

  clientes:
    'clientes',

  productos:
    'productos',

  disponibilidad:
    'disponibilidad',

  perfil:
    'perfil',

  cerrarAtencion:
    'cerrar-atencion',

  nuevaReserva:
    'nueva-reserva',

  nuevoPedido:
    'nuevo-pedido'

};


/*
 * ============================================================
 * UTILIDADES
 * ============================================================
 */


/*
 * Normaliza el slug de empresa.
 *
 * Ejemplos:
 *
 *   " Empresa "
 *   "/Empresa/"
 *   "EMPRESA"
 *
 * terminan como:
 *
 *   "empresa"
 */

const normalizarSlug = (
  companySlug
) =>

  String(
    companySlug || ''
  )
    .trim()
    .toLowerCase()
    .replace(
      /^\/+|\/+$/g,
      ''
    );


/*
 * Construye URLs completas a partir
 * de una ruta base y un objeto de rutas.
 */

const crearRutasConBase = (
  base,
  rutas
) =>

  Object.fromEntries(

    Object.entries(
      rutas
    ).map(
      ([
        clave,
        ruta
      ]) => [

        clave,

        ruta
          ? `${base}/${ruta}`
          : base

      ]
    )

  );


/*
 * ============================================================
 * RUTAS ADMINISTRADOR - URL COMPLETA
 * ============================================================
 *
 * Estas rutas se utilizan cuando necesitamos
 * navegar mediante una URL completa.
 *
 * Ejemplos:
 *
 *   /esteticatopbody/admin
 *   /esteticatopbody/admin/agenda
 *   /esteticatopbody/admin/clientes
 *
 * IMPORTANTE:
 *
 * Dentro de <Route path="..."> utilizamos
 * rutasAdministrador, no estas URLs completas.
 *
 * ============================================================
 */

export const obtenerRutasAdministrador = (
  companySlug
) => {

  const slug =
    normalizarSlug(
      companySlug
    );


  const base =
    `/${slug}/admin`;


  return crearRutasConBase(
    base,
    rutasAdministrador
  );

};


/*
 * ============================================================
 * RUTAS CLIENTE - URL COMPLETA
 * ============================================================
 */

export const obtenerRutasCliente = (
  companySlug
) => {

  const slug =
    normalizarSlug(
      companySlug
    );


  const base =
    `/${slug}/sacarturno`;


  return crearRutasConBase(
    base,
    rutasCliente
  );

};


/*
 * ============================================================
 * RUTAS EMPLEADO - URL COMPLETA
 * ============================================================
 */

export const obtenerRutasEmpleado = (
  companySlug
) => {

  const slug =
    normalizarSlug(
      companySlug
    );


  const base =
    `/${slug}/empleado`;


  return crearRutasConBase(
    base,
    rutasEmpleado
  );

};