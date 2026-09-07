/*
 * ============================================================
 * RUTAS ADMINISTRADOR
 * ============================================================
 */

export const rutasAdministrador = {

  agenda:
    'pedidos',

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

  cerrarAtencion:
    'cerrar-atencion',

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
    'nuevo',

  misTurnos:
    'mis-pedidos',

  perfil:
    'mi-cuenta'

};


/*
 * ============================================================
 * RUTAS EMPLEADO
 * ============================================================
 */

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

export const obtenerRutasAdministrador = () => {

  const base = '/admin';


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

export const obtenerRutasCliente = () => {

  const base = '/pedidos';


  return crearRutasConBase(
    base,
    rutasCliente
  );

};
