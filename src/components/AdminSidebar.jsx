import {
  NavLink
} from 'react-router-dom';

import {
  obtenerRutasAdministrador
} from '../routes/rutasAplicacion';


export default function AdminSidebar({

  groups = [],

  activeView,

  onViewChange,

  open = false,

  onClose,

  backgroundImageSrc,

  companyName,

  logoSrc,

  companySlug

}) {

  /*
   * Las rutas administrativas se resuelven
   * directamente dentro del Sidebar.
   *
   * De esta manera Dashboard ya no necesita
   * traducir:
   *
   *   clientes -> rutas.clientes
   *   empleados -> rutas.empleados
   *   etc.
   *
   * El Sidebar solamente necesita conocer
   * el companySlug y el id del elemento.
   */

  const rutas =
    obtenerRutasAdministrador(
      companySlug
    );


  /*
   * Obtiene la ruta real correspondiente
   * a un elemento del menú.
   *
   * Si el elemento ya trae path,
   * lo respetamos.
   *
   * Esto mantiene compatibilidad con
   * componentes que eventualmente sigan
   * enviando rutas explícitas.
   */

  const obtenerPathItem =
    (item) => {

      if (
        item?.path
      ) {

        return item.path;
      }


      const paths = {

        agenda:
          rutas.agenda,

        clientes:
          rutas.clientes,

        empleados:
          rutas.empleados,

        servicios:
          rutas.servicios,

        sucursales:
          rutas.sucursales,

        bundles:
          rutas.bundles,

        configuracion:
          rutas.configuracion,

        pedidos:
          rutas.pedidos,

        pendientes:
          rutas.pendientes,

        cerrarAtencion:
          rutas.cerrarAtencion,

        disponibilidad:
          rutas.disponibilidad

      };


      return paths[
        item?.id
      ] || null;
    };


  return (

    <>

      <div

        className={`
          admin-sidebar-overlay
          ${
            open
              ? 'is-open'
              : ''
          }
        `}

        onClick={
          onClose
        }

        aria-hidden="true"

      />


      <aside

        className={`

          admin-sidebar

          ${
            backgroundImageSrc
              ? 'has-sidebar-background'
              : ''
          }

          ${
            open
              ? 'is-open'
              : ''
          }

        `.trim()}

        style={

          backgroundImageSrc

            ? {
                '--sidebar-background-image':
                  `url("${backgroundImageSrc}")`
              }

            : undefined

        }

        aria-label="
          Menú administrador
        "

      >

        <div
          className="
            admin-sidebar-brand
          "
        >

          <span
            className="
              admin-sidebar-brand-title
            "
          >

            MENÚ

          </span>


          <button

            className="
              admin-sidebar-close
            "

            type="button"

            onClick={
              onClose
            }

            aria-label="
              Cerrar menú
            "

          >

            ✕

          </button>

        </div>


        <nav
          className="
            admin-sidebar-nav
          "
        >

          {groups.map(
            group => (

              <div

                key={
                  group.label ||
                  'main'
                }

                className="
                  admin-sidebar-group
                "

              >

                {group.label && (

                  <span

                    className="
                      admin-sidebar-group-label
                    "

                  >

                    {
                      group.label
                    }

                  </span>

                )}


                {(Array.isArray(
                  group.items
                )
                  ? group.items
                  : []
                ).map(
                  item => {

                    /*
                     * Resolvemos la ruta
                     * directamente acá.
                     */

                    const itemPath =
                      obtenerPathItem(
                        item
                      );


                    /*
                     * Los elementos sin ruta
                     * son acciones.
                     *
                     * Actualmente:
                     *
                     *   new-booking
                     *
                     * abre NewBookingPanel.
                     */

                    if (
                      !itemPath
                    ) {

                      return (

                        <button

                          key={
                            item.id
                          }

                          type="button"

                          className={`

                            admin-sidebar-item

                            ${
                              activeView ===
                              item.id

                                ? 'is-active'

                                : ''
                            }

                          `}

                          onClick={() => {

                            onViewChange?.(
                              item.id
                            );

                            onClose?.();

                          }}

                        >

                          <span

                            className="
                              admin-sidebar-item-icon
                            "

                            aria-hidden="true"

                          >

                            {
                              item.icon
                            }

                          </span>


                          <span

                            className="
                              admin-sidebar-item-label
                            "

                          >

                            {
                              item.label
                            }

                          </span>

                        </button>

                      );
                    }


                    /*
                     * Navegación real.
                     *
                     * React Router es ahora el responsable
                     * de cambiar de página.
                     *
                     * No usamos:
                     *
                     *   navigate()
                     *   window.location
                     *   window.history
                     *
                     * Tampoco llamamos onViewChange()
                     * para navegación normal.
                     */

                    return (

                      <NavLink

                        key={
                          item.id
                        }

                        to={
                          itemPath
                        }

                        end

                        className={({
                          isActive
                        }) =>

                          `

                            admin-sidebar-item

                            ${
                              isActive
                                ? 'is-active'
                                : ''
                            }

                          `

                        }

                        style={{

                          textDecoration:
                            'none',

                          color:
                            'inherit'

                        }}

                        onClick={
                          onClose
                        }

                      >

                        <span

                          className="
                            admin-sidebar-item-icon
                          "

                          aria-hidden="true"

                        >

                          {
                            item.icon
                          }

                        </span>


                        <span

                          className="
                            admin-sidebar-item-label
                          "

                        >

                          {
                            item.label
                          }

                        </span>

                      </NavLink>

                    );

                  }
                )}

              </div>

            )
          )}

        </nav>

      </aside>

    </>

  );

}
