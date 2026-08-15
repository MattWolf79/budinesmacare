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

const normalizarSlug =
  (companySlug) =>
    String(
      companySlug || ''
    )
      .trim()
      .toLowerCase();

const crearRutasConBase = (
  base,
  rutas
) =>
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

export const obtenerRutasAdministrador =
  (companySlug) => {
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

export const obtenerRutasCliente =
  (companySlug) => {
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

export const obtenerRutasEmpleado =
  (companySlug) => {
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