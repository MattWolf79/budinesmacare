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


const WhatsAppIcon = ({ size = 18 }) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    aria-hidden="true"
    focusable="false"
  >
    <path
      fill="#25D366"
      d="M16.004 3C9.376 3 4 8.373 4 15c0 2.34.65 4.53 1.78 6.4L4 29l7.79-1.75A11.94 11.94 0 0 0 16 27c6.628 0 12-5.373 12-12S22.632 3 16.004 3Z"
    />
    <path
      fill="#fff"
      d="M22.36 19.34c-.28-.14-1.65-.81-1.9-.9-.26-.1-.45-.14-.63.14-.19.28-.73.9-.9 1.09-.16.19-.33.21-.61.07-.28-.14-1.18-.44-2.25-1.4-.83-.74-1.4-1.66-1.56-1.94-.16-.28-.02-.43.12-.57.13-.13.28-.33.42-.5.14-.16.19-.28.28-.47.09-.19.05-.35-.02-.5-.07-.14-.63-1.53-.87-2.1-.23-.55-.46-.48-.63-.49h-.54c-.19 0-.5.07-.76.35-.26.28-1 1-1 2.42 0 1.43 1.02 2.81 1.16 3 .14.19 2.01 3.07 4.87 4.31.68.29 1.21.47 1.62.6.68.22 1.3.19 1.79.11.55-.08 1.65-.67 1.88-1.32.23-.65.23-1.2.16-1.32-.07-.12-.26-.19-.54-.33Z"
    />
  </svg>
);


const InstagramIcon = ({ size = 18 }) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <radialGradient id="landing-ig-gradient" cx="0.3" cy="1" r="1.1">
        <stop offset="0%" stopColor="#ffdd55" />
        <stop offset="30%" stopColor="#ff543e" />
        <stop offset="60%" stopColor="#c837ab" />
        <stop offset="100%" stopColor="#5851db" />
      </radialGradient>
    </defs>
    <rect
      x="3"
      y="3"
      width="26"
      height="26"
      rx="7"
      fill="url(#landing-ig-gradient)"
    />
    <circle
      cx="16"
      cy="16"
      r="6"
      fill="none"
      stroke="#fff"
      strokeWidth="2"
    />
    <circle
      cx="22.6"
      cy="9.4"
      r="1.4"
      fill="#fff"
    />
  </svg>
);


const TransferIcon = ({ size = 18 }) => (
  <span
    aria-hidden="true"
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      borderRadius: '50%',
      background: '#2f9e63',
      color: '#fff',
      fontSize: Math.round(size * 0.72),
      fontWeight: 800,
      lineHeight: 1,
      flexShrink: 0
    }}
  >
    $
  </span>
);


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

    const alias =
    landing.alias ||
    'macare.budines';

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
      alias ||
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


          <div className="landing-nav-actions-col">

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

            {(whatsappLink || instagram || alias) && (
              <ul className="landing-hero-quicklinks">

                {whatsappLink && (
                  <li className="landing-hero-quicklink">
                    <WhatsAppIcon size={13} />
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
                  <li className="landing-hero-quicklink">
                    <InstagramIcon size={13} />
                    <a
                      href={`https://instagram.com/${instagram}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      @{instagram}
                    </a>
                  </li>
                )}

                {alias && (
                  <li className="landing-hero-quicklink">
                    <TransferIcon size={13} />
                    <span className="landing-hero-quicklink-alias">
                      Alias: {alias}
                    </span>
                  </li>
                )}

              </ul>
            )}

          </div>

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

                  <WhatsAppIcon />

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

                  <InstagramIcon />

                  <a
                    href={`https://instagram.com/${instagram}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    @{instagram}
                  </a>

                </li>
              )}


              {alias && (
                <li className="landing-contact-item">

                  <TransferIcon />

                  <span className="landing-contact-item-alias">
                    Alias: {alias}
                  </span>

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