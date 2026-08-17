import {
  NavLink
} from 'react-router-dom';


export default function AdminSidebar({

  groups = [],

  activeView,

  onViewChange,

  open = false,

  onClose,

  backgroundImageSrc,

  companyName,

  logoSrc,

  companySlug,

  /*
   * Permite que el layout que utiliza el Sidebar
   * resuelva sus propias rutas.
   *
   * Ejemplo:
   *
   * Administrador:
   *   obtenerRutasAdministrador()
   *
   * Empleado:
   *   obtenerRutasEmpleado()
   *
   * El Sidebar no necesita conocer ninguna
   * de esas estructuras.
   */
  getItemPath

}) {


  /*
   * ============================================================
   * OBTENER RUTA DEL ITEM
   * ============================================================
   *
   * Prioridad:
   *
   * 1. getItemPath() si fue proporcionado por el layout.
   * 2. item.path si el grupo ya trae una ruta explícita.
   *
   * No se construyen rutas administrativas acá.
   */

  const obtenerPathItem =
    (item) => {

      /*
       * El layout puede resolver la ruta
       * según el tipo de portal.
       */

      if (
        typeof getItemPath ===
        'function'
      ) {

        const path =
          getItemPath(
            item
          );


        if (
          path
        ) {

          return path;

        }

      }


      /*
       * Compatibilidad:
       *
       * Si el item ya trae path,
       * lo respetamos.
       */

      if (
        item?.path
      ) {

        return item.path;

      }


      return null;

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
                     * ==================================================
                     * RESOLVER RUTA
                     * ==================================================
                     */

                    const itemPath =
                      obtenerPathItem(
                        item
                      );


                    /*
                     * ==================================================
                     * ACCIONES SIN RUTA
                     * ==================================================
                     *
                     * Actualmente:
                     *
                     *   new-booking
                     *
                     * Estas opciones NO son navegación.
                     *
                     * Abren un panel u otra acción proporcionada
                     * por el layout.
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
                     * ==================================================
                     * NAVEGACIÓN REAL
                     * ==================================================
                     *
                     * React Router se encarga de la navegación.
                     *
                     * No usamos:
                     *
                     *   navigate()
                     *   window.location
                     *   window.history
                     *
                     * Tampoco llamamos onViewChange()
                     * para una navegación normal.
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

                        className={({ isActive }) =>

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