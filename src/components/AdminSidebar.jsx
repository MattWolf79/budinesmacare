import {
  NavLink
} from 'react-router-dom';


export default function AdminSidebar({
  groups = [],
  activeView,
  onViewChange,
  open = false,
  onClose,
  backgroundImageSrc
}) {

  return (

    <>

      <div
        className={`admin-sidebar-overlay ${
          open
            ? 'is-open'
            : ''
        }`}
        onClick={
          onClose
        }
        aria-hidden="true"
      />


      <aside
        className={`admin-sidebar ${
          backgroundImageSrc
            ? 'has-sidebar-background'
            : ''
        } ${
          open
            ? 'is-open'
            : ''
        }`.trim()}
        style={
          backgroundImageSrc
            ? {
                '--sidebar-background-image':
                  `url("${backgroundImageSrc}")`
              }
            : undefined
        }
        aria-label="Menú administrador"
      >

        <div className="admin-sidebar-brand">

          <span className="admin-sidebar-brand-title">
            MENÚ
          </span>


          <button
            className="admin-sidebar-close"
            type="button"
            onClick={
              onClose
            }
            aria-label="Cerrar menú"
          >
            ✕
          </button>

        </div>


        <nav className="admin-sidebar-nav">

          {groups.map(
            (group) => (

              <div
                key={
                  group.label ||
                  'main'
                }
                className="admin-sidebar-group"
              >

                {group.label && (

                  <span className="admin-sidebar-group-label">
                    {group.label}
                  </span>

                )}


                {group.items.map(
                  (item) => {

                    /*
                     * Los elementos con path son
                     * verdaderas rutas de React Router.
                     *
                     * Ejemplo:
                     *
                     * /empresa/admin/agenda
                     * /empresa/admin/clientes
                     *
                     * NavLink se encarga de:
                     *
                     * - navegar
                     * - marcar la ruta activa
                     * - conservar historial
                     * - evitar navegación manual
                     */

                    if (
                      item.path
                    ) {

                      return (

                        <NavLink
                          key={
                            item.id
                          }
                          to={
                            item.path
                          }
                          end
                          className={({
                            isActive
                          }) =>
                            `admin-sidebar-item ${
                              isActive
                                ? 'is-active'
                                : ''
                            }`
                          }
                          onClick={
                            onClose
                          }
                        >

                          <span
                            className="admin-sidebar-item-icon"
                            aria-hidden="true"
                          >
                            {
                              item.icon
                            }
                          </span>


                          <span className="admin-sidebar-item-label">
                            {
                              item.label
                            }
                          </span>

                        </NavLink>

                      );

                    }


                    /*
                     * Los elementos sin path no son
                     * navegación.
                     *
                     * Actualmente:
                     *
                     * - new-booking
                     *
                     * Ese elemento abre un panel/modal,
                     * por lo que sigue utilizando
                     * onViewChange.
                     */

                    return (

                      <button
                        key={
                          item.id
                        }
                        type="button"
                        className={`admin-sidebar-item ${
                          activeView ===
                          item.id
                            ? 'is-active'
                            : ''
                        }`}
                        onClick={() => {

                          onViewChange?.(
                            item.id
                          );

                        }}
                      >

                        <span
                          className="admin-sidebar-item-icon"
                          aria-hidden="true"
                        >
                          {
                            item.icon
                          }
                        </span>


                        <span className="admin-sidebar-item-label">
                          {
                            item.label
                          }
                        </span>

                      </button>

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