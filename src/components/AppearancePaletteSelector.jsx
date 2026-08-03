import { BRAND_PALETTES, buildAppearanceStyle, getAppearancePalette, normalizeAppearance } from '../utils/appearance';

export default function AppearancePaletteSelector({ value, open, onChange, onOpen, onClose }) {
  const selectedAppearance = normalizeAppearance(value);
  const selectedPalette = getAppearancePalette(selectedAppearance.palette);
  const selectedAppearanceStyle = buildAppearanceStyle(selectedAppearance);

  return (
    <>
      <article className="admin-form-card settings-card settings-appearance-card" style={selectedAppearanceStyle}>
        <div className="agenda-modal-header admin-collapsible-form-header">
          <span>Apariencia</span>
          <button
            className="availability-form-toggle admin-collapsible-form-toggle"
            type="button"
            onClick={onOpen}
            aria-label="Elegir color de la aplicación"
          >
            &gt;
          </button>
        </div>
        <div className="agenda-modal-body settings-card-body settings-appearance-body">
          <button className="settings-appearance-preview" type="button" onClick={onOpen}>
            <span className="settings-appearance-swatch" style={{ '--palette-primary': selectedPalette.primary }} />
            <span>
              <strong>{selectedPalette.label}</strong>
              <small>El dorado de la app se reemplaza por este color y los fondos quedan en degradé suave.</small>
            </span>
          </button>
        </div>
      </article>

      {open && (
        <div className="modal">
          <div className="agenda-modal-card settings-appearance-modal">
            <div className="agenda-modal-header settings-section-header">
              <span>Color de la aplicación</span>
              <button className="agenda-option-button" type="button" onClick={onClose}>Cerrar</button>
            </div>
            <div className="agenda-modal-body settings-appearance-palette-grid">
              {BRAND_PALETTES.map((palette) => {
                const selected = palette.id === selectedAppearance.palette;

                return (
                  <button
                    className={`settings-palette-button ${selected ? 'is-selected' : ''}`}
                    type="button"
                    key={palette.id}
                    onClick={() => onChange({ palette: palette.id })}
                    aria-label={`Elegir ${palette.label}`}
                    aria-pressed={selected}
                  >
                    <span className="settings-palette-circle" style={{ '--palette-primary': palette.primary }}>
                      {selected ? '✓' : ''}
                    </span>
                    <span>{palette.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="settings-appearance-modal-actions">
              <button className="agenda-option-button" type="button" onClick={onClose}>Cancelar</button>
              <button className="agenda-close-button" type="button" onClick={onClose}>Aceptar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
