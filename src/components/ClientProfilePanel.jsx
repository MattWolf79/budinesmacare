import { useEffect, useState } from 'react';
import { supabase } from '../api/supabaseClient';

const emptyProfile = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  dni: '',
  birthDate: '',
  addressStreet: '',
  addressNumber: '',
  addressLocality: ''
};

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
      const nextProfile = {
        firstName: record?.first_name || '',
        lastName: record?.last_name || '',
        phone: record?.phone || '',
        email: record?.email || '',
        dni: record?.client_dni || '',
        birthDate: record?.birth_date || '',
        addressStreet: record?.address_street || '',
        addressNumber: record?.address_number || '',
        addressLocality: record?.address_locality || ''
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

  const handleSave = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (form.firstName.trim().length < 2 || form.lastName.trim().length < 2) {
      setErrorMessage('Ingresá nombre y apellido.');
      return;
    }

    if (!form.phone.trim()) {
      setErrorMessage('Ingresá un celular de contacto.');
      return;
    }

    setIsSaving(true);

    const { data, error } = await supabase.rpc('update_client_self', {
      account_id_value: user?.id || null,
      session_token_value: user?.sessionToken || null,
      first_name_value: form.firstName.trim(),
      last_name_value: form.lastName.trim(),
      phone_value: form.phone.trim(),
      email_value: form.email.trim() || null,
      birth_date_value: form.birthDate || null,
      address_street_value: form.addressStreet.trim() || null,
      address_number_value: form.addressNumber.trim() || null,
      address_locality_value: form.addressLocality.trim() || null,
      company_slug_value: companySlug
    });

    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message || 'No se pudieron guardar tus datos.');
      return;
    }

    const record = Array.isArray(data) ? data[0] : data;
    const nextProfile = {
      firstName: record?.first_name || form.firstName.trim(),
      lastName: record?.last_name || form.lastName.trim(),
      phone: record?.phone || form.phone.trim(),
      email: record?.email || form.email.trim(),
      dni: record?.client_dni || profile.dni,
      birthDate: record?.birth_date || form.birthDate,
      addressStreet: record?.address_street || form.addressStreet.trim(),
      addressNumber: record?.address_number || form.addressNumber.trim(),
      addressLocality: record?.address_locality || form.addressLocality.trim()
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
          <h2>Mis datos personales</h2>
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
            <label className="client-profile-field">
              <span>Nombre</span>
              <input type="text" value={form.firstName} onChange={updateField('firstName')} disabled={!isEditing} placeholder="Nombre" />
            </label>
            <label className="client-profile-field">
              <span>Apellido</span>
              <input type="text" value={form.lastName} onChange={updateField('lastName')} disabled={!isEditing} placeholder="Apellido" />
            </label>
            <label className="client-profile-field">
              <span>DNI</span>
              <input type="text" value={form.dni} disabled readOnly placeholder="DNI" />
            </label>
            <label className="client-profile-field">
              <span>Celular</span>
              <input type="tel" value={form.phone} onChange={updateField('phone')} disabled={!isEditing} placeholder="Celular de contacto" />
            </label>
            <label className="client-profile-field">
              <span>Email</span>
              <input type="email" value={form.email} onChange={updateField('email')} disabled={!isEditing} placeholder="Email (opcional)" />
            </label>
            <label className="client-profile-field">
              <span>Fecha de nacimiento</span>
              <input type="date" value={form.birthDate} onChange={updateField('birthDate')} disabled={!isEditing} />
            </label>
            <label className="client-profile-field">
              <span>Calle</span>
              <input type="text" value={form.addressStreet} onChange={updateField('addressStreet')} disabled={!isEditing} placeholder="Calle" />
            </label>
            <label className="client-profile-field">
              <span>Número</span>
              <input type="text" value={form.addressNumber} onChange={updateField('addressNumber')} disabled={!isEditing} placeholder="Número" />
            </label>
            <label className="client-profile-field">
              <span>Localidad</span>
              <input type="text" value={form.addressLocality} onChange={updateField('addressLocality')} disabled={!isEditing} placeholder="Localidad" />
            </label>

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
