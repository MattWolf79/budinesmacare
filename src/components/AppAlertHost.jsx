import { useCallback, useEffect, useState } from 'react';
import { registerAppAlertListener } from '../utils/appAlert';

// Host global que reemplaza a window.alert por un modal con la estética de la app.
export default function AppAlertHost() {
  const [items, setItems] = useState([]);

  useEffect(() => registerAppAlertListener((payload) => {
    setItems((current) => [...current, { id: `${Date.now()}-${Math.random()}`, ...payload }]);
  }), []);

  const dismiss = useCallback((id) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  if (!items.length) return null;

  const current = items[items.length - 1];

  return (
    <div className="app-alert-overlay" role="dialog" aria-modal="true">
      <div className="app-alert-card">
        <p className="app-alert-message">{current.message}</p>
        <div className="app-alert-actions">
          <button type="button" className="app-alert-ok" onClick={() => dismiss(current.id)}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
