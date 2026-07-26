import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';

const emptyBranch = {
  name: '',
  address_street: '',
  address_number: '',
  address_locality: '',
  phone: '',
  email: '',
  maps_url: '',
  image_url: '',
  active: true,
  sort_order: 0,
  serviceIds: []
};

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
  reader.readAsDataURL(file);
});

const formatSupabaseError = (error) => [
  error.message,
  error.code ? `Código: ${error.code}` : '',
  error.details ? `Detalle: ${error.details}` : '',
  error.hint ? `Ayuda: ${error.hint}` : ''
].filter(Boolean).join('\n');

const buildBranchAddress = (branch) => [
  [branch.address_street, branch.address_number].filter(Boolean).join(' '),
  branch.address_locality
].filter(Boolean).join(', ');

export default function BranchesPanel({ user, onDataChanged, adminProfileSummary = null, companySlug }) {
  const [branches, setBranches] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState(null);
  const [branchForm, setBranchForm] = useState(emptyBranch);

  const internalAdminAccountId = user?.isInternal && user?.role === 'admin' ? user.id : null;
  const internalSessionToken = user?.isInternal ? user.sessionToken : null;

  const activeServices = useMemo(() => services.filter((service) => service.active !== false), [services]);
  const activeEmployees = useMemo(() => employees.filter((employee) => employee.active !== false), [employees]);

  const loadBranches = useCallback(async () => {
    setIsLoading(true);

    const [branchesResult, adminResult] = await Promise.all([
      supabase.rpc('get_admin_branches', {
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

    if (branchesResult.error) {
      alert(`No se pudieron cargar las sucursales. ${formatSupabaseError(branchesResult.error)}`);
      setIsLoading(false);
      return;
    }

    if (adminResult.error) {
      alert(`No se pudieron cargar servicios y empleados. ${formatSupabaseError(adminResult.error)}`);
    }

    setBranches(Array.isArray(branchesResult.data) ? branchesResult.data : []);
    setEmployees(adminResult.data?.employees || []);
    setServices(adminResult.data?.services || []);
    setIsLoading(false);
  }, [internalAdminAccountId, internalSessionToken, companySlug]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadBranches();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadBranches]);

  const resetForm = () => {
    setBranchForm(emptyBranch);
    setEditingBranchId(null);
    setIsFormOpen(false);
  };

  const openNewBranch = () => {
    setBranchForm({ ...emptyBranch, sort_order: branches.length });
    setEditingBranchId(null);
    setIsFormOpen(true);
  };

  const openEditBranch = (branch) => {
    setBranchForm({
      name: branch.name || '',
      address_street: branch.address_street || '',
      address_number: branch.address_number || '',
      address_locality: branch.address_locality || '',
      phone: branch.phone || '',
      email: branch.email || '',
      maps_url: branch.maps_url || '',
      image_url: branch.image_url || '',
      active: branch.active !== false,
      sort_order: Number(branch.sort_order || 0),
      serviceIds: (branch.service_ids || []).map((id) => String(id))
    });
    setEditingBranchId(branch.id);
    setIsFormOpen(true);
  };

  const updateField = (field, value) => {
    setBranchForm((current) => ({ ...current, [field]: value }));
  };

  const toggleService = (serviceId) => {
    const normalizedId = String(serviceId);
    setBranchForm((current) => ({
      ...current,
      serviceIds: current.serviceIds.includes(normalizedId)
        ? current.serviceIds.filter((id) => id !== normalizedId)
        : [...current.serviceIds, normalizedId]
    }));
  };

  const updateImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Seleccioná una imagen válida para la sucursal.');
      return;
    }

    if (file.size > 750 * 1024) {
      alert('La imagen debe pesar menos de 750 KB.');
      return;
    }

    try {
      const imageUrl = await fileToDataUrl(file);
      updateField('image_url', imageUrl);
    } catch (error) {
      alert(error.message);
    }
  };

  const saveBranch = async () => {
    const trimmedName = branchForm.name.trim();
    if (!trimmedName) {
      alert('El nombre de la sucursal es obligatorio.');
      return;
    }

    if (branchForm.email.trim() && !isValidEmail(branchForm.email)) {
      alert('El email de la sucursal no es válido.');
      return;
    }

    setIsSaving(true);

    const { error } = await supabase.rpc('save_admin_branch', {
      branch_id_value: editingBranchId,
      name_value: trimmedName,
      address_street_value: branchForm.address_street.trim() || null,
      address_number_value: branchForm.address_number.trim() || null,
      address_locality_value: branchForm.address_locality.trim() || null,
      phone_value: branchForm.phone.trim() || null,
      email_value: branchForm.email.trim() || null,
      maps_url_value: branchForm.maps_url.trim() || null,
      image_url_value: branchForm.image_url || null,
      active_value: branchForm.active,
      sort_order_value: Number(branchForm.sort_order || 0),
      service_ids_value: branchForm.serviceIds,
      employee_ids_value: activeEmployees.map((employee) => String(employee.id)),
      account_id_value: internalAdminAccountId,
      session_token_value: internalSessionToken,
      company_slug_value: companySlug
    });

    setIsSaving(false);

    if (error) {
      alert(`No se pudo guardar la sucursal. ${formatSupabaseError(error)}`);
      return;
    }

    resetForm();
    await loadBranches();
    onDataChanged?.();
  };

  const deleteBranch = async (branch) => {
    if (!window.confirm(`¿Eliminar la sucursal "${branch.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    setIsSaving(true);

    const { error } = await supabase.rpc('delete_admin_branch', {
      branch_id_value: branch.id,
      account_id_value: internalAdminAccountId,
      session_token_value: internalSessionToken,
      company_slug_value: companySlug
    });

    setIsSaving(false);

    if (error) {
      alert(`No se pudo eliminar la sucursal. ${formatSupabaseError(error)}`);
      return;
    }

    await loadBranches();
    onDataChanged?.();
  };

  return (
    <section className="admin-shell branches-admin-manager">
      <div className="admin-page-heading">
        <div>
          <h1>Sucursales</h1>
          <p>Gestioná los locales, sus datos de contacto y qué servicios y equipo atienden en cada uno.</p>
        </div>
        {adminProfileSummary}
      </div>

      {!isFormOpen && (
      <>
      <div className="branches-toolbar">
        <button className="agenda-close-button" type="button" onClick={openNewBranch} disabled={isSaving}>
          + Nueva sucursal
        </button>
      </div>

      {isLoading ? (
        <p className="branches-empty">Cargando sucursales…</p>
      ) : branches.length === 0 ? (
        <p className="branches-empty">Todavía no hay sucursales. Creá la primera con “Nueva sucursal”.</p>
      ) : (
        <div className="branches-grid">
          {branches.map((branch) => (
            <article key={branch.id} className={`branch-card ${branch.active === false ? 'is-inactive' : ''}`}>
              <div className="branch-card-media" aria-hidden="true">
                {branch.image_url ? <img src={branch.image_url} alt="" /> : <span>🏢</span>}
              </div>
              <div className="branch-card-body">
                <div className="branch-card-heading">
                  <h2>{branch.name}</h2>
                  <span className={`branch-status ${branch.active === false ? 'is-off' : 'is-on'}`}>
                    {branch.active === false ? 'Inactiva' : 'Activa'}
                  </span>
                </div>
                {buildBranchAddress(branch) && <p className="branch-card-line">📍 {buildBranchAddress(branch)}</p>}
                {branch.phone && <p className="branch-card-line">📞 {branch.phone}</p>}
                {branch.email && <p className="branch-card-line">✉️ {branch.email}</p>}
                {branch.maps_url && (
                  <a className="branch-card-maps" href={branch.maps_url} target="_blank" rel="noopener noreferrer">Cómo llegar</a>
                )}
                <p className="branch-card-meta">
                  {(branch.service_ids || []).length} servicios · {(branch.employee_ids || []).length} en el equipo
                </p>
                <div className="branch-card-actions">
                  <button className="agenda-option-button" type="button" onClick={() => openEditBranch(branch)} disabled={isSaving}>
                    Editar
                  </button>
                  <button className="agenda-danger-button" type="button" onClick={() => deleteBranch(branch)} disabled={isSaving}>
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
              ← Volver a sucursales
            </button>
            <div className="branch-form-header">
              <h2>{editingBranchId ? 'Editar sucursal' : 'Nueva sucursal'}</h2>
              <p>Definí los datos del local y qué se ofrece ahí.</p>
            </div>

            <div className="branch-form-grid">
              <label className="branch-field branch-field-wide">
                <span>Nombre *</span>
                <input type="text" value={branchForm.name} onChange={(event) => updateField('name', event.target.value)} placeholder="Ej: Masajes Bernal" />
              </label>

              <label className="branch-field">
                <span>Calle</span>
                <input type="text" value={branchForm.address_street} onChange={(event) => updateField('address_street', event.target.value)} />
              </label>
              <label className="branch-field">
                <span>Número</span>
                <input type="text" value={branchForm.address_number} onChange={(event) => updateField('address_number', event.target.value)} />
              </label>
              <label className="branch-field">
                <span>Localidad</span>
                <input type="text" value={branchForm.address_locality} onChange={(event) => updateField('address_locality', event.target.value)} />
              </label>

              <label className="branch-field">
                <span>Teléfono</span>
                <input type="text" value={branchForm.phone} onChange={(event) => updateField('phone', event.target.value)} />
              </label>
              <label className="branch-field">
                <span>Email</span>
                <input type="email" value={branchForm.email} onChange={(event) => updateField('email', event.target.value)} placeholder="local@empresa.com" />
              </label>
              <label className="branch-field branch-field-wide">
                <span>Cómo llegar (link Google Maps)</span>
                <input type="url" value={branchForm.maps_url} onChange={(event) => updateField('maps_url', event.target.value)} placeholder="https://maps.google.com/…" />
              </label>

              <div className="branch-field branch-field-wide">
                <span>Imagen del local</span>
                <div className="branch-image-row">
                  <div className="branch-image-preview" aria-hidden="true">
                    {branchForm.image_url ? <img src={branchForm.image_url} alt="" /> : <span>🏢</span>}
                  </div>
                  <div className="branch-image-actions">
                    <label className="agenda-option-button branch-upload-button">
                      Subir imagen
                      <input type="file" accept="image/*" onChange={updateImage} hidden />
                    </label>
                    {branchForm.image_url && (
                      <button className="agenda-option-button" type="button" onClick={() => updateField('image_url', '')}>Quitar</button>
                    )}
                  </div>
                </div>
              </div>

              <label className="branch-field branch-toggle-field">
                <input type="checkbox" checked={branchForm.active} onChange={(event) => updateField('active', event.target.checked)} />
                <span>Sucursal activa (visible para reservar)</span>
              </label>
            </div>

            <div className="branch-multiselect">
              <h3>Servicios que se ofrecen acá</h3>
              {activeServices.length === 0 ? (
                <p className="branch-multiselect-empty">No hay servicios activos.</p>
              ) : (
                <div className="branch-chip-list">
                  {activeServices.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      className={`branch-chip ${branchForm.serviceIds.includes(String(service.id)) ? 'is-selected' : ''}`}
                      onClick={() => toggleService(service.id)}
                    >
                      {service.icon ? `${service.icon} ` : ''}{service.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="branch-multiselect">
              <h3>Equipo que atiende acá</h3>
              <p className="branch-multiselect-hint">Todos los empleados figuran en cada sucursal. La sucursal donde atiende cada uno se define por su disponibilidad.</p>
              {activeEmployees.length === 0 ? (
                <p className="branch-multiselect-empty">No hay empleados activos.</p>
              ) : (
                <div className="branch-chip-list">
                  {activeEmployees.map((employee) => (
                    <span
                      key={employee.id}
                      className="branch-chip is-selected branch-chip-static"
                    >
                      {employee.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="branch-form-actions">
              <button className="agenda-option-button" type="button" onClick={resetForm} disabled={isSaving}>Cancelar</button>
              <button className="agenda-close-button" type="button" onClick={saveBranch} disabled={isSaving}>
                {isSaving ? 'Guardando…' : 'Guardar sucursal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
