import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient';
import { formatDisplayDateTime } from '../utils/dateFormat';
import { comprimirImagen } from '../utils/imagenes';
import { WorkspaceHero } from './WorkspaceHero';

const emptyClientForm = {
  firstName: '',
  lastName: '',
  dni: '',
  phoneCode: '+54',
  phoneNumber: '',
  email: '',
  birthDate: '',
  gender: '',
  addressStreet: '',
  addressNumber: '',
  addressLocality: '',
  notes: '',
  photoUrl: '',
  blocked: false
};

const phoneCodes = [
  { code: '+54', label: 'AR +54' },
  { code: '+598', label: 'UY +598' },
  { code: '+56', label: 'CL +56' },
  { code: '+55', label: 'BR +55' },
  { code: '+595', label: 'PY +595' },
  { code: '+591', label: 'BO +591' },
  { code: '+51', label: 'PE +51' },
  { code: '+34', label: 'ES +34' }
];

const genderOptions = [
  { value: '', label: 'Seleccionar género' },
  { value: 'female', label: 'Femenino' },
  { value: 'male', label: 'Masculino' },
  { value: 'other', label: 'Otro' },
  { value: 'unspecified', label: 'Prefiero no decir' }
];

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
const isValidDni = (value) => /^\d{7,10}$/.test(String(value || '').trim());

const bookingStatusLabels = {
  reserved: 'Reservado',
  confirmed: 'Confirmado',
  pending_assignment: 'Pendiente de asignar',
  cancelled: 'Cancelado'
};

const orderStatusLabels = {
  reserved: 'Pedido recibido',
  confirmed: 'Pedido confirmado',
  pending_assignment: 'Pedido recibido',
  waitlist: 'Pedido recibido',
  cancelled: 'Cancelado'
};

const formatSupabaseError = (error) => [
  error.message,
  error.hint ? `Ayuda: ${error.hint}` : ''
].filter(Boolean).join(' ');

const getInitials = (client) => {
  const label = client?.display_name || `${client?.first_name || ''} ${client?.last_name || ''}`;
  const parts = String(label).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return String(parts[0]?.[0] || 'C').toUpperCase();
};

const getWhatsappDigits = (phone) => String(phone || '').replace(/[^0-9]/g, '');

const splitPhone = (phone) => {
  const raw = String(phone || '').trim();
  if (!raw) return { phoneCode: '+54', phoneNumber: '' };

  const digits = raw.replace(/[^0-9+]/g, '');
  const match = phoneCodes.find(({ code }) => digits.startsWith(code) || digits.startsWith(code.replace('+', '')));

  if (match) {
    const codeDigits = match.code.replace('+', '');
    const withoutPlus = digits.replace(/^\+/, '');
    const number = withoutPlus.startsWith(codeDigits) ? withoutPlus.slice(codeDigits.length) : withoutPlus;
    return { phoneCode: match.code, phoneNumber: number };
  }

  return { phoneCode: '+54', phoneNumber: digits.replace(/^\+/, '') };
};

const buildAddress = (client) => [
  [client.address_street, client.address_number].filter(Boolean).join(' '),
  client.address_locality
].filter(Boolean).join(', ');

