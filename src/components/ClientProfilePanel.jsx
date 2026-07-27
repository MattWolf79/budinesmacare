import { useEffect, useState } from 'react';
import { supabase } from '../api/supabaseClient';

const emptyProfile = {
  firstName: '',
  lastName: '',
  phoneCode: '+54',
  phoneNumber: '',
  email: '',
  dni: '',
  birthDate: '',
  gender: '',
  addressStreet: '',
  addressNumber: '',
  addressLocality: '',
  notes: '',
  photoUrl: ''
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

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
  reader.readAsDataURL(file);
});

export default function ClientProfilePanel({ user, companySlug }) {
  const [profile, setProfile] = useState(emptyProfile);
  const [form, setForm] = useState(emptyProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setIsLoading(true);
      setErrorMessage('');

      const { data, error } = await supabase.rpc('get_client_self', {
        account_id_value: user?.id || null,
        session_token_value: user?.sessionToken || null,
        company_slug_value: companySlug
      });

      if (!active) return;

      if (error) {
        setErrorMessage(error.message || 'No se pudieron cargar tus datos.');
        setIsLoading(false);
        return;
      }

      const record = Array.isArray(data) ? data[0] : data;
      const { phoneCode, phoneNumber } = splitPhone(record?.phone);
      const nextProfile = {
        firstName: record?.first_name || '',
        lastName: record?.last_name || '',
        phoneCode,
        phoneNumber,
        email: record?.email || '',
        dni: record?.client_dni || '',
        birthDate: record?.birth_date || '',
        gender: record?.gender || '',
        addressStreet: record?.address_street || '',
        addressNumber: record?.address_number || '',
        addressLocality: record?.address_locality || '',
        notes: record?.notes || '',
        photoUrl: record?.photo_url || ''
      };

      setProfile(nextProfile);
      setForm(nextProfile);
      setIsLoading(false);
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, [user?.id, user?.sessionToken, companySlug]);

  const startEditing = () => {
    setForm(profile);
    setErrorMessage('');
    setSuccessMessage('');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setForm(profile);
    setErrorMessage('');
    setIsEditing(false);
  };

  const updateField = (field) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((current) => ({ ...current, photoUrl: dataUrl }));
    } catch (error) {
      setErrorMessage(error.message || 'No se pudo cargar la imagen.');
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (form.firstName.trim().length < 2 || form.lastName.trim().length < 2) {
      setErrorMessage('Ingresá nombre y apellido.');
      return;
    }

    const phoneNumber = form.phoneNumber.replace(/[^0-9]/g, '');
    if (!phoneNumber) {
      setErrorMessage('Ingresá un celular de contacto.');
      return;
    }

    const phone = `${form.phoneCode}${phoneNumber}`;

    setIsSaving(true);

    const { data, error } = await supabase.rpc('update_client_self', {
      account_id_value: user?.id || null,
      session_token_value: user?.sessionToken || null,
      first_name_value: form.firstName.trim(),
      last_name_value: form.lastName.trim(),
      phone_value: phone,
      email_value: form.email.trim() || null,
      birth_date_value: form.birthDate || null,
      address_street_value: form.addressStreet.trim() || null,
      address_number_value: form.addressNumber.trim() || null,
      address_locality_value: form.addressLocality.trim() || null,
      gender_value: form.gender || null,
      photo_url_value: form.photoUrl || null,
      notes_value: form.notes.trim() || null,
      company_slug_value: companySlug
    });

    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message || 'No se pudieron guardar tus datos.');
      return;
    }

    const record = Array.isArray(data) ? data[0] : data;
    const { phoneCode, phoneNumber: savedNumber } = splitPhone(record?.phone || phone);
    const nextProfile = {
      firstName: record?.first_name || form.firstName.trim(),
      lastName: record?.last_name || form.lastName.trim(),
      phoneCode,
      phoneNumber: savedNumber,
      email: record?.email || form.email.trim(),
      dni: record?.client_dni || profile.dni,
      birthDate: record?.birth_date || form.birthDate,
      gender: record?.gender || form.gender,
      addressStreet: record?.address_street || form.addressStreet.trim(),
      addressNumber: record?.address_number || form.addressNumber.trim(),
      addressLocality: record?.address_locality || form.addressLocality.trim(),
      notes: record?.notes || form.notes.trim(),
      photoUrl: record?.photo_url || form.photoUrl
    };

    setProfile(nextProfile);
    setForm(nextProfile);
    setIsEditing(false);
    setSuccessMessage('Tus datos se actualizaron correctamente.');
  };

  return (
    <section className="client-profile-panel">
      <div className="client-profile-card">
        <div className="client-profile-header">
          <div className="clients-form-section-title">
            <span aria-hidden="true">🧑</span>
            <div>
              <h2>Información del Cliente</h2>
              <p>Los campos marcados con <strong>*</strong> son obligatorios</p>
            </div>
          </div>
          {!isEditing && !isLoading && (
            <button type="button" className="client-profile-edit-button" onClick={startEditing}>
              Editar
            </button>
          )}
        </div>

        {isLoading ? (
          <p className="client-profile-empty">Cargando tus datos...</p>
        ) : (
          <form className="client-profile-form" onSubmit={handleSave}>
            <div className="clients-form-grid">
              <label className="clients-field">
                <span>Nombre y Apellido *</span>
                <div className="clients-field-inline">
                  <input type="text" value={form.firstName} maxLength="60" placeholder="Nombre" onChange={updateField('firstName')} disabled={!isEditing} />
                  <input type="text" value={form.lastName} maxLength="60" placeholder="Apellido" onChange={updateField('lastName')} disabled={!isEditing} />
                </div>
              </label>

              <label className="clients-field">
                <span>Teléfono</span>
                <div className="clients-phone">
                  <select value={form.phoneCode} onChange={updateField('phoneCode')} disabled={!isEditing}>
                    {phoneCodes.map((item) => (
                      <option key={item.code} value={item.code}>{item.label}</option>
                    ))}
                  </select>
                  <input type="tel" value={form.phoneNumber} maxLength="20" placeholder="1132032299" onChange={updateField('phoneNumber')} disabled={!isEditing} />
                </div>
              </label>

              <label className="clients-field">
                <span>Email</span>
                <input type="email" value={form.email} maxLength="120" placeholder="cliente@email.com" onChange={updateField('email')} disabled={!isEditing} />
              </label>

              <label className="clients-field">
                <span>Documento de Identidad</span>
                <input type="text" value={form.dni} placeholder="DNI" disabled readOnly />
              </label>

              <label className="clients-field">
                <span>Fecha de Nacimiento</span>
                <input type="date" value={form.birthDate} onChange={updateField('birthDate')} disabled={!isEditing} />
              </label>

              <label className="clients-field">
                <span>Género</span>
                <select value={form.gender} onChange={updateField('gender')} disabled={!isEditing}>
                  {genderOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="clients-field clients-field-wide">
                <span>Dirección</span>
                <div className="clients-address">
                  <input type="text" value={form.addressStreet} maxLength="80" placeholder="Calle" onChange={updateField('addressStreet')} disabled={!isEditing} />
                  <input type="text" value={form.addressNumber} maxLength="12" placeholder="Número" onChange={updateField('addressNumber')} disabled={!isEditing} />
                  <input type="text" value={form.addressLocality} maxLength="80" placeholder="Localidad" onChange={updateField('addressLocality')} disabled={!isEditing} />
                </div>
              </label>

              <label className="clients-field clients-field-wide">
                <span>Foto del cliente</span>
                <input type="file" accept="image/*" onChange={handlePhotoChange} disabled={!isEditing} />
              </label>

              <label className="clients-field clients-field-wide">
                <span>Comentario</span>
                <textarea value={form.notes} maxLength="500" rows="3" placeholder="Agrega comentarios adicionales" onChange={updateField('notes')} disabled={!isEditing} />
              </label>
            </div>

            {errorMessage && <p className="client-profile-error">{errorMessage}</p>}
            {successMessage && <p className="client-profile-success">{successMessage}</p>}

            {isEditing && (
              <div className="client-profile-actions">
                <button type="button" className="client-profile-cancel-button" onClick={cancelEditing} disabled={isSaving}>
                  Cancelar
                </button>
                <button type="submit" className="client-profile-save-button" disabled={isSaving}>
                  {isSaving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
