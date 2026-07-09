import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';

const emptyPromotion = () => ({
  enabled: false,
  title: '',
  description: '',
  value: ''
});

const normalizePromotions = (promotions) => {
  const source = Array.isArray(promotions) && promotions.length ? promotions : [emptyPromotion(), emptyPromotion()];

  return source.map((promotion) => ({
    enabled: Boolean(promotion?.enabled),
    title: String(promotion?.title || ''),
    description: String(promotion?.description || ''),
    value: String(promotion?.value || '')
  }));
};

const defaultConfig = {
  banner_data_url: '',
  banner_file_name: '',
  banner_mime_type: '',
  promotions: [emptyPromotion(), emptyPromotion()],
  client_can_choose_employee: false
};

export default function AdminSettingsPanel({ user }) {
  const [savedConfig, setSavedConfig] = useState(defaultConfig);
  const [form, setForm] = useState(defaultConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const enabledPromotions = useMemo(() => (
    form.promotions.filter((promotion) => promotion.enabled)
  ), [form.promotions]);

  const applyConfig = (config) => {
    const nextConfig = {
      banner_data_url: config?.banner_data_url || '',
      banner_file_name: config?.banner_file_name || '',
      banner_mime_type: config?.banner_mime_type || '',
      promotions: normalizePromotions(config?.promotions),
      client_can_choose_employee: Boolean(config?.client_can_choose_employee)
    };

    setSavedConfig(nextConfig);
    setForm(nextConfig);
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
  };

  const removePromotion = (index) => {
    setForm((current) => ({
      ...current,
      promotions: current.promotions.length > 1
        ? current.promotions.filter((_, promotionIndex) => promotionIndex !== index)
        : [emptyPromotion()]
    }));
  };

  const changeBanner = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      alert('El banner debe ser JPG o PNG.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({
        ...current,
        banner_data_url: String(reader.result || ''),
        banner_file_name: file.name,
        banner_mime_type: file.type
      }));
    };
    reader.readAsDataURL(file);
  };

  const clearBanner = () => {
    setForm((current) => ({
      ...current,
      banner_data_url: '',
      banner_file_name: '',
      banner_mime_type: ''
    }));
  };

  const cancelChanges = () => {
    setForm(savedConfig);
    setPreviewOpen(false);
  };

  const saveConfig = async () => {
    setIsSaving(true);

    const { data, error } = await supabase.rpc('save_admin_app_configuration', {
      banner_data_url_value: form.banner_data_url || null,
      banner_file_name_value: form.banner_file_name || null,
      banner_mime_type_value: form.banner_mime_type || null,
      promotions_value: form.promotions,
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

  if (isLoading) {
    return <div className="admin-loading-card settings-loading-card">Cargando configuración...</div>;
  }

  return (
    <section className="admin-shell settings-shell">
      <div className="admin-hero settings-hero">
        <div>
          <p className="admin-kicker">Configuración</p>
          <h1>Inicio del cliente</h1>
        </div>
        <button className="agenda-close-button admin-refresh-button" type="button" onClick={() => setPreviewOpen(true)}>
          Vista previa
        </button>
      </div>

      <div className="settings-layout">
        <article className="admin-form-card settings-card">
          <div className="agenda-modal-header">Banner de presentación</div>
          <div className="agenda-modal-body settings-card-body">
            <label className="settings-upload-field">
              <span>Archivo JPG o PNG</span>
              <input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={changeBanner} />
            </label>

            {form.banner_data_url ? (
              <div className="settings-banner-preview">
                <img src={form.banner_data_url} alt="Banner configurado" />
                <div>
                  <strong>{form.banner_file_name || 'Banner cargado'}</strong>
                  <button className="agenda-option-button" type="button" onClick={clearBanner}>Quitar imagen</button>
                </div>
              </div>
            ) : (
              <p className="settings-empty-text">Todavía no hay banner cargado.</p>
            )}
          </div>
        </article>

        <article className="admin-form-card settings-card">
          <div className="agenda-modal-header">Preferencias de reserva</div>
          <div className="agenda-modal-body settings-card-body">
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

        <article className="admin-form-card settings-card settings-promotions-card">
          <div className="agenda-modal-header settings-section-header">
            <span>Promociones</span>
            <button className="agenda-option-button" type="button" onClick={addPromotion}>Agregar promoción</button>
          </div>
          <div className="agenda-modal-body settings-promotion-grid">
            {form.promotions.map((promotion, index) => (
              <div className="settings-promotion-card" key={index}>
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

                <button className="agenda-option-button" type="button" onClick={() => removePromotion(index)}>
                  Eliminar
                </button>
              </div>
            ))}
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
            <div className="agenda-modal-body settings-preview-body">
              <section className="role-workspace-hero client-welcome-hero settings-preview-hero">
                <div>
                  <p className="admin-kicker">Bienvenida</p>
                  <h1>Bienvenido a Turnos App</h1>
                  <p>Consultá tus próximos turnos y elegí una actividad cuando quieras reservar.</p>
                </div>
                <span className="role-workspace-icon" aria-hidden="true">🙋</span>
              </section>

              {form.banner_data_url && (
                <img className="client-home-banner" src={form.banner_data_url} alt="Presentación de la empresa" />
              )}

              <div className="client-summary-panel settings-preview-summary">
                <div className="client-summary-header"><h2>Próximos turnos</h2></div>
                <div className="client-booking-list">
                  <article className="client-booking-card settings-preview-booking">
                    <div><strong>Actividad ejemplo</strong><span>Turno confirmado · jue 09/07</span></div>
                    <time>10:00 - 10:30</time>
                  </article>
                </div>
              </div>

              {enabledPromotions.length > 0 && (
                <section className="client-promotions-panel">
                  <h2>Promociones</h2>
                  <div className="client-promotions-grid">
                    {enabledPromotions.map((promotion, index) => (
                      <article className="client-promotion-card" key={index}>
                        <strong>{promotion.title || 'Promoción'}</strong>
                        <p>{promotion.description || 'Descripción de la promoción'}</p>
                        <span>{promotion.value || 'Valor'}</span>
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
