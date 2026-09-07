import {
  Link
} from 'react-router-dom';

import {
  getAdminPortalPath,
  getClientPortalPath
} from '../utils/tenant';
import budinHero from '../assets/budin-hero.jpg';


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
    '1171123490';


  const instagram =
    sanitizeInstagramHandle(
      landing.instagram || 'macare.budines'
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

 
  const adminPath =
    getAdminPortalPath(
      companySlug
    );


  return (
    <main className="landing-page">

      {/* ======================================================
          HERO
          ====================================================== */}

      <section
        className="landing-hero"
      >

        <header className="landing-nav">

          <div className="landing-brand" aria-label="Budines Macaré">
            <span className="landing-brand-overline">Budines</span>
            <span className="landing-brand-name">Macaré</span>
            <span className="landing-brand-heart" aria-hidden>♡</span>
          </div>


          <nav className="landing-nav-actions">

            <Link
              className="landing-nav-cta"
              to={clientPath}
            >
              <span aria-hidden>🛒</span>
              Hacer pedido
            </Link>

            {showInternalAccess && (
              <Link
                className="landing-nav-link"
                to={adminPath}
              >
                <span aria-hidden>♙</span>
                Soy admin
              </Link>
            )}

          </nav>

        </header>


        <div className="landing-hero-content">

          <p className="landing-hero-kicker">
            Budines artesanales
          </p>


          <h1 className="landing-hero-title">

            El sabor casero

            <span className="landing-hero-title-accent">
              en cada bocado
            </span>

          </h1>


          <p className="landing-hero-description">
            Budines frescos, esponjosos y llenos de sabor, hechos con ingredientes de calidad.
          </p>


          <div className="landing-hero-actions">

            <Link
              className="landing-hero-primary"
              to={clientPath}
            >
              <span aria-hidden>🛒</span>
              Hacer pedido
            </Link>


            {showInternalAccess && (
              <Link
                className="landing-hero-secondary"
                to={adminPath}
              >
                <span aria-hidden>♙</span>
                Soy admin
              </Link>
            )}

          </div>

        </div>

        <div className="landing-hero-image-wrap" aria-hidden>
          <img
            className="landing-hero-image"
            src={budinHero}
            alt=""
          />
        </div>

        <ul className="landing-hero-benefits">

          <li className="landing-hero-benefit">
            <span className="landing-hero-benefit-icon" aria-hidden>◒</span>
            Ingredientes seleccionados
          </li>
          <li className="landing-hero-benefit">
            <span className="landing-hero-benefit-icon" aria-hidden>♡</span>
            Recetas tradicionales
          </li>
          <li className="landing-hero-benefit">
            <span className="landing-hero-benefit-icon" aria-hidden>☺</span>
            El mejor sabor, siempre
          </li>

        </ul>

      </section>
<section className="landing-how-it-works">

  <h2>¿Cómo realizar un pedido?</h2>

  <div className="landing-steps">

    <div>
      <h3>1</h3>
      <p>Elegí tus productos</p>
    </div>

    <div>
      <h3>2</h3>
      <p>Seleccioná fecha y horario</p>
    </div>

    <div>
      <h3>3</h3>
      <p>Confirmá el pedido</p>
    </div>
          <div>
      <h3>4</h3>
      <p>Te avisamos cuando está listo</p>
    </div>
    <div>
      <h3>5</h3>
      <p>Recibí tu pedido</p>
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
            ❤️
          </strong>
        </span>

      </footer>

    </main>
  );
}