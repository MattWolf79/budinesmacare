import {
  Link
} from 'react-router-dom';

import {
  getAdminPortalPath,
  getClientPortalPath,
  getEmployeePortalPath
} from '../utils/tenant';


const DEFAULT_BENEFITS = [
  'Reservá online las 24 horas',
  'Recordatorios automáticos por mail',
  'Sin llamados ni esperas',
  'Atención personalizada',
];


const sanitizeInstagramHandle = (
  value
) =>
  String(
    value || ''
  )
    .trim()
    .replace(
      /^@+/,
      ''
    );


const buildWhatsappLink = (
  value
) => {
  const digits =
    String(
      value || ''
    ).replace(
      /[^0-9]/g,
      ''
    );

  return digits
    ? `https://wa.me/${digits}`
    : null;
};


export default function LandingPage({
  companySlug,
  companyContext
}) {

  const landing =
    companyContext?.landing ||
    {};


  const companyName =
    companyContext?.company_name ||
    companyContext?.name ||
    'Tu empresa';


  const logoSrc =
    companyContext?.client_logo_data_url ||
    null;


  const heroTitle =
    landing.titulo ||
    `Reservá tu turno en ${companyName}`;


  const heroSubtitle =
    landing.subtitulo ||
    'Tu agenda, siempre a un clic';


  const heroDescription =
    landing.descripcion ||
    'Elegí el servicio, el día y el horario que más te convenga. Rápido, simple y sin llamadas.';


  const heroImage =
    landing.hero_image_data_url ||
    null;


  const ctaText =
    landing.cta_texto ||
    'Reservá tu turno';


  const kicker =
    String(
      landing.etiqueta || ''
    ).trim();


  const benefits =
    Array.isArray(
      landing.beneficios
    ) &&
    landing.beneficios.length > 0
      ? landing.beneficios
          .filter(
            (item) =>
              String(
                item || ''
              ).trim() !== ''
          )
          .slice(
            0,
            4
          )
      : DEFAULT_BENEFITS;


  const showInternalAccess =
    landing.mostrar_acceso_interno !==
    false;


  const direccion =
    landing.direccion ||
    '';


  const telefono =
    landing.telefono ||
    '';


  const whatsapp =
    landing.whatsapp ||
    '';


  const instagram =
    sanitizeInstagramHandle(
      landing.instagram || ''
    );


  const horarios =
    companyContext?.business_hours_text ||
    '';


  const whatsappLink =
    buildWhatsappLink(
      whatsapp
    );


  const hasContact =
    Boolean(
      direccion ||
      telefono ||
      whatsapp ||
      instagram ||
      horarios
    );


  /*
   * ============================================================
   * RUTAS
   * ============================================================
   *
   * Estas son rutas internas de React Router.
   *
   * No usamos window.location ni <a href="..."> para navegar
   * dentro de la aplicación.
   */

  const clientPath =
    getClientPortalPath(
      companySlug
    );


  const employeePath =
    getEmployeePortalPath(
      companySlug
    );


  const adminPath =
    getAdminPortalPath(
      companySlug
    );


  const heroStyle =
    heroImage
      ? {
          backgroundImage:
            `linear-gradient(105deg, rgba(14, 11, 6, 0.92) 0%, rgba(14, 11, 6, 0.66) 42%, rgba(14, 11, 6, 0.4) 100%), url(${heroImage})`
        }
      : undefined;


  return (
    <main className="landing-page">

      {/* ======================================================
          HERO
          ====================================================== */}

      <section
        className={
          `landing-hero${
            heroImage
              ? ' has-image'
              : ''
          }`
        }
        style={
          heroStyle
        }
      >

        <header className="landing-nav">

          <div className="landing-brand">

            {logoSrc ? (
              <img
                className="landing-brand-logo"
                src={logoSrc}
                alt={companyName}
              />
            ) : (
              <span
                className="landing-brand-mark"
                aria-hidden
              >
                {companyName
                  .charAt(0)
                  .toUpperCase()}
              </span>
            )}

            <span className="landing-brand-name">
              {companyName}
            </span>

          </div>


          <nav className="landing-nav-actions">

            {showInternalAccess && (
              <Link
                className="landing-nav-link"
                to={employeePath}
              >
                Soy del staff
              </Link>
            )}


            <Link
              className="landing-nav-cta"
              to={clientPath}
            >
              Ingresar
            </Link>

          </nav>

        </header>


        <div className="landing-hero-content">

          {kicker && (
            <p className="landing-hero-kicker">
              {kicker}
            </p>
          )}


          <h1 className="landing-hero-title">

            {heroTitle}

            <span className="landing-hero-title-accent">
              {heroSubtitle}
            </span>

          </h1>


          <p className="landing-hero-description">
            {heroDescription}
          </p>


          <div className="landing-hero-actions">

            <Link
              className="landing-hero-primary"
              to={clientPath}
            >
              {ctaText}
            </Link>


            {showInternalAccess && (
              <Link
                className="landing-hero-secondary"
                to={employeePath}
              >
                Acceso staff
              </Link>
            )}

          </div>

        </div>


        <ul className="landing-hero-benefits">

          {benefits.map(
            (
              benefit
            ) => (
              <li
                key={benefit}
                className="landing-hero-benefit"
              >
                <span
                  className="landing-hero-benefit-icon"
                  aria-hidden
                >
                  ✓
                </span>

                {benefit}
              </li>
            )
          )}

        </ul>

      </section>


      {/* ======================================================
          ACCESOS
          ====================================================== */}

      <section className="landing-access">

        <div className="landing-access-inner">

          <p className="landing-access-kicker">
            Accesos
          </p>


          <h2 className="landing-access-title">
            ¿Cómo querés ingresar?
          </h2>


          <div className="landing-access-grid">

            {/* CLIENTE */}

            <Link
              className="landing-access-card"
              to={clientPath}
            >

              <span
                className="landing-access-icon"
                aria-hidden
              >
                👤
              </span>


              <span className="landing-access-card-title">
                Soy cliente
              </span>


              <span className="landing-access-card-copy">
                Reservá, gestioná y consultá tus turnos.
              </span>


              <span className="landing-access-card-cta">
                Reservar turno →
              </span>

            </Link>


            {showInternalAccess && (
              <>

                {/* EMPLEADO */}

                <Link
                  className="landing-access-card"
                  to={employeePath}
                >

                  <span
                    className="landing-access-icon variant-employee"
                    aria-hidden
                  >
                    💼
                  </span>


                  <span className="landing-access-card-title">
                    Soy del staff
                  </span>


                  <span className="landing-access-card-copy">
                    Ingresá a tu agenda y disponibilidad.
                  </span>


                  <span className="landing-access-card-cta">
                    Ir a mi agenda →
                  </span>

                </Link>


                {/* ADMINISTRADOR */}

                <Link
                  className="landing-access-card"
                  to={adminPath}
                >

                  <span
                    className="landing-access-icon variant-admin"
                    aria-hidden
                  >
                    ⚙️
                  </span>


                  <span className="landing-access-card-title">
                    Administración
                  </span>


                  <span className="landing-access-card-copy">
                    Gestioná la empresa, el staff y la configuración.
                  </span>


                  <span className="landing-access-card-cta">
                    Panel admin →
                  </span>

                </Link>

              </>
            )}

          </div>

        </div>

      </section>


      {/* ======================================================
          CONTACTO
          ====================================================== */}

      {hasContact && (
        <section className="landing-contact">

          <div className="landing-contact-inner">

            <h2 className="landing-contact-title">
              Contacto
            </h2>


            <ul className="landing-contact-list">

              {direccion && (
                <li className="landing-contact-item">

                  <span aria-hidden>
                    📍
                  </span>

                  {direccion}

                </li>
              )}


              {telefono && (
                <li className="landing-contact-item">

                  <span aria-hidden>
                    📞
                  </span>

                  <a
                    href={`tel:${telefono.replace(
                      /[^0-9+]/g,
                      ''
                    )}`}
                  >
                    {telefono}
                  </a>

                </li>
              )}


              {whatsappLink && (
                <li className="landing-contact-item">

                  <span aria-hidden>
                    💬
                  </span>

                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp
                  </a>

                </li>
              )}


              {instagram && (
                <li className="landing-contact-item">

                  <span aria-hidden>
                    📸
                  </span>

                  <a
                    href={`https://instagram.com/${instagram}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    @{instagram}
                  </a>

                </li>
              )}


              {horarios && (
                <li className="landing-contact-item">

                  <span aria-hidden>
                    🕒
                  </span>

                  {horarios}

                </li>
              )}

            </ul>

          </div>

        </section>
      )}


      {/* ======================================================
          FOOTER
          ====================================================== */}

      <footer className="landing-footer">

        <span className="landing-footer-brand">
          {companyName}
        </span>


        <span className="landing-footer-powered">
          Powered by{' '}
          <strong>
            QuieroTurnoApp
          </strong>
        </span>

      </footer>

    </main>
  );
}