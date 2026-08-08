import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';
// Reemplaza window.alert por el modal <AppAlertHost>; todas las llamadas alert() usan el componente.
import { showAppAlert as alert } from '../utils/appAlert';
import { comprimirImagen } from '../utils/imagenes';

const emptyBundle = {
  type: 'pack',
  name: '',
  description: '',
  image_url: '',
  valid_from: '',
  valid_until: '',
  active: true,
  sort_order: 0,
  items: []
};

const formatSupabaseError = (error) => [
  error.message,
  error.code ? `Código: ${error.code}` : '',
  error.details ? `Detalle: ${error.details}` : '',
  error.hint ? `Ayuda: ${error.hint}` : ''
].filter(Boolean).join('\n');

const currency = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const formatPrice = (value) => currency.format(Number(value || 0));

const typeLabel = (type) => (type === 'promo' ? 'Promo' : 'Pack');

export default function BundlesPanel({
  user,
  onDataChanged,
  adminProfileSummary = null,
  companySlug,
  packsHabilitados = false,
  promosHabilitadas = false
}) {
  const [bundles, setBundles] = useState([]);
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBundleId, setEditingBundleId] = useState(null);
  const [bundleForm, setBundleForm] = useState(emptyBundle);
  const [serviceToAdd, setServiceToAdd] = useState('');

  const internalAdminAccountId = user?.isInternal && user?.role === 'admin' ? user.id : null;
  const internalSessionToken = user?.isInternal ? user.sessionToken : null;

  const activeServices = useMemo(() => services.filter((service) => service.active !== false), [services]);
  const servicesById = useMemo(() => {
    const map = new Map();
    services.forEach((service) => map.set(String(service.id), service));
    return map;
  }, [services]);

  const defaultType = packsHabilitados ? 'pack' : 'promo';
  const canChooseType = packsHabilitados && promosHabilitadas;

  const loadBundles = useCallback(async () => {
    setIsLoading(true);

    const [bundlesResult, adminResult] = await Promise.all([
      supabase.rpc('get_admin_bundles', {
        account_id_value: internalAdminAccountId,
        session_token_value: internalSessionToken,
        company_slug_value: companySlug
      }),
      supabase.rpc('get_admin_panel_data', {
        account_id_value: internalAdminAccountId,
        session_token_value: internalSessionToken,
        request_status_value: null,
        company_slug_value: companySlug
      })
    ]);

    if (bundlesResult.error) {
      alert(`No se pudieron cargar los combos. ${formatSupabaseError(bundlesResult.error)}`);
      setIsLoading(false);
      return;
    }

    if (adminResult.error) {
      alert(`No se pudieron cargar los servicios. ${formatSupabaseError(adminResult.error)}`);
    }

    setBundles(Array.isArray(bundlesResult.data) ? bundlesResult.data : []);
    setServices(adminResult.data?.services || []);
    setIsLoading(false);
  }, [internalAdminAccountId, internalSessionToken, companySlug]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadBundles();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadBundles]);

  const resetForm = () => {
    setBundleForm(emptyBundle);
    setEditingBundleId(null);
    setServiceToAdd('');
    setIsFormOpen(false);
  };

  const openNewBundle = () => {
    setBundleForm({ ...emptyBundle, type: defaultType, sort_order: bundles.length });
    setEditingBundleId(null);
    setServiceToAdd('');
    setIsFormOpen(true);
  };

  const openEditBundle = (bundle) => {
    setBundleForm({
      type: bundle.type === 'promo' ? 'promo' : 'pack',
      name: bundle.name || '',
      description: bundle.description || '',
      image_url: bundle.image_url || '',
      valid_from: bundle.valid_from || '',
      valid_until: bundle.valid_until || '',
      active: bundle.active !== false,
      sort_order: Number(bundle.sort_order || 0),
      items: (bundle.items || [])
        .slice()
        .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
        .map((item) => ({
          service_id: String(item.service_id),
          price: item.price === null || item.price === undefined ? '' : String(item.price)
        }))
    });
    setEditingBundleId(bundle.id);
    setServiceToAdd('');
    setIsFormOpen(true);
  };

  const updateField = (field, value) => {
    setBundleForm((current) => ({ ...current, [field]: value }));
  };

  const setType = (type) => {
    setBundleForm((current) => ({
      ...current,
      type,
      valid_from: type === 'pack' ? '' : current.valid_from,
      valid_until: type === 'pack' ? '' : current.valid_until
    }));
  };

  const addItem = () => {
    if (!serviceToAdd) return;
    const normalizedId = String(serviceToAdd);
    setBundleForm((current) => {
      if (current.items.some((item) => String(item.service_id) === normalizedId)) {
        return current;
      }
      return { ...current, items: [...current.items, { service_id: normalizedId, price: '' }] };
    });
    setServiceToAdd('');
  };

  const removeItem = (index) => {
    setBundleForm((current) => ({
      ...current,
      items: current.items.filter((_, position) => position !== index)
    }));
  };

  const moveItem = (index, direction) => {
    setBundleForm((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.items.length) return current;
      const items = current.items.slice();
      const [moved] = items.splice(index, 1);
      items.splice(target, 0, moved);
      return { ...current, items };
    });
  };

  const updateItemPrice = (index, value) => {
    setBundleForm((current) => ({
      ...current,
      items: current.items.map((item, position) => (position === index ? { ...item, price: value } : item))
    }));
  };

  const updateImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Seleccioná una imagen válida para el combo.');
      return;
    }

    if (file.size > 750 * 1024) {
      alert('La imagen debe pesar menos de 750 KB.');
      return;
    }

    try {
      const imageUrl = await comprimirImagen(file, { ladoMaximo: 800, calidad: 0.72 });
      updateField('image_url', imageUrl);
    } catch (error) {
      alert(error.message);
    }
  };

  const itemUnitPrice = useCallback((item, type) => {
    if (type === 'pack') {
      return Number(servicesById.get(String(item.service_id))?.base_price || 0);
    }
    return Number(item.price || 0);
  }, [servicesById]);

  const formTotal = useMemo(() => (
    bundleForm.items.reduce((total, item) => total + itemUnitPrice(item, bundleForm.type), 0)
  ), [bundleForm.items, bundleForm.type, itemUnitPrice]);

  const bundleTotal = useCallback((bundle) => (
    (bundle.items || []).reduce((total, item) => total + (
      bundle.type === 'pack'
        ? Number(servicesById.get(String(item.service_id))?.base_price || 0)
        : Number(item.price || 0)
    ), 0)
  ), [servicesById]);

  const itemDisplayPrice = useCallback((bundle, item) => (
    bundle.type === 'pack'
      ? Number(servicesById.get(String(item.service_id))?.base_price || 0)
      : Number(item.price || 0)
  ), [servicesById]);

  const bundleItemsSorted = useCallback((bundle) => (
    (bundle.items || []).slice().sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
  ), []);

  const saveBundle = async () => {
    const trimmedName = bundleForm.name.trim();
    if (!trimmedName) {
      alert('El nombre del combo es obligatorio.');
      return;
    }

    if (bundleForm.items.length < 2) {
      alert('El combo debe incluir al menos 2 servicios.');
      return;
    }

    if (bundleForm.type === 'promo' && bundleForm.valid_from && bundleForm.valid_until && bundleForm.valid_until < bundleForm.valid_from) {
      alert('La fecha de fin de vigencia no puede ser anterior a la de inicio.');
      return;
    }

    const items = bundleForm.items.map((item, index) => ({
      service_id: item.service_id,
      position: index,
      price: bundleForm.type === 'promo' ? (Number(item.price) || 0) : null
    }));

    setIsSaving(true);

    const { error } = await supabase.rpc('save_admin_bundle', {
      bundle_id_value: editingBundleId,
      type_value: bundleForm.type,
      name_value: trimmedName,
      description_value: bundleForm.description.trim() || null,
      image_url_value: bundleForm.image_url || null,
      valid_from_value: bundleForm.type === 'promo' && bundleForm.valid_from ? bundleForm.valid_from : null,
      valid_until_value: bundleForm.type === 'promo' && bundleForm.valid_until ? bundleForm.valid_until : null,
      active_value: bundleForm.active,
      sort_order_value: Number(bundleForm.sort_order || 0),
      items_value: items,
      account_id_value: internalAdminAccountId,
      session_token_value: internalSessionToken,
      company_slug_value: companySlug
    });

    setIsSaving(false);

    if (error) {
      alert(`No se pudo guardar el combo. ${formatSupabaseError(error)}`);
      return;
    }

    resetForm();
    await loadBundles();
    onDataChanged?.();
  };

  const deleteBundle = async (bundle) => {
    if (!window.confirm(`¿Eliminar "${bundle.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    setIsSaving(true);

    const { error } = await supabase.rpc('delete_admin_bundle', {
      bundle_id_value: bundle.id,
      account_id_value: internalAdminAccountId,
      session_token_value: internalSessionToken,
      company_slug_value: companySlug
    });

    setIsSaving(false);

    if (error) {
      alert(`No se pudo eliminar el combo. ${formatSupabaseError(error)}`);
      return;
    }

    await loadBundles();
    onDataChanged?.();
  };

  const availableServicesToAdd = useMemo(
    () => activeServices.filter((service) => !bundleForm.items.some((item) => String(item.service_id) === String(service.id))),
    [activeServices, bundleForm.items]
  );

  return (
    <section className="admin-shell branches-admin-manager">
      <div className="admin-page-heading">
        <div>
          <h1>Packs y promos</h1>
          <p>Armá combos de servicios. Los packs suman el precio de catálogo; las promos tienen precio propio y vigencia.</p>
        </div>
        {adminProfileSummary}
      </div>

      {!isFormOpen && (
      <>
      <div className="branches-toolbar">
        <button className="agenda-close-button" type="button" onClick={openNewBundle} disabled={isSaving}>
          + Nuevo combo
        </button>
      </div>

      {isLoading ? (
        <p className="branches-empty">Cargando combos…</p>
      ) : bundles.length === 0 ? (
        <p className="branches-empty">Todavía no hay combos. Creá el primero con “Nuevo combo”.</p>
      ) : (
        <div className="branches-grid">
          {bundles.map((bundle) => (
            <article key={bundle.id} className={`branch-card ${bundle.active === false ? 'is-inactive' : ''}`}>
              <div className="branch-card-media" aria-hidden="true">
                {bundle.image_url ? <img src={bundle.image_url} alt="" /> : <span>{bundle.type === 'promo' ? '🔥' : '🎁'}</span>}
              </div>
              <div className="branch-card-body">
                <div className="branch-card-heading">
                  <h2>{bundle.name}</h2>
                  <span className={`bundle-type-tag ${bundle.type === 'promo' ? 'is-promo' : 'is-pack'}`}>
                    {typeLabel(bundle.type)}
                  </span>
                </div>
                {bundle.description && <p className="branch-card-line">{bundle.description}</p>}
                <ul className="bundle-card-items">
                  {bundleItemsSorted(bundle).map((item, index) => {
                    const service = servicesById.get(String(item.service_id));
                    return (
                      <li key={`${item.service_id}-${index}`}>
                        <span className="bundle-card-item-name">{service ? `${service.icon ? `${service.icon} ` : ''}${service.name}` : 'Servicio no disponible'}</span>
                        <span className="bundle-card-item-price">{formatPrice(itemDisplayPrice(bundle, item))}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="bundle-card-total">Total: <strong>{formatPrice(bundleTotal(bundle))}</strong></p>
                {bundle.type === 'promo' && (bundle.valid_from || bundle.valid_until) && (
                  <p className="branch-card-line">
                    Vigencia: {bundle.valid_from || '…'} → {bundle.valid_until || '…'}
                  </p>
                )}
                <p className="branch-card-meta">
                  <span className={`branch-status ${bundle.active === false ? 'is-off' : 'is-on'}`}>
                    {bundle.active === false ? 'Inactivo' : 'Activo'}
                  </span>
                </p>
                <div className="branch-card-actions">
                  <button className="agenda-option-button" type="button" onClick={() => openEditBundle(bundle)} disabled={isSaving}>
                    Editar
                  </button>
                  <button className="agenda-danger-button" type="button" onClick={() => deleteBundle(bundle)} disabled={isSaving}>
                    Eliminar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      </>
      )}

      {isFormOpen && (
        <div className="branch-form-page">
          <div className="branch-form-card branch-form-card-page">
            <button className="branch-form-back" type="button" onClick={resetForm} disabled={isSaving}>
              ← Volver a combos
            </button>
            <div className="branch-form-header">
              <h2>{editingBundleId ? 'Editar combo' : 'Nuevo combo'}</h2>
              <p>Elegí el tipo, los servicios y el orden en que se atienden.</p>
            </div>

            {canChooseType && (
              <div className="bundle-type-toggle">
                <button
                  type="button"
                  className={`bundle-type-option ${bundleForm.type === 'pack' ? 'is-active' : ''}`}
                  onClick={() => setType('pack')}
                >
                  🎁 Pack · precio de catálogo
                </button>
                <button
                  type="button"
                  className={`bundle-type-option ${bundleForm.type === 'promo' ? 'is-active' : ''}`}
                  onClick={() => setType('promo')}
                >
                  🔥 Promo · precio propio + vigencia
                </button>
              </div>
            )}

            <div className="branch-form-grid">
              <label className="branch-field branch-field-wide">
                <span>Nombre *</span>
                <input type="text" value={bundleForm.name} onChange={(event) => updateField('name', event.target.value)} placeholder={bundleForm.type === 'promo' ? 'Ej: Promo verano' : 'Ej: Pack relax'} />
              </label>

              <label className="branch-field branch-field-wide">
                <span>Descripción</span>
                <input type="text" value={bundleForm.description} onChange={(event) => updateField('description', event.target.value)} placeholder="Breve detalle del combo" />
              </label>

              {bundleForm.type === 'promo' && (
                <>
                  <label className="branch-field">
                    <span>Vigente desde</span>
                    <input type="date" value={bundleForm.valid_from} onChange={(event) => updateField('valid_from', event.target.value)} />
                  </label>
                  <label className="branch-field">
                    <span>Vigente hasta</span>
                    <input type="date" value={bundleForm.valid_until} onChange={(event) => updateField('valid_until', event.target.value)} />
                  </label>
                </>
              )}

              <div className="branch-field branch-field-wide">
                <span>Imagen del combo</span>
                <div className="branch-image-row">
                  <div className="branch-image-preview" aria-hidden="true">
                    {bundleForm.image_url ? <img src={bundleForm.image_url} alt="" /> : <span>{bundleForm.type === 'promo' ? '🔥' : '🎁'}</span>}
                  </div>
                  <div className="branch-image-actions">
                    <label className="agenda-option-button branch-upload-button">
                      Subir imagen
                      <input type="file" accept="image/*" onChange={updateImage} hidden />
                    </label>
                    {bundleForm.image_url && (
                      <button className="agenda-option-button" type="button" onClick={() => updateField('image_url', '')}>Quitar</button>
                    )}
                  </div>
                </div>
              </div>

              <label className="branch-field branch-toggle-field">
                <input type="checkbox" checked={bundleForm.active} onChange={(event) => updateField('active', event.target.checked)} />
                <span>Combo activo (visible para reservar)</span>
              </label>
            </div>

            <div className="branch-multiselect">
              <h3>Servicios del combo</h3>
              <p className="branch-multiselect-hint">
                Se reservan en este orden, uno tras otro sin huecos. Mínimo 2 servicios.
                {bundleForm.type === 'pack' ? ' El precio de cada servicio es el del catálogo.' : ' Definí el precio de cada servicio para la promo.'}
              </p>

              <div className="bundle-add-row">
                <select value={serviceToAdd} onChange={(event) => setServiceToAdd(event.target.value)}>
                  <option value="">Elegí un servicio…</option>
                  {availableServicesToAdd.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.icon ? `${service.icon} ` : ''}{service.name}
                    </option>
                  ))}
                </select>
                <button className="agenda-option-button" type="button" onClick={addItem} disabled={!serviceToAdd}>
                  Agregar
                </button>
              </div>

              {bundleForm.items.length === 0 ? (
                <p className="branch-multiselect-empty">Todavía no agregaste servicios.</p>
              ) : (
                <ol className="bundle-item-list">
                  {bundleForm.items.map((item, index) => {
                    const service = servicesById.get(String(item.service_id));
                    return (
                      <li key={`${item.service_id}-${index}`} className="bundle-item-row">
                        <span className="bundle-item-order">{index + 1}</span>
                        <span className="bundle-item-name">
                          {service ? `${service.icon ? `${service.icon} ` : ''}${service.name}` : 'Servicio no disponible'}
                          <small>{Number(service?.default_duration || 30)} min</small>
                        </span>
                        {bundleForm.type === 'pack' ? (
                          <span className="bundle-item-price is-catalog">{formatPrice(service?.base_price)}</span>
                        ) : (
                          <label className="bundle-item-price-field">
                            <span>$</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={item.price}
                              onChange={(event) => updateItemPrice(index, event.target.value)}
                              placeholder="0"
                            />
                          </label>
                        )}
                        <span className="bundle-item-actions">
                          <button type="button" className="bundle-item-move" onClick={() => moveItem(index, -1)} disabled={index === 0} aria-label="Subir">↑</button>
                          <button type="button" className="bundle-item-move" onClick={() => moveItem(index, 1)} disabled={index === bundleForm.items.length - 1} aria-label="Bajar">↓</button>
                          <button type="button" className="bundle-item-remove" onClick={() => removeItem(index)} aria-label="Quitar">✕</button>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {bundleForm.items.length > 0 && (
                <p className="bundle-total-line">
                  Precio total del combo: <strong>{formatPrice(formTotal)}</strong>
                </p>
              )}
            </div>

            <div className="branch-form-actions">
              <button className="agenda-option-button" type="button" onClick={resetForm} disabled={isSaving}>Cancelar</button>
              <button className="agenda-close-button" type="button" onClick={saveBundle} disabled={isSaving}>
                {isSaving ? 'Guardando…' : 'Guardar combo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
