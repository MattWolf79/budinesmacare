import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';

const emptyPromotion = () => ({
  enabled: false,
  title: '',
  description: '',
  value: '',
  price: '',
  employeeIds: []
});

const emptyDiscount = () => ({
  enabled: true,
  discountType: 'general',
  id: '',
  name: '',
  description: '',
  valueType: 'percent',
  value: '',
  percent: '',
  scope: 'both'
});

const parseMoney = (value) => {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  return Number(normalized) || 0;
};

const formatMoney = (value) => new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0
}).format(Number(value) || 0);

const getActivityCheckDisplayName = (discount, activityIndex) => String(discount?.name || '').trim() || `Check ${activityIndex + 1}`;

const normalizePromotions = (promotions) => {
  const source = Array.isArray(promotions) && promotions.length ? promotions : [emptyPromotion(), emptyPromotion()];

  return source.map((promotion) => ({
    enabled: Boolean(promotion?.enabled),
    title: String(promotion?.title || ''),
    description: String(promotion?.description || ''),
    value: String(promotion?.value || ''),
    price: promotion?.price === 0 || promotion?.price ? String(promotion.price) : String(parseMoney(promotion?.value) || ''),
    employeeIds: Array.isArray(promotion?.employeeIds) ? promotion.employeeIds.map(String) : []
  }));
};

const normalizeDiscounts = (discounts) => {
  const source = Array.isArray(discounts) ? discounts : [];

  return source.map((discount) => ({
    enabled: discount?.enabled !== false,
    discountType: ['general', 'activity'].includes(discount?.discountType) ? discount.discountType : 'general',
    id: String(discount?.id || ''),
    name: String(discount?.name || ''),
    description: String(discount?.description || ''),
    valueType: ['percent', 'amount'].includes(discount?.valueType) ? discount.valueType : 'percent',
    value: discount?.value === 0 || discount?.value ? String(discount.value) : (discount?.percent === 0 || discount?.percent ? String(discount.percent) : ''),
    percent: discount?.percent === 0 || discount?.percent ? String(discount.percent) : '',
    scope: ['line', 'total', 'both'].includes(discount?.scope) ? discount.scope : 'both',
    serviceIds: Array.isArray(discount?.serviceIds) ? discount.serviceIds.map(String) : []
  }));
};

const defaultConfig = {
  company_name: 'QuieroTurnoApp',
  business_hours_text: '',
  welcome_background_data_url: '',
  welcome_background_file_name: '',
  welcome_background_mime_type: '',
  banner_data_url: '',
  banner_file_name: '',
  banner_mime_type: '',
  banner_images: [],
  promotions: [emptyPromotion(), emptyPromotion()],
  discounts: [],
  client_can_choose_employee: false
};

const normalizeBannerImages = (config) => {
  const bannerImages = Array.isArray(config?.banner_images) ? config.banner_images : [];
  const normalizedImages = bannerImages
    .filter((image) => image?.dataUrl)
    .slice(0, 4)
    .map((image) => ({
      dataUrl: String(image.dataUrl || ''),
      fileName: String(image.fileName || ''),
      mimeType: String(image.mimeType || '')
    }));

  if (!normalizedImages.length && config?.banner_data_url) {
    return [{
      dataUrl: String(config.banner_data_url || ''),
      fileName: String(config.banner_file_name || ''),
      mimeType: String(config.banner_mime_type || '')
    }];
  }

  return normalizedImages;
};