export default function ClientsPanel({ user, companySlug, companyContext = null, adminProfileSummary = null, onDataChanged, hideHeading = false }) {
  const [clients, setClients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('list');
  const [editingClientId, setEditingClientId] = useState(null);
  const [form, setForm] = useState(emptyClientForm);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [historyClient, setHistoryClient] = useState(null);
  const [historyBookings, setHistoryBookings] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const internalAccountId = user?.isInternal ? user.id : null;
  const internalSessionToken = user?.isInternal ? user.sessionToken : null;
  const configuracionOperativa = companyContext?.configuracion_operativa || {};
  const esModoPedido = configuracionOperativa.modo_operacion === 'pedido' || configuracionOperativa.usa_agenda === false;
  const etiquetaHistorial = esModoPedido ? 'pedidos' : 'turnos';
  const etiquetaItemHistorial = esModoPedido ? 'Producto' : 'Servicio';
  const etiquetasEstadoHistorial = esModoPedido ? orderStatusLabels : bookingStatusLabels;

  const loadClients = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');

    const { data, error } = await supabase.rpc('list_company_clients', {
      account_id_value: internalAccountId,
      session_token_value: internalSessionToken,
      company_slug_value: companySlug,
      search_value: null
    });

    if (error) {
      setLoadError(formatSupabaseError(error) || 'No se pudieron cargar los clientes.');
      setClients([]);
      setIsLoading(false);
      return;
    }

    setClients(Array.isArray(data) ? data : []);
    setIsLoading(false);
  }, [internalAccountId, internalSessionToken, companySlug]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => loadClients(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadClients]);

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;

    return clients.filter((client) => {
      const haystack = [
        client.display_name,
        client.first_name,
        client.last_name,
        client.phone,
        client.client_dni,
        client.email
      ].filter(Boolean).join(' ').toLowerCase();

      return haystack.includes(term);
    });
  }, [clients, search]);

  const openNewClient = () => {
    setForm(emptyClientForm);
    setEditingClientId(null);
    setFormError('');
    setMode('edit');
  };

  const openEditClient = (client) => {
    const { phoneCode, phoneNumber } = splitPhone(client.phone);
    setForm({
      firstName: client.first_name || '',
      lastName: client.last_name || '',
      dni: client.client_dni || '',
      phoneCode,
      phoneNumber,
      email: client.email || '',
      birthDate: client.birth_date || '',
      gender: client.gender || '',
      addressStreet: client.address_street || '',
      addressNumber: client.address_number || '',
      addressLocality: client.address_locality || '',
      notes: client.notes || '',
      photoUrl: client.photo_url || '',
      blocked: client.active === false
    });
    setEditingClientId(client.id);
    setFormError('');
    setMode('edit');
  };

  const backToList = () => {
    setMode('list');
    setEditingClientId(null);
    setForm(emptyClientForm);
    setFormError('');
  };

  const openHistory = async (client) => {
    setHistoryClient(client);
    setHistoryBookings([]);
    setHistoryError('');
    setHistoryLoading(true);

    const { data, error } = await supabase.rpc('get_company_client_bookings', {
      client_id_value: client.id,
      account_id_value: internalAccountId,
      session_token_value: internalSessionToken,
      company_slug_value: companySlug
    });

    setHistoryLoading(false);

    if (error) {
      setHistoryError(formatSupabaseError(error) || 'No se pudo cargar el historial.');
      return;
    }

    setHistoryBookings(Array.isArray(data) ? data : []);
  };

  const closeHistory = () => {
    setHistoryClient(null);
    setHistoryBookings([]);
    setHistoryError('');
  };

  const updateField = (field) => (event) => {
    const value = event?.target?.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await comprimirImagen(file, { ladoMaximo: 512, calidad: 0.72 });
      setForm((current) => ({ ...current, photoUrl: dataUrl }));
    } catch (error) {
      setFormError(error.message || 'No se pudo cargar la imagen.');
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setFormError('');

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const dni = String(form.dni || '').trim();
    const phoneNumber = form.phoneNumber.replace(/[^0-9]/g, '');
    const email = form.email.trim().toLowerCase();

    if (firstName.length < 2 || lastName.length < 2) {
      setFormError('Ingresá nombre y apellido.');
      return;
    }

    if (!isValidDni(dni)) {
      setFormError('Ingresá un DNI válido de 7 a 10 dígitos.');
      return;
    }

    if (email && !isValidEmail(email)) {
      setFormError('Si ingresás mail, debe tener un formato válido.');
      return;
    }

    const phone = phoneNumber ? `${form.phoneCode}${phoneNumber}` : null;

    setIsSaving(true);

    const { error } = await supabase.rpc('save_company_client', {
      client_id_value: editingClientId,
      first_name_value: firstName,
      last_name_value: lastName,
      dni_value: dni,
      phone_value: phone,
      email_value: email || null,
      birth_date_value: form.birthDate || null,
      gender_value: form.gender || null,
      address_street_value: form.addressStreet.trim() || null,
      address_number_value: form.addressNumber.trim() || null,
      address_locality_value: form.addressLocality.trim() || null,
      notes_value: form.notes.trim() || null,
      photo_url_value: form.photoUrl || null,
      blocked_value: form.blocked,
      account_id_value: internalAccountId,
      session_token_value: internalSessionToken,
      company_slug_value: companySlug
    });

    setIsSaving(false);

    if (error) {
      setFormError(formatSupabaseError(error) || 'No se pudo guardar el cliente.');
      return;
    }

    onDataChanged?.();
    await loadClients();
    backToList();
  };

  const handleDelete = async () => {
    if (!editingClientId) return;
    if (!window.confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.')) return;

    setIsDeleting(true);
    setFormError('');

    const { error } = await supabase.rpc('delete_company_client', {
      client_id_value: editingClientId,
      account_id_value: internalAccountId,
      session_token_value: internalSessionToken,
      company_slug_value: companySlug
    });

    setIsDeleting(false);

    if (error) {
      setFormError(formatSupabaseError(error) || 'No se pudo eliminar el cliente.');
      return;
    }

    onDataChanged?.();
    await loadClients();
    backToList();
  };

  if (mode === 'edit') {
    const isNew = !editingClientId;

    return (
      <section className="clients-panel">
      {adminProfileSummary && (
          <WorkspaceHero
            eyebrow="Clientes"
            title="Gestión de Clientes"
            description="Administra y organiza tu base de clientes"
            identity={adminProfileSummary}
          />
        )}

        <header className="clients-form-header">
          <div className="clients-form-heading">
            <h1>{isNew ? 'Agregar Cliente' : 'Editar Cliente'}</h1>
            <p>{isNew ? 'Registrá un nuevo cliente para tu negocio' : 'Modifica los datos y configuración de tu cliente existente'}</p>
          </div>
          {!isNew && (
            <button type="button" className="clients-delete-button" onClick={handleDelete} disabled={isDeleting}>
              🗑 {isDeleting ? 'Eliminando...' : 'Eliminar Cliente'}
            </button>
          )}
        </header>

        <form className="clients-form-card" onSubmit={handleSave}>
          <div className="clients-form-section-title">
            <span aria-hidden="true">🧑</span>
            <div>
              <h2>Información del Cliente</h2>
              <p>Los campos marcados con <strong>*</strong> son obligatorios</p>
            </div>
          </div>

          {isNew && (
            <p className="clients-form-hint">
              🔑 La contraseña inicial será <strong>123456</strong> y el usuario ingresa con su DNI. Deberá cambiarla en el primer ingreso. Si cargás un mail, se le enviará un aviso con estos datos.
            </p>
          )}

          <div className="clients-form-grid">
            <label className="clients-field">
              <span>Nombre y Apellido *</span>
              <div className="clients-field-inline">
                <input type="text" value={form.firstName} maxLength="60" placeholder="Nombre" onChange={updateField('firstName')} />
                <input type="text" value={form.lastName} maxLength="60" placeholder="Apellido" onChange={updateField('lastName')} />
              </div>
            </label>

            <label className="clients-field">
              <span>Teléfono</span>
              <div className="clients-phone">
                <select value={form.phoneCode} onChange={updateField('phoneCode')}>
                  {phoneCodes.map((item) => (
                    <option key={item.code} value={item.code}>{item.label}</option>
                  ))}
                </select>
                <input type="tel" value={form.phoneNumber} maxLength="20" placeholder="1132032299" onChange={updateField('phoneNumber')} />
              </div>
            </label>

            <label className="clients-field">
              <span>Email</span>
              <input type="email" value={form.email} maxLength="120" placeholder="cliente@email.com" onChange={updateField('email')} />
            </label>

            <label className="clients-field">
              <span>Documento de Identidad *</span>
              <input type="text" value={form.dni} maxLength="10" placeholder="DNI (7 a 10 dígitos)" onChange={updateField('dni')} />
            </label>

            <label className="clients-field">
              <span>Fecha de Nacimiento</span>
              <input type="date" value={form.birthDate} onChange={updateField('birthDate')} />
            </label>

            <label className="clients-field">
              <span>Género</span>
              <select value={form.gender} onChange={updateField('gender')}>
                {genderOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="clients-field clients-field-wide">
              <span>Dirección</span>
              <div className="clients-address">
                <input type="text" value={form.addressStreet} maxLength="80" placeholder="Calle" onChange={updateField('addressStreet')} />
                <input type="text" value={form.addressNumber} maxLength="12" placeholder="Número" onChange={updateField('addressNumber')} />
                <input type="text" value={form.addressLocality} maxLength="80" placeholder="Localidad" onChange={updateField('addressLocality')} />
              </div>
            </label>

            <label className="clients-field clients-field-wide">
              <span>Foto del cliente</span>
              <input type="file" accept="image/*" onChange={handlePhotoChange} />
            </label>

            <label className="clients-field clients-field-wide">
              <span>Comentario</span>
              <textarea value={form.notes} maxLength="500" rows="3" placeholder="Agrega comentarios adicionales sobre el cliente" onChange={updateField('notes')} />
            </label>
          </div>

          <div className="clients-blocked-row">
            <div>
              <strong>Cliente Bloqueado</strong>
              <span>{form.blocked ? 'Cliente bloqueado' : 'Cliente activo'}</span>
            </div>
            <label className="clients-switch">
              <input type="checkbox" checked={form.blocked} onChange={updateField('blocked')} />
              <span className="clients-switch-track" aria-hidden="true" />
            </label>
          </div>

          {formError && <p className="clients-form-error" role="alert">{formError}</p>}

          <div className="clients-form-actions">
            <button type="button" className="clients-cancel-button" onClick={backToList} disabled={isSaving}>Cancelar</button>
            <button type="submit" className="clients-save-button" disabled={isSaving}>{isSaving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="clients-panel">
      {!hideHeading && adminProfileSummary && (
        <WorkspaceHero
          eyebrow="Clientes"
          title="Gestión de Clientes"
          description="Administra y organiza tu base de clientes"
          identity={adminProfileSummary}
        />
      )}

      <div className="clients-add-row">
        <button type="button" className="clients-add-button" onClick={openNewClient}>
          Agregar Cliente
        </button>
      </div>

      <div className="clients-list-card">
        <div className="clients-search">
          <span aria-hidden="true">🔍</span>
          <input
            type="search"
            value={search}
            placeholder="Buscar clientes por nombre o teléfono..."
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {isLoading ? (
          <p className="clients-empty">Cargando clientes...</p>
        ) : loadError ? (
          <p className="clients-error">{loadError}</p>
        ) : filteredClients.length === 0 ? (
          <p className="clients-empty">
            {clients.length === 0 ? 'Todavía no hay clientes registrados.' : 'No se encontraron clientes con esa búsqueda.'}
          </p>
        ) : (
          <ul className="clients-list">
            {filteredClients.map((client) => {
              const whatsappDigits = getWhatsappDigits(client.phone);

              return (
                <li key={client.id} className={`clients-row ${client.active === false ? 'is-blocked' : ''}`}>
                  <button type="button" className="clients-row-main" onClick={() => openEditClient(client)}>
                    <span className={`clients-row-avatar ${client.photo_url ? 'has-photo' : ''}`} aria-hidden="true">
                      {client.photo_url ? <img src={client.photo_url} alt="" /> : getInitials(client)}
                      <span className={`clients-row-dot ${client.active === false ? 'is-off' : ''}`} />
                    </span>
                    <span className="clients-row-info">
                      <span className="clients-row-name">{client.display_name || `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Cliente'}</span>
                      {client.phone && <span className="clients-row-phone">📞 {client.phone}</span>}
                      {buildAddress(client) && <span className="clients-row-address">{buildAddress(client)}</span>}
                    </span>
                  </button>
                  <div className="clients-row-actions">
                    <button
                      type="button"
                      className="clients-row-history"
                      onClick={() => openHistory(client)}
                      aria-label={`Ver historial de ${client.display_name || 'cliente'}`}
                      title={`Ver historial de ${etiquetaHistorial}`}
                    >
                      🕒
                    </button>
                    {whatsappDigits && (
                      <a
                        className="clients-row-whatsapp"
                        href={`https://wa.me/${whatsappDigits}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Enviar WhatsApp a ${client.display_name || 'cliente'}`}
                        title="Enviar WhatsApp"
                      >
                        🟢
                      </a>
                    )}
                    <button type="button" className="clients-row-edit" onClick={() => openEditClient(client)} aria-label="Editar cliente">›</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {historyClient && (
        <div className="clients-history-overlay" role="dialog" aria-modal="true" onClick={closeHistory}>
          <div className="clients-history-modal" onClick={(event) => event.stopPropagation()}>
            <header className="clients-history-header">
              <div>
                <h2>Historial de {etiquetaHistorial}</h2>
                <p>{historyClient.display_name || `${historyClient.first_name || ''} ${historyClient.last_name || ''}`.trim() || 'Cliente'}</p>
              </div>
              <button type="button" className="clients-history-close" onClick={closeHistory} aria-label="Cerrar">✕</button>
            </header>

            <div className="clients-history-body">
              {historyLoading ? (
                <p className="clients-empty">Cargando historial...</p>
              ) : historyError ? (
                <p className="clients-error">{historyError}</p>
              ) : historyBookings.length === 0 ? (
                <p className="clients-empty">Este cliente todavía no tiene {etiquetaHistorial}.</p>
              ) : (
                <ul className="clients-history-list">
                  {historyBookings.map((booking) => (
                    <li key={booking.id} className={`clients-history-item status-${booking.status}`}>
                      <div className="clients-history-main">
                        <span className="clients-history-service">{booking.service_name || etiquetaItemHistorial}</span>
                        <span className="clients-history-date">{formatDisplayDateTime(booking.start_at)}</span>
                      </div>
                      <div className="clients-history-meta">
                        {booking.employee_name && <span>👤 {booking.employee_name}</span>}
                        <span className={`clients-history-status status-${booking.status}`}>{etiquetasEstadoHistorial[booking.status] || booking.status}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
