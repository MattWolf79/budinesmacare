import ActivityIcon from './ActivityIcon';
import { useState } from 'react';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CustomerModal({ employee, rangeLabel, selectedService, onClose, onBack, onReserve }) {
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [error, setError] = useState('');

  const submitCustomer = (event) => {
    event.preventDefault();

    const cleanName = customerName.trim();
    const cleanEmail = customerEmail.trim().toLowerCase();

    if (cleanName.length < 2) {
      setError('Ingresá el nombre del cliente.');
      return;
    }

    if (!emailPattern.test(cleanEmail)) {
      setError('Ingresá un mail válido del cliente.');
      return;
    }

    onReserve(employee, {
      name: cleanName,
      email: cleanEmail
    });
  };

  const updateName = (value) => {
    setCustomerName(value);
    setError('');
  };

  const updateEmail = (value) => {
    setCustomerEmail(value);
    setError('');
  };

  return (
    <div className="modal">
      <form className="agenda-modal-card agenda-customer-card" onSubmit={submitCustomer}>
        <div className="agenda-modal-header">Datos del cliente</div>

        <div className="agenda-modal-body">
          <div className="agenda-customer-summary">
            <span className="agenda-summary-title"><ActivityIcon service={selectedService} size="small" /> {selectedService.name}</span>
            <span>👤 {employee.name}</span>
            <span>{rangeLabel}</span>
          </div>

          <label className="agenda-customer-field">
            Nombre del cliente
            <input
              value={customerName}
              maxLength="80"
              autoComplete="name"
              placeholder="Ej: Clara Pérez"
              onChange={(event) => updateName(event.target.value)}
            />
          </label>

          <label className="agenda-customer-field">
            Mail del cliente
            <input
              type="email"
              value={customerEmail}
              maxLength="120"
              autoComplete="email"
              placeholder="cliente@email.com"
              onChange={(event) => updateEmail(event.target.value)}
            />
          </label>

          {error && <div className="agenda-customer-error" role="alert">{error}</div>}

          <div className="agenda-customer-actions">
            <button className="agenda-option-button" type="button" onClick={onBack}>Volver</button>
            <button className="agenda-close-button" type="submit">Reservar</button>
          </div>

          <button className="agenda-danger-button agenda-customer-cancel" type="button" onClick={onClose}>Cerrar</button>
        </div>
      </form>
    </div>
  );
}