export default function AdminSettingsPanel({ user, adminProfileSummary = null }) {
  const [savedConfig, setSavedConfig] = useState(defaultConfig);
  const [form, setForm] = useState(defaultConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [bookingPreferencesOpen, setBookingPreferencesOpen] = useState(false);
  const [businessHoursOpen, setBusinessHoursOpen] = useState(false);
  const [promotionsOpen, setPromotionsOpen] = useState(false);
  const [discountsOpen, setDiscountsOpen] = useState(false);
  const [activityChecksOpen, setActivityChecksOpen] = useState(false);
  const [selectedActivityCheckIndex, setSelectedActivityCheckIndex] = useState(null);

  const enabledPromotions = useMemo(() => (
    form.promotions.filter((promotion) => promotion.enabled)
  ), [form.promotions]);
  const previewBannerImages = useMemo(() => {
    if (!form.banner_images.length) return [];
    return Array.from({ length: 4 }, (_, index) => form.banner_images[index % form.banner_images.length]);
  }, [form.banner_images]);
  const generalDiscounts = useMemo(() => form.discounts.map((discount, index) => ({ discount, index })).filter(({ discount }) => discount.discountType !== 'activity'), [form.discounts]);
  const activityDiscounts = useMemo(() => form.discounts.map((discount, index) => ({ discount, index })).filter(({ discount }) => discount.discountType === 'activity'), [form.discounts]);
  const selectedActivityCheck = useMemo(() => (
    activityDiscounts.find(({ index }) => index === selectedActivityCheckIndex) || activityDiscounts[0] || null
  ), [activityDiscounts, selectedActivityCheckIndex]);
  const isActivityChecksBodyOpen = activityChecksOpen;

  const applyConfig = (config) => {
    const bannerImages = normalizeBannerImages(config);
    const firstBanner = bannerImages[0] || {};
    const nextConfig = {
      company_name: String(config?.company_name || 'QuieroTurnoApp').trim() || 'QuieroTurnoApp',
      business_hours_text: String(config?.business_hours_text || ''),
      welcome_background_data_url: String(config?.welcome_background_data_url || ''),
      welcome_background_file_name: String(config?.welcome_background_file_name || ''),
      welcome_background_mime_type: String(config?.welcome_background_mime_type || ''),
      banner_data_url: firstBanner.dataUrl || config?.banner_data_url || '',
      banner_file_name: firstBanner.fileName || config?.banner_file_name || '',
      banner_mime_type: firstBanner.mimeType || config?.banner_mime_type || '',
      banner_images: bannerImages,
      promotions: normalizePromotions(config?.promotions),
      discounts: normalizeDiscounts(config?.discounts),
      client_can_choose_employee: Boolean(config?.client_can_choose_employee)
    };

    setSavedConfig(nextConfig);
    setForm(nextConfig);
    setSelectedActivityCheckIndex(null);
  };

  useEffect(() => {
    let active = true;

    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      const { data, error } = await supabase.rpc('get_app_configuration');

      if (!active) return;

      if (error) {
        alert('No se pudo cargar la configuración.');
        setIsLoading(false);
        return;
      }

      applyConfig(data || defaultConfig);
      setIsLoading(false);
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  const updatePromotion = (index, field, value) => {
    setForm((current) => ({
      ...current,
      promotions: current.promotions.map((promotion, promotionIndex) => (
        promotionIndex === index ? { ...promotion, [field]: value } : promotion
      ))
    }));
  };

  const addPromotion = () => {
    setForm((current) => ({
      ...current,
      promotions: [...current.promotions, emptyPromotion()]
    }));
    setPromotionsOpen(true);
  };

  const removePromotion = (index) => {
    setForm((current) => ({
      ...current,
      promotions: current.promotions.length > 1
        ? current.promotions.filter((_, promotionIndex) => promotionIndex !== index)
        : [emptyPromotion()]
    }));
  };

  const updateDiscount = (index, field, value) => {
    setForm((current) => ({
      ...current,
      discounts: current.discounts.map((discount, discountIndex) => (
        discountIndex === index ? { ...discount, [field]: value } : discount
      ))
    }));
  };

  const addDiscount = () => {
    setForm((current) => ({
      ...current,
      discounts: [...current.discounts, emptyDiscount()]
    }));
    setDiscountsOpen(true);
  };

  const addActivityDiscount = () => {
    setForm((current) => ({
      ...current,
      discounts: [...current.discounts, { ...emptyDiscount(), discountType: 'activity', scope: 'line' }]
    }));
    setSelectedActivityCheckIndex(form.discounts.length);
    setActivityChecksOpen(true);
  };

  const removeDiscount = (index) => {
    setForm((current) => ({
      ...current,
      discounts: current.discounts.filter((_, discountIndex) => discountIndex !== index)
    }));
    if (selectedActivityCheckIndex === index) setSelectedActivityCheckIndex(null);
  };

  const changeBanner = (event) => {
    const files = Array.from(event.target.files || []);

    if (!files.length) return;

    const availableSlots = 4 - form.banner_images.length;

    if (availableSlots <= 0) {
      alert('El carrusel permite hasta 4 imágenes.');
      event.target.value = '';
      return;
    }

    const selectedFiles = files.slice(0, availableSlots);

    if (selectedFiles.some((file) => !['image/jpeg', 'image/png'].includes(file.type))) {
      alert('Las imágenes del banner deben ser JPG o PNG.');
      event.target.value = '';
      return;
    }

    Promise.all(selectedFiles.map((file) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        dataUrl: String(reader.result || ''),
        fileName: file.name,
        mimeType: file.type
      });
      reader.readAsDataURL(file);
    }))).then((newImages) => {
      setForm((current) => ({
        ...current,
        banner_data_url: newImages[0]?.dataUrl || current.banner_data_url,
        banner_file_name: newImages[0]?.fileName || current.banner_file_name,
        banner_mime_type: newImages[0]?.mimeType || current.banner_mime_type,
        banner_images: [...current.banner_images, ...newImages].slice(0, 4)
      }));
    });

    event.target.value = '';
  };

  const changeWelcomeBackground = async (event) => {
    const [file] = Array.from(event.target.files || []);

    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      alert('El fondo de bienvenida debe ser JPG o PNG.');
      event.target.value = '';
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = () => {
        setForm((current) => ({
          ...current,
          welcome_background_data_url: String(reader.result || ''),
          welcome_background_file_name: file.name,
          welcome_background_mime_type: file.type
        }));
      };
      reader.readAsDataURL(file);
    } finally {
      event.target.value = '';
    }
  };

  const clearWelcomeBackground = () => {
    setForm((current) => ({
      ...current,
      welcome_background_data_url: '',
      welcome_background_file_name: '',
      welcome_background_mime_type: ''
    }));
  };

  const removeBannerImage = (index) => {
    setForm((current) => {
      const nextImages = current.banner_images.filter((_, imageIndex) => imageIndex !== index);
      const firstBanner = nextImages[0] || {};

      return {
        ...current,
        banner_data_url: firstBanner.dataUrl || '',
        banner_file_name: firstBanner.fileName || '',
        banner_mime_type: firstBanner.mimeType || '',
        banner_images: nextImages
      };
    });
  };

  const clearBanner = () => {
    setForm((current) => ({
      ...current,
      banner_data_url: '',
      banner_file_name: '',
      banner_mime_type: '',
      banner_images: []
    }));
  };

  const cancelChanges = () => {
    setForm(savedConfig);
    setPreviewOpen(false);
  };

  const saveConfig = async () => {
    setIsSaving(true);
    const promotionsPayload = form.promotions.map((promotion) => ({
      ...promotion,
      price: parseMoney(promotion.price)
    }));

    const invalidPercentDiscount = form.discounts.find((discount) => discount.enabled && discount.valueType === 'percent' && parseMoney(discount.value) > 100);
    if (invalidPercentDiscount) {
      alert(`El descuento ${invalidPercentDiscount.name || 'sin nombre'} no puede superar el 100%.`);
      setIsSaving(false);
      return;
    }

    let generalDiscountCounter = 0;
    let activityDiscountCounter = 0;
    const discountsPayload = form.discounts.map((discount) => {
      const isActivityCheck = discount.discountType === 'activity';
      if (isActivityCheck) activityDiscountCounter += 1;
      else generalDiscountCounter += 1;

      return {
        ...discount,
        id: discount.id || `${isActivityCheck ? 'check_actividad' : 'descuento'}_${String(isActivityCheck ? activityDiscountCounter : generalDiscountCounter).padStart(2, '0')}`,
        scope: isActivityCheck ? 'line' : discount.scope,
        value: discount.valueType === 'percent'
          ? Math.min(100, Math.max(0, parseMoney(discount.value)))
          : Math.max(0, parseMoney(discount.value)),
        percent: discount.valueType === 'percent' ? Math.min(100, Math.max(0, parseMoney(discount.value))) : 0,
        serviceIds: isActivityCheck && Array.isArray(discount.serviceIds) ? discount.serviceIds.map(String) : []
      };
    });

    const { data, error } = await supabase.rpc('save_admin_app_configuration', {
      company_name_value: form.company_name.trim() || null,
      business_hours_text_value: form.business_hours_text.trim(),
      welcome_background_data_url_value: form.welcome_background_data_url || null,
      welcome_background_file_name_value: form.welcome_background_file_name || null,
      welcome_background_mime_type_value: form.welcome_background_mime_type || null,
      banner_data_url_value: form.banner_data_url || null,
      banner_file_name_value: form.banner_file_name || null,
      banner_mime_type_value: form.banner_mime_type || null,
      banner_images_value: form.banner_images,
      promotions_value: promotionsPayload,
      discounts_value: discountsPayload,
      client_can_choose_employee_value: form.client_can_choose_employee,
      account_id_value: user?.isInternal ? user.id : null,
      session_token_value: user?.isInternal ? user.sessionToken : null
    });

    setIsSaving(false);

    if (error) {
      alert(`No se pudo guardar la configuración: ${error.message}`);
      return;
    }

    applyConfig(data || form);
    localStorage.setItem('turnos_app_configuration_updated_at', String(Date.now()));
    window.dispatchEvent(new CustomEvent('turnos-app-configuration-saved'));
    alert('Configuración guardada.');
  };

  const activityChecksSection = (
    <article className="admin-form-card settings-card settings-activity-check-card">
      <div className="agenda-modal-header settings-section-header admin-collapsible-form-header">
        <span>Check servicio</span>
        <button
          className="availability-form-toggle admin-collapsible-form-toggle"
          type="button"
          onClick={() => setActivityChecksOpen((current) => !current)}
          aria-expanded={isActivityChecksBodyOpen}
          aria-label={isActivityChecksBodyOpen ? 'Ocultar check servicio' : 'Mostrar check servicio'}
        >
          &gt;
        </button>
      </div>
      <div className="settings-check-summary-row">
        {activityDiscounts.length ? activityDiscounts.map(({ discount, index }, activityIndex) => (
          <button
            className={`settings-check-summary-chip ${selectedActivityCheck?.index === index ? 'is-selected' : ''}`}
            type="button"
            onClick={() => {
              setSelectedActivityCheckIndex(index);
              setActivityChecksOpen(true);
            }}
            key={`${discount.id || 'check'}-${activityIndex}`}
          >
            {getActivityCheckDisplayName(discount, activityIndex)}
          </button>
        )) : <span className="settings-empty-text">Sin checks creados.</span>}
      </div>
      <div className={`agenda-modal-body settings-promotion-grid settings-discount-grid settings-activity-check-grid admin-collapsible-form-body ${isActivityChecksBodyOpen ? 'is-open' : 'is-collapsed'}`}>
        <div className="settings-section-toolbar">
          <button className="agenda-option-button" type="button" onClick={addActivityDiscount}>Agregar check</button>
        </div>
        {isActivityChecksBodyOpen && (activityDiscounts.length === 0 ? (
          <p className="settings-empty-text">Todavía no hay checks configurados.</p>
        ) : selectedActivityCheck && (
          <div className="settings-promotion-card settings-discount-card settings-activity-check-form" key={selectedActivityCheck.index}>
            <label className="settings-check-row settings-activity-check-enabled">
              <input
                type="checkbox"
                checked={selectedActivityCheck.discount.enabled}
                onChange={(event) => updateDiscount(selectedActivityCheck.index, 'enabled', event.target.checked)}
              />
              <span>Habilitado</span>
            </label>
            <label>
              Nombre
              <input value={selectedActivityCheck.discount.name} onChange={(event) => updateDiscount(selectedActivityCheck.index, 'name', event.target.value)} placeholder="Peluqueria" />
            </label>
            <label>
              Modo
              <select value={selectedActivityCheck.discount.valueType} onChange={(event) => updateDiscount(selectedActivityCheck.index, 'valueType', event.target.value)}>
                <option value="percent">Porcentaje %</option>
                <option value="amount">Monto $</option>
              </select>
            </label>
            <label>
              Valor
              <input type="text" inputMode="decimal" value={selectedActivityCheck.discount.value} onChange={(event) => updateDiscount(selectedActivityCheck.index, 'value', event.target.value)} placeholder={selectedActivityCheck.discount.valueType === 'amount' ? '5000' : '10'} />
            </label>
            <p className="settings-empty-text settings-activity-check-preview">Se verá como {getActivityCheckDisplayName(selectedActivityCheck.discount, activityDiscounts.findIndex(({ index }) => index === selectedActivityCheck.index))}.</p>
            <div className="settings-activity-check-actions">
              <button className="agenda-option-button" type="button" onClick={() => removeDiscount(selectedActivityCheck.index)}>
                Eliminar
              </button>
              <button className="agenda-close-button" type="button" onClick={saveConfig} disabled={isSaving}>
                {isSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </article>
  );

  if (isLoading) {
    return <div className="admin-loading-card settings-loading-card">Cargando configuración...</div>;
  }

  return (
    <section className="admin-shell settings-shell">
      <div className="admin-page-heading settings-hero">
        <div>
          <h1>Configuración</h1>
          <p>Ajustá la experiencia, promociones y reglas de reserva.</p>
        </div>
        {adminProfileSummary}
      </div>

      <div className="admin-external-actions">
        <button className="admin-link-button admin-refresh-button" type="button" onClick={() => setPreviewOpen(true)}>
          Vista previa
        </button>
      </div>

      <div className="settings-layout">
        <article className="admin-form-card settings-card settings-company-card">
          <div className="agenda-modal-header admin-collapsible-form-header">
            <span>Nombre de la empresa</span>
            <button
              className="availability-form-toggle admin-collapsible-form-toggle"
              type="button"
              onClick={() => setCompanyOpen((current) => !current)}
              aria-expanded={companyOpen}
              aria-label={companyOpen ? 'Ocultar nombre de la empresa' : 'Mostrar nombre de la empresa'}
            >
              &gt;
            </button>
          </div>
          <div className={`agenda-modal-body settings-card-body admin-collapsible-form-body ${companyOpen ? 'is-open' : 'is-collapsed'}`}>
            <label>
              Texto del saludo de bienvenida
              <input
                value={form.company_name}
                maxLength={40}
                placeholder="Masajes Topbody"
                onChange={(event) => setForm((current) => ({ ...current, company_name: event.target.value }))}
              />
            </label>
            <p className="settings-empty-text">Se va a mostrar debajo de BIENVENIDA como: {form.company_name.trim() || 'QuieroTurnoApp'}</p>

            <label className="settings-upload-field">
              <span>Fondo de bienvenida JPG o PNG</span>
              <input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={changeWelcomeBackground} />
            </label>

            {form.welcome_background_data_url ? (
              <div className="settings-banner-preview settings-welcome-background-preview">
                <img src={form.welcome_background_data_url} alt="Fondo de bienvenida configurado" />
                <div>
                  <strong>{form.welcome_background_file_name || 'Fondo cargado'}</strong>
                  <button className="agenda-option-button" type="button" onClick={clearWelcomeBackground}>Quitar</button>
                </div>
              </div>
            ) : (
              <p className="settings-empty-text">Todavía no hay fondo cargado.</p>
            )}
          </div>
        </article>

        <article className="admin-form-card settings-card settings-banner-card">
          <div className="agenda-modal-header admin-collapsible-form-header">
            <span>Banner de presentación</span>
            <button
              className="availability-form-toggle admin-collapsible-form-toggle"
              type="button"
              onClick={() => setBannerOpen((current) => !current)}
              aria-expanded={bannerOpen}
              aria-label={bannerOpen ? 'Ocultar banner de presentación' : 'Mostrar banner de presentación'}
            >
              &gt;
            </button>
          </div>
          <div className={`agenda-modal-body settings-card-body admin-collapsible-form-body ${bannerOpen ? 'is-open' : 'is-collapsed'}`}>
            <label className="settings-upload-field">
              <span>Hasta 4 imágenes JPG o PNG</span>
              <input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" multiple onChange={changeBanner} />
            </label>

            {form.banner_images.length ? (
              <div className="settings-banner-preview-grid">
                {form.banner_images.map((image, index) => (
                  <div className="settings-banner-preview" key={`${image.fileName}-${index}`}>
                    <img src={image.dataUrl} alt={`Banner configurado ${index + 1}`} />
                    <div>
                      <strong>{image.fileName || `Imagen ${index + 1}`}</strong>
                      <button className="agenda-option-button" type="button" onClick={() => removeBannerImage(index)}>Quitar</button>
                    </div>
                  </div>
                ))}
                <button className="agenda-option-button" type="button" onClick={clearBanner}>Quitar todas</button>
              </div>
            ) : (
              <p className="settings-empty-text">Todavía no hay banner cargado.</p>
            )}
          </div>
        </article>

        <article className="admin-form-card settings-card settings-booking-preferences-card">
          <div className="agenda-modal-header admin-collapsible-form-header">
            <span>Preferencias de reserva</span>
            <button
              className="availability-form-toggle admin-collapsible-form-toggle"
              type="button"
              onClick={() => setBookingPreferencesOpen((current) => !current)}
              aria-expanded={bookingPreferencesOpen}
              aria-label={bookingPreferencesOpen ? 'Ocultar preferencias de reserva' : 'Mostrar preferencias de reserva'}
            >
              &gt;
            </button>
          </div>
          <div className={`agenda-modal-body settings-card-body admin-collapsible-form-body ${bookingPreferencesOpen ? 'is-open' : 'is-collapsed'}`}>
            <label className="settings-check-row">
              <input
                type="checkbox"
                checked={form.client_can_choose_employee}
                onChange={(event) => setForm((current) => ({ ...current, client_can_choose_employee: event.target.checked }))}
              />
              <span>Permitir que el cliente elija el empleado al reservar</span>
            </label>
          </div>
        </article>

        {activityChecksSection}

        <article className="admin-form-card settings-card settings-business-hours-card">
          <div className="agenda-modal-header settings-section-header admin-collapsible-form-header">
            <span>Horario de atención</span>
            <button
              className="availability-form-toggle admin-collapsible-form-toggle"
              type="button"
              onClick={() => setBusinessHoursOpen((current) => !current)}
              aria-expanded={businessHoursOpen}
              aria-label={businessHoursOpen ? 'Ocultar horario de atención' : 'Mostrar horario de atención'}
            >
              &gt;
            </button>
          </div>
          <div className={`agenda-modal-body settings-card-body admin-collapsible-form-body ${businessHoursOpen ? 'is-open' : 'is-collapsed'}`}>
            <label className="settings-textarea-field">
              Texto visible en el banner de bienvenida
              <textarea
                value={form.business_hours_text}
                maxLength={500}
                placeholder="Abrimos de martes a viernes de 9 a 18 hs y sábados de 9 a 14 hs."
                onChange={(event) => setForm((current) => ({ ...current, business_hours_text: event.target.value }))}
              />
            </label>
            <p className="settings-empty-text">Se verá completo debajo del mensaje de bienvenida.</p>
          </div>
        </article>

        <article className="admin-form-card settings-card settings-promotions-card">
          <div className="agenda-modal-header settings-section-header admin-collapsible-form-header">
            <span>Promociones</span>
            <button
              className="availability-form-toggle admin-collapsible-form-toggle"
              type="button"
              onClick={() => setPromotionsOpen((current) => !current)}
              aria-expanded={promotionsOpen}
              aria-label={promotionsOpen ? 'Ocultar promociones' : 'Mostrar promociones'}
            >
              &gt;
            </button>
          </div>
          <div className={`agenda-modal-body settings-promotion-grid admin-collapsible-form-body ${promotionsOpen ? 'is-open' : 'is-collapsed'}`}>
            <div className="settings-section-toolbar">
              <button className="agenda-option-button" type="button" onClick={addPromotion}>Agregar promoción</button>
            </div>
            {promotionsOpen && form.promotions.map((promotion, index) => (
                <div className="settings-promotion-card settings-management-card" key={index}>
                  <div className="settings-management-card-header">
                    <strong>{promotion.title || `Promoción ${index + 1}`}</strong>
                  </div>
                  <label className="settings-check-row">
                    <input
                      type="checkbox"
                      checked={promotion.enabled}
                      onChange={(event) => updatePromotion(index, 'enabled', event.target.checked)}
                    />
                    <span>Habilitada</span>
                  </label>

                  <label>
                    Título
                    <input value={promotion.title} onChange={(event) => updatePromotion(index, 'title', event.target.value)} />
                  </label>
                  <label>
                    Descripción
                    <textarea value={promotion.description} onChange={(event) => updatePromotion(index, 'description', event.target.value)} />
                  </label>
                  <label>
                    Valor
                    <input value={promotion.value} onChange={(event) => updatePromotion(index, 'value', event.target.value)} />
                  </label>
                  <label>
                    Precio numérico
                    <input type="text" inputMode="decimal" value={promotion.price} onChange={(event) => updatePromotion(index, 'price', event.target.value)} placeholder="40000" />
                  </label>
                  <p className="settings-empty-text">Para cierres se usará {formatMoney(parseMoney(promotion.price))}.</p>

                  <button className="agenda-option-button" type="button" onClick={() => removePromotion(index)}>
                    Eliminar
                  </button>
                </div>
              ))}
          </div>
        </article>

        <article className="admin-form-card settings-card settings-promotions-card">
          <div className="agenda-modal-header settings-section-header admin-collapsible-form-header">
            <span>Descuentos</span>
            <button
              className="availability-form-toggle admin-collapsible-form-toggle"
              type="button"
              onClick={() => setDiscountsOpen((current) => !current)}
              aria-expanded={discountsOpen}
              aria-label={discountsOpen ? 'Ocultar descuentos' : 'Mostrar descuentos'}
            >
              &gt;
            </button>
          </div>
          <div className={`agenda-modal-body settings-promotion-grid settings-discount-grid admin-collapsible-form-body ${discountsOpen ? 'is-open' : 'is-collapsed'}`}>
            <div className="settings-section-toolbar">
              <button className="agenda-option-button" type="button" onClick={addDiscount}>Agregar descuento</button>
            </div>
            {discountsOpen && (generalDiscounts.length === 0 ? (
              <p className="settings-empty-text">Todavía no hay descuentos generales configurados.</p>
            ) : generalDiscounts.map(({ discount, index }) => (
              <div className="settings-promotion-card settings-discount-card settings-management-card" key={index}>
                <div className="settings-management-card-header">
                  <strong>{discount.name || `Descuento ${index + 1}`}</strong>
                </div>
                <label className="settings-check-row">
                  <input
                    type="checkbox"
                    checked={discount.enabled}
                    onChange={(event) => updateDiscount(index, 'enabled', event.target.checked)}
                  />
                  <span>Habilitado</span>
                </label>

                <label>
                  Nombre
                  <input value={discount.name} onChange={(event) => updateDiscount(index, 'name', event.target.value)} placeholder="Pago en efectivo" />
                </label>
                <label>
                  Modo
                  <select value={discount.valueType} onChange={(event) => updateDiscount(index, 'valueType', event.target.value)}>
                    <option value="percent">Porcentaje %</option>
                    <option value="amount">Monto $</option>
                  </select>
                </label>
                <label>
                  Valor
                  <input type="text" inputMode="decimal" value={discount.value} onChange={(event) => updateDiscount(index, 'value', event.target.value)} placeholder={discount.valueType === 'amount' ? '5000' : '10'} />
                </label>
                <label>
                  Aplica en
                  <select value={discount.scope} onChange={(event) => updateDiscount(index, 'scope', event.target.value)}>
                    <option value="line">Cada servicio</option>
                    <option value="total">Total del cierre</option>
                    <option value="both">Ambos</option>
                  </select>
                </label>
                <label>
                  Motivo
                  <textarea value={discount.description} onChange={(event) => updateDiscount(index, 'description', event.target.value)} placeholder="Ej: descuento por pago en efectivo" />
                </label>

                <button className="agenda-option-button" type="button" onClick={() => removeDiscount(index)}>
                  Eliminar
                </button>
              </div>
            )))}
          </div>
        </article>

      </div>

      <div className="settings-actions">
        <button className="agenda-option-button" type="button" onClick={cancelChanges} disabled={isSaving}>Cancelar</button>
        <button className="agenda-close-button" type="button" onClick={saveConfig} disabled={isSaving}>
          {isSaving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>

      {previewOpen && (
        <div className="modal">
          <div className="agenda-modal-card settings-preview-modal">
            <div className="agenda-modal-header settings-section-header">
              <span>Vista previa cliente</span>
              <button className="agenda-option-button" type="button" onClick={() => setPreviewOpen(false)}>Cerrar</button>
            </div>
            <div className="agenda-modal-body settings-preview-body role-workspace role-workspace-client">
              <section
                className={`role-workspace-hero client-welcome-hero settings-preview-hero ${form.welcome_background_data_url ? 'has-custom-background' : ''}`}
                style={form.welcome_background_data_url ? { backgroundImage: `url(${form.welcome_background_data_url})` } : undefined}
              >
                <div>
                  <p className="admin-kicker">Bienvenida</p>
                  <h1><span className="client-welcome-name">{form.company_name.trim() || 'QuieroTurnoApp'}</span></h1>
                  <p>Consultá tus próximos turnos y elegí un servicio cuando quieras reservar.</p>
                  {form.business_hours_text.trim() && <p className="client-business-hours-text">{form.business_hours_text.trim()}</p>}
                </div>
              </section>

              {previewBannerImages.length > 0 && (
                <div className="client-home-banner-strip settings-preview-carousel">
                  {previewBannerImages.map((image, index) => (
                    <div
                      className="client-home-banner"
                      role="img"
                      aria-label={`Presentación de la empresa ${index + 1}`}
                      key={`${image.fileName || 'banner'}-${index}`}
                      style={{ backgroundImage: `url(${image.dataUrl})` }}
                    />
                  ))}
                </div>
              )}

              <div className="client-summary-panel settings-preview-summary">
                <div className="client-summary-header"><h2>Próximos turnos</h2></div>
                <div className="client-booking-list">
                  <article className="client-booking-card settings-preview-booking">
                    <div className="client-card-header">
                      <strong>Servicio ejemplo</strong>
                    </div>
                    <div className="client-card-fields">
                      <div className="client-card-field">
                        <span>Fecha</span>
                        <strong>jue 09/07</strong>
                      </div>
                      <div className="client-card-field">
                        <span>Horario</span>
                        <strong>10:00 - 10:30</strong>
                      </div>
                      <div className="client-card-field client-card-status-field">
                        <span>Estado</span>
                        <strong className="is-active">Confirmado</strong>
                      </div>
                    </div>
                  </article>
                </div>
              </div>

              {enabledPromotions.length > 0 && (
                <section className="client-promotions-panel">
                  <h2>Promociones</h2>
                  <div className="client-promotions-grid">
                    {enabledPromotions.map((promotion, index) => (
                      <article className="client-promotion-card" key={index}>
                        <div className="client-card-header">
                          <strong>{promotion.title || 'Promoción'}</strong>
                        </div>
                        <div className="client-card-fields">
                          <div className="client-card-field client-card-field-wide">
                            <span>Detalle</span>
                            <strong>{promotion.description || 'Descripción de la promoción'}</strong>
                          </div>
                          <div className="client-card-field client-card-field-wide client-card-price-field">
                            <span>Precio</span>
                            <strong>{promotion.value || 'Valor'}</strong>
                          </div>
                        </div>
                        <button className="client-welcome-action client-promotion-action" type="button">
                          Reservar turno
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
