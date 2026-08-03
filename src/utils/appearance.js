export const DEFAULT_APPEARANCE_PALETTE = 'gold';
const appearanceStorageKey = 'turnos_app_appearance';

export const BRAND_PALETTES = [
  { id: 'gold', label: 'Dorado', primary: '#f7b733', accent: '#e0a020', surface: '#fff4de', surfaceStrong: '#ffefcf', text: '#7c2d12' },
  { id: 'red', label: 'Rojo', primary: '#ef4444', accent: '#dc2626', surface: '#fee2e2', surfaceStrong: '#fecaca', text: '#7f1d1d' },
  { id: 'rose', label: 'Rosa', primary: '#ec4899', accent: '#db2777', surface: '#fce7f3', surfaceStrong: '#fbcfe8', text: '#831843' },
  { id: 'violet', label: 'Violeta', primary: '#8b5cf6', accent: '#7c3aed', surface: '#ede9fe', surfaceStrong: '#ddd6fe', text: '#4c1d95' },
  { id: 'blue', label: 'Azul', primary: '#2563eb', accent: '#1d4ed8', surface: '#dbeafe', surfaceStrong: '#bfdbfe', text: '#1e3a8a' },
  { id: 'cyan', label: 'Celeste', primary: '#06b6d4', accent: '#0891b2', surface: '#cffafe', surfaceStrong: '#a5f3fc', text: '#164e63' },
  { id: 'teal', label: 'Turquesa', primary: '#14b8a6', accent: '#0f766e', surface: '#ccfbf1', surfaceStrong: '#99f6e4', text: '#134e4a' },
  { id: 'green', label: 'Verde', primary: '#22c55e', accent: '#16a34a', surface: '#dcfce7', surfaceStrong: '#bbf7d0', text: '#14532d' },
  { id: 'lime', label: 'Lima', primary: '#84cc16', accent: '#65a30d', surface: '#ecfccb', surfaceStrong: '#d9f99d', text: '#365314' },
  { id: 'yellow', label: 'Amarillo', primary: '#eab308', accent: '#ca8a04', surface: '#fef9c3', surfaceStrong: '#fef08a', text: '#713f12' },
  { id: 'orange', label: 'Naranja', primary: '#f97316', accent: '#ea580c', surface: '#ffedd5', surfaceStrong: '#fed7aa', text: '#7c2d12' },
  { id: 'brown', label: 'Marron', primary: '#8b5e4a', accent: '#6f4938', surface: '#ead8cf', surfaceStrong: '#dcc0b3', text: '#4a2d22' },
  { id: 'gray', label: 'Gris', primary: '#64748b', accent: '#475569', surface: '#e2e8f0', surfaceStrong: '#cbd5e1', text: '#1e293b' }
];

export const getAppearancePalette = (paletteId) => (
  BRAND_PALETTES.find((palette) => palette.id === paletteId) || BRAND_PALETTES.find((palette) => palette.id === DEFAULT_APPEARANCE_PALETTE)
);

export const normalizeAppearance = (appearance) => {
  const palette = getAppearancePalette(appearance?.palette || appearance?.palette_id || appearance?.theme || DEFAULT_APPEARANCE_PALETTE);
  return { palette: palette.id };
};

export const buildAppearanceStyle = (appearance) => {
  const palette = getAppearancePalette(normalizeAppearance(appearance).palette);

  return {
    '--app-primary': palette.primary,
    '--app-accent': palette.accent,
    '--app-surface': palette.surface,
    '--app-surface-strong': palette.surfaceStrong,
    '--app-text': palette.text,
    '--app-primary-rgb': hexToRgbTriplet(palette.primary),
    '--app-accent-rgb': hexToRgbTriplet(palette.accent),
    '--app-text-rgb': hexToRgbTriplet(palette.text)
  };
};

export const getStoredAppearance = () => {
  if (typeof window === 'undefined') return null;

  try {
    const storedAppearance = window.localStorage.getItem(appearanceStorageKey);

    return storedAppearance ? normalizeAppearance(JSON.parse(storedAppearance)) : null;
  } catch {
    window.localStorage.removeItem(appearanceStorageKey);
    return null;
  }
};

export const rememberAppearance = (appearance) => {
  if (typeof window === 'undefined' || !appearance) return;

  window.localStorage.setItem(appearanceStorageKey, JSON.stringify(normalizeAppearance(appearance)));
};

export const applyAppearanceStyle = (styleTarget, appearance, options = {}) => {
  if (!styleTarget?.setProperty) return;

  const storedAppearance = getStoredAppearance();
  const normalizedAppearance = appearance ? normalizeAppearance(appearance) : null;
  const shouldKeepStoredDefault = options.preferStoredDefault
    && storedAppearance
    && storedAppearance.palette !== DEFAULT_APPEARANCE_PALETTE
    && normalizedAppearance?.palette === DEFAULT_APPEARANCE_PALETTE;
  const effectiveAppearance = shouldKeepStoredDefault
    ? storedAppearance
    : normalizedAppearance || storedAppearance || normalizeAppearance();

  Object.entries(buildAppearanceStyle(effectiveAppearance)).forEach(([property, value]) => {
    styleTarget.setProperty(property, value);
  });

  if (options.remember ?? Boolean(appearance)) rememberAppearance(effectiveAppearance);

  ensureAppearanceStylesheet();
};

if (typeof document !== 'undefined') {
  applyAppearanceStyle(document.documentElement.style, getStoredAppearance());
}

function ensureAppearanceStylesheet() {
  if (typeof document === 'undefined') return;

  const styleId = 'turnos-app-appearance-theme';
  let styleElement = document.getElementById(styleId);

  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = styleId;
  }

  document.head.appendChild(styleElement);

  styleElement.textContent = `
body .dashboard-shell,
body .role-workspace,
body .login-page,
body .landing-page {
  background: radial-gradient(circle at 94% 8%, rgba(var(--app-primary-rgb), 0.14), transparent 30%), linear-gradient(180deg, #fff 0%, var(--app-surface) 100%) !important;
}

body .app-navbar,
body .dashboard-shell > .app-navbar,
body .role-workspace-employee > .app-navbar,
body .role-workspace-client > .app-navbar,
body .admin-sidebar,
body .dashboard-sidebar,
body .employee-sidebar,
body .client-sidebar {
  color: var(--app-text) !important;
  border-color: var(--app-surface-strong) !important;
  background: radial-gradient(circle at 92% 8%, rgba(var(--app-primary-rgb), 0.22), transparent 34%), linear-gradient(160deg, #fffdf8 0%, var(--app-surface) 100%) !important;
  box-shadow: 0 10px 24px rgba(var(--app-text-rgb), 0.1) !important;
}

body .admin-page-heading,
body .settings-hero,
body .role-workspace-hero,
body .client-welcome-hero,
body .login-card,
body .login-hero-panel,
body .client-branch-bar,
body .admin-loading-card,
body .settings-loading-card,
body .admin-metric-grid > *,
body .employee-metric-grid > *,
body .admin-hero,
body .employee-legacy-heading,
body .employee-form-card,
body .clients-panel,
body .clients-form-card,
body .clients-list-card,
body .client-profile-card,
body .client-turnos-group,
body .client-turno-row,
body .new-booking-panel,
body .new-booking-modal-card,
body .agenda-customer-card,
body .employee-reservation-modal,
body .client-request-modal,
body .availability-form-card,
body .availability-day-filter,
body .availability-summary-strip,
body .availability-range-card,
body .agenda-grid,
body .agenda-table,
body .agenda-week-grid,
body .dashboard-metric-card,
body .client-summary-panel,
body .employee-summary-panel,
body .admin-form-card,
body .settings-card,
body .service-record-card,
body .employee-record-card,
body .client-booking-card,
body .agenda-modal-card,
body .close-attention-page-card,
body .close-attention-summary-card,
body .close-attention-item,
body .close-attention-section,
body .close-attention-total,
body .close-attention-coverage-item,
body .close-attention-base-status,
body .close-attention-fiscal-summary,
body .availability-card,
body .availability-card-grid .availability-card,
body .admin-record-card,
body .employee-button-list .employee-record-card,
body .service-button-grid .service-record-card,
body .service-button-grid .promotion-record-card,
body .settings-management-card,
body .settings-promotion-card {
  color: var(--app-text) !important;
  border-color: rgba(var(--app-accent-rgb), 0.32) !important;
  background: radial-gradient(circle at 92% 8%, rgba(var(--app-primary-rgb), 0.12), transparent 28%), linear-gradient(145deg, #fff 0%, var(--app-surface) 100%) !important;
  box-shadow: 0 12px 28px rgba(var(--app-text-rgb), 0.08) !important;
}

body .app-navbar *,
body .admin-sidebar *,
body .dashboard-sidebar *,
body .employee-sidebar *,
body .client-sidebar *,
body .admin-page-heading h1,
body .settings-hero h1,
body .role-workspace-hero h1,
body .client-summary-header h2,
body .settings-card strong,
body .client-booking-card strong,
body .dashboard-metric-card strong,
body .login-card h1,
body .login-card .login-form-title,
body .login-hero-title-accent,
body .login-copy,
body .admin-metric-grid strong,
body .admin-metric-grid b,
body .employee-metric-grid strong,
body .employee-metric-grid b,
body .admin-management-card-header,
body .admin-management-card-header strong,
body .employee-button-list .admin-record-title,
body .employee-button-list .admin-record-services,
body .clients-form-heading h2,
body .clients-form-section-title,
body .clients-list-header,
body .clients-list-title,
body .client-profile-header,
body .client-turno-row-title,
body .close-attention-item-check span,
body .close-attention-section > strong,
body .close-attention-total strong,
body .close-attention-coverage-item h4,
body .close-attention-coverage-item b,
body .close-attention-base-status b,
body .agenda-modal-header,
body .settings-section-header,
body .admin-collapsible-form-header,
body .client-summary-header,
body .settings-management-card-header,
body .booking-detail-header,
body .close-attention-section-title {
  color: var(--app-text) !important;
  border-color: rgba(var(--app-accent-rgb), 0.3) !important;
}

body .admin-loading-card .agenda-modal-body,
body .settings-loading-card .agenda-modal-body,
body .agenda-empty-state,
body .new-booking-loading,
body .clients-empty,
body .client-summary-empty,
body .branches-empty,
body .bundles-empty,
body .services-empty,
body .availability-empty-state {
  color: var(--app-text) !important;
  border-color: rgba(var(--app-accent-rgb), 0.28) !important;
  background: rgba(var(--app-primary-rgb), 0.1) !important;
}

body .admin-management-card-header,
body .employee-record-card.is-muted .admin-management-card-header,
body .service-record-card.is-muted .admin-management-card-header {
  color: var(--app-text) !important;
  border-color: rgba(var(--app-accent-rgb), 0.45) !important;
  background: linear-gradient(150deg, var(--app-primary), var(--app-accent)) !important;
}

body .admin-kicker,
body .login-kicker,
body .login-hero-panel li,
body .client-card-field span,
body .settings-empty-text,
body .admin-page-heading p,
body .admin-metric-grid p,
body .admin-metric-grid span,
body .employee-metric-grid p,
body .employee-metric-grid span,
body .employee-button-list .admin-record-meta,
body .employee-button-list .admin-record-profile-line,
body .clients-form-hint,
body .clients-field,
body .clients-empty,
body .clients-list-meta,
body .client-profile-empty,
body .client-turno-row-date,
body .client-turno-row-service,
body .close-attention-item-meta,
body .close-attention-price-row span,
body .close-attention-total span,
body .close-attention-help,
body .close-attention-coverage-item > span,
body .close-attention-base-status > span,
body .app-navbar-subtitle,
body .app-navbar-profile,
body .settings-appearance-preview small {
  color: rgba(var(--app-text-rgb), 0.72) !important;
}

body .new-booking-label,
body .new-booking-header p,
body .new-booking-day-hint,
body .new-booking-deposit-hint,
body .new-booking-footer-hint,
body .new-booking-client-meta,
body .new-booking-cart-meta,
body .new-booking-cart-bundle-note,
body .availability-card-field > span,
body .availability-form-card label,
body .availability-day-filter-caption,
body .agenda-detail-body,
body .agenda-detail-time {
  color: rgba(var(--app-text-rgb), 0.72) !important;
}

body .new-booking-header h2,
body .new-booking-client-name,
body .new-booking-cart-name,
body .new-booking-cart-price,
body .new-booking-total,
body .new-booking-total strong {
  color: var(--app-text) !important;
}

body .availability-card-field > strong,
body .availability-card-header,
body .availability-date-badge,
body .availability-summary-strip span,
body .availability-day-circle span,
body .availability-day-circle small {
  color: var(--app-text) !important;
}

body .agenda-close-button,
body .agenda-close-button-single,
body .admin-primary-button,
body .admin-link-button,
body .new-booking-confirm,
body .internal-register-primary,
body .login-inline-submit,
body .client-welcome-action,
body .client-summary-refresh,
body .client-action-button,
body .employee-action-button,
body .availability-save-button,
body .settings-actions .agenda-close-button,
body .admin-actions .agenda-close-button,
body .admin-record-actions .agenda-close-button,
body .app-navbar-button:hover,
body .app-navbar-button.is-active,
body .app-navbar-switch:hover,
body .app-navbar-logout:hover,
body .app-navbar .app-navbar-logout:hover,
body .client-branch-bar-pill.is-selected {
  color: var(--app-text) !important;
  border-color: var(--app-accent) !important;
  background: linear-gradient(150deg, var(--app-primary), var(--app-accent)) !important;
  box-shadow: 0 10px 22px rgba(var(--app-primary-rgb), 0.24) !important;
}

body .agenda-option-button,
body .availability-form-toggle,
body .admin-collapsible-form-toggle,
body .settings-check-summary-chip,
body .booking-branch-pill,
body .new-booking-branch-pill,
body .new-booking-select-service,
body .new-booking-add-more,
body .new-booking-toggle,
body .new-booking-client-results button,
body .availability-employee-combo-button,
body .availability-day-filter-all,
body .availability-day-circle,
body .availability-range-add,
body .clients-add-button,
body .clients-cancel-button,
body .clients-save-button,
body .clients-delete-button,
body .clients-switch-track,
body .client-profile-edit-button,
body .client-pack-reserve,
body .employee-header-settlement-button,
body .client-home-carousel-dot,
body .client-card-status-field strong,
body .booking-status-badge,
body .admin-bottom-nav-icon,
body .employee-bottom-nav-icon,
body .client-bottom-nav-icon,
body .settings-palette-button,
body .agenda-modal-actions .agenda-option-button,
body .admin-actions .agenda-option-button,
body .admin-record-actions .agenda-option-button,
body .app-navbar-button,
body .app-navbar-switch,
body .app-navbar-logout,
body .app-navbar .app-navbar-logout,
body .client-branch-bar-pill,
body .agenda-slot-add-hint {
  color: var(--app-text) !important;
  border-color: rgba(var(--app-accent-rgb), 0.52) !important;
  background: rgba(var(--app-primary-rgb), 0.14) !important;
  box-shadow: 0 0 0 1px rgba(var(--app-primary-rgb), 0.1) !important;
}

body .admin-shell input,
body .admin-shell textarea,
body .admin-shell select,
body .clients-panel input,
body .clients-panel textarea,
body .clients-panel select,
body .close-attention-page input,
body .close-attention-page textarea,
body .close-attention-page select,
body .close-attention-modal input,
body .close-attention-modal textarea,
body .close-attention-modal select {
  color: var(--app-text) !important;
  border-color: rgba(var(--app-accent-rgb), 0.34) !important;
  background: #fff !important;
}

body .admin-collapsible-form-header,
body .settings-card > header,
body .settings-card .settings-card-header,
body .clients-form-header,
body .client-profile-header,
body .admin-management-card-header,
body .service-button-grid .admin-management-card-header,
body .employee-button-list .admin-management-card-header {
  color: var(--app-text) !important;
  border-color: rgba(var(--app-accent-rgb), 0.42) !important;
  background: linear-gradient(150deg, var(--app-primary), var(--app-accent)) !important;
}

body .settings-card > header *,
body .settings-card .settings-card-header *,
body .clients-form-header *,
body .client-profile-header *,
body .admin-collapsible-form-header *,
body .admin-management-card-header * {
  color: var(--app-text) !important;
}

body .clients-save-button,
body .clients-add-button,
body .client-profile-edit-button,
body .employee-header-settlement-button,
body .close-attention-page .agenda-close-button,
body .close-attention-modal .agenda-close-button {
  color: var(--app-text) !important;
  border-color: var(--app-accent) !important;
  background: linear-gradient(150deg, var(--app-primary), var(--app-accent)) !important;
  box-shadow: 0 10px 22px rgba(var(--app-primary-rgb), 0.24) !important;
}

body .availability-day-circle.is-selected,
body .availability-day-filter-all.is-selected,
body .availability-range-add:hover {
  color: var(--app-text) !important;
  border-color: var(--app-accent) !important;
  background: rgba(var(--app-primary-rgb), 0.24) !important;
  box-shadow: 0 0 0 3px rgba(var(--app-primary-rgb), 0.16) !important;
}

body .agenda-grid *,
body .agenda-table *,
body .agenda-week-grid *,
body .agenda-slot,
body .agenda-slot * {
  border-color: rgba(var(--app-accent-rgb), 0.28) !important;
}

body .agenda-booking-item,
body .agenda-booking-item-fill,
body .agenda-booking-item-compact {
  color: var(--app-text) !important;
  border-color: rgba(var(--app-accent-rgb), 0.6) !important;
  background: linear-gradient(145deg, #fff 0%, var(--app-surface) 100%) !important;
  box-shadow: inset 3px 0 0 var(--app-accent), 0 1px 4px rgba(var(--app-text-rgb), 0.12) !important;
}

body .agenda-booking-label,
body .agenda-booking-label-primary,
body .agenda-booking-label-secondary,
body .agenda-booking-label-client {
  display: flex !important;
  color: var(--app-text) !important;
  opacity: 1 !important;
  visibility: visible !important;
}

body .agenda-booking-label {
  flex-direction: column !important;
  min-width: 0 !important;
  max-width: calc(100% - 26px) !important;
  overflow: hidden !important;
  font-weight: 850 !important;
}

body .agenda-booking-label-primary,
body .agenda-booking-label-secondary,
body .agenda-booking-label-client {
  display: block !important;
  width: 100% !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

body .agenda-booking-label-secondary,
body .agenda-booking-label-client {
  color: rgba(var(--app-text-rgb), 0.78) !important;
  font-weight: 750 !important;
}

body .agenda-booking-cancel,
body .agenda-booking-lock {
  color: var(--app-text) !important;
  border-left-color: rgba(var(--app-accent-rgb), 0.36) !important;
  background: rgba(var(--app-primary-rgb), 0.18) !important;
}

body .new-booking-field input,
body .new-booking-field textarea,
body .new-booking-field select {
  color: var(--app-text) !important;
  border-color: rgba(var(--app-accent-rgb), 0.34) !important;
  background: #fff !important;
}

body .new-booking-total,
body .new-booking-cart-item,
body .new-booking-client-results,
body .agenda-customer-summary,
body .agenda-detail-popover {
  color: var(--app-text) !important;
  border-color: rgba(var(--app-accent-rgb), 0.32) !important;
  background: linear-gradient(145deg, #fff 0%, var(--app-surface) 100%) !important;
}

body .booking-branch-pill.is-selected,
body .new-booking-branch-pill.is-selected,
body .new-booking-toggle.is-on {
  color: var(--app-text) !important;
  border-color: var(--app-accent) !important;
  background: linear-gradient(150deg, var(--app-primary), var(--app-accent)) !important;
}

body .new-booking-confirm:disabled,
body .client-welcome-action:disabled,
body .agenda-close-button:disabled,
body .agenda-close-button-single:disabled {
  color: rgba(var(--app-text-rgb), 0.56) !important;
  border-color: rgba(var(--app-accent-rgb), 0.22) !important;
  background: rgba(var(--app-primary-rgb), 0.18) !important;
  box-shadow: none !important;
}

body .new-booking-close,
body .new-booking-cart-remove {
  color: var(--app-text) !important;
  background: rgba(var(--app-primary-rgb), 0.14) !important;
}

body .agenda-option-button:hover,
body .availability-form-toggle:hover,
body .admin-collapsible-form-toggle:hover,
body .settings-check-summary-chip:hover,
body .settings-check-summary-chip.is-selected,
body .client-home-carousel-dot.is-active,
body .settings-palette-button.is-selected,
body .agenda-modal-actions .agenda-option-button:hover,
body .admin-actions .agenda-option-button:hover,
body .admin-record-actions .agenda-option-button:hover {
  color: var(--app-text) !important;
  border-color: var(--app-accent) !important;
  background: rgba(var(--app-primary-rgb), 0.24) !important;
  box-shadow: 0 0 0 3px rgba(var(--app-primary-rgb), 0.16) !important;
}

body input:focus,
body textarea:focus,
body select:focus,
body .settings-upload-field:focus-within,
body .client-card-status-field strong.is-active {
  border-color: var(--app-accent) !important;
  box-shadow: 0 0 0 3px rgba(var(--app-primary-rgb), 0.2) !important;
}

body input[type='checkbox'],
body input[type='radio'],
body progress {
  accent-color: var(--app-primary) !important;
}

body *:focus-visible {
  outline-color: var(--app-accent) !important;
}

body .activity-icon,
body .app-navbar-avatar,
body .app-navbar-mark,
body .client-home-carousel-arrow,
body .admin-profile-avatar,
body .employee-avatar,
body .client-avatar,
body .settings-appearance-swatch,
body .settings-palette-circle {
  color: var(--app-text) !important;
  border-color: var(--app-accent) !important;
  background: var(--app-primary) !important;
}

body a,
body .login-link-button,
body .client-card-status-field strong.is-active {
  color: var(--app-text) !important;
}

body .service-button-grid .service-record-card .admin-management-card-header,
body .service-button-grid .promotion-record-card .admin-management-card-header,
body .employee-button-list .employee-record-card .admin-management-card-header,
body .admin-record-card .admin-management-card-header,
body .dashboard-shell .agenda-modal-header,
body .role-workspace-employee .agenda-modal-header,
body .role-workspace-client .agenda-modal-header,
body .admin-shell .form-card-header,
body .admin-shell .admin-collapsible-form-header,
body .agenda-modal-header.form-card-header,
body .agenda-modal-header.admin-collapsible-form-header,
body .booking-detail-modal .agenda-modal-header,
body .employee-booking-detail-header,
body .employee-availability-manager .availability-form-header,
body .employee-availability-manager .availability-card-header,
body .role-workspace-employee .employee-availability-manager .availability-form-header,
body .role-workspace-employee .employee-availability-manager .availability-card-header,
body .dashboard-shell .employee-availability-manager .availability-form-header,
body .dashboard-shell .employee-availability-manager .availability-card-header,
body .availability-form-card > .agenda-modal-header,
body .availability-card-grid .availability-card-header {
  color: var(--app-text) !important;
  border-color: rgba(var(--app-accent-rgb), 0.46) !important;
  background: radial-gradient(circle at 92% 8%, rgba(var(--app-primary-rgb), 0.2), transparent 34%), linear-gradient(160deg, #fff 0%, var(--app-surface) 100%) !important;
  box-shadow: inset 0 -1px 0 rgba(var(--app-text-rgb), 0.12), inset 0 0 0 1px rgba(var(--app-primary-rgb), 0.12) !important;
}

body .booking-detail-modal .agenda-modal-header *,
body .employee-booking-detail-header *,
body .employee-availability-manager .availability-form-header *,
body .employee-availability-manager .availability-card-header *,
body .role-workspace-employee .employee-availability-manager .availability-form-header *,
body .role-workspace-employee .employee-availability-manager .availability-card-header *,
body .dashboard-shell .employee-availability-manager .availability-form-header *,
body .dashboard-shell .employee-availability-manager .availability-card-header *,
body .availability-form-card > .agenda-modal-header *,
body .availability-card-grid .availability-card-header * {
  color: var(--app-text) !important;
}

body .booking-detail-modal .agenda-close-button,
body .booking-detail-modal .agenda-option-button,
body .settings-banner-preview .agenda-close-button,
body .settings-banner-preview .agenda-option-button,
body .settings-promotion-card .agenda-close-button,
body .settings-promotion-card .agenda-option-button,
body .availability-branch-pill,
body .employee-availability-manager .availability-card-edit-arrow,
body .employee-availability-manager .availability-card-grid .agenda-close-button,
body .employee-availability-manager .availability-card-grid .agenda-option-button,
body .employee-availability-manager .availability-card-grid .admin-record-actions .agenda-close-button,
body .employee-availability-manager .availability-card-grid .admin-record-actions .agenda-option-button,
body .availability-range-remove {
  color: var(--app-text) !important;
  border-color: rgba(var(--app-accent-rgb), 0.56) !important;
  background: rgba(var(--app-primary-rgb), 0.14) !important;
  background-image: none !important;
  box-shadow: 0 0 0 1px rgba(var(--app-primary-rgb), 0.1) !important;
}


body .availability-branch-pill.is-selected {
  color: var(--app-text) !important;
  border-color: var(--app-accent) !important;
  background: rgba(var(--app-primary-rgb), 0.24) !important;
  background-image: none !important;
}

body .employee-availability-manager .availability-summary-strip,
body .employee-availability-manager .availability-day-filter-all.is-selected,
body .employee-availability-manager .availability-day-circle.is-selected,
body .dashboard-shell .employee-availability-manager .availability-day-filter-all.is-selected,
body .dashboard-shell .employee-availability-manager .availability-day-circle.is-selected {
  color: var(--app-text) !important;
  border-color: var(--app-accent) !important;
  background: radial-gradient(circle at 92% 8%, rgba(var(--app-primary-rgb), 0.22), transparent 34%), linear-gradient(160deg, #fffdf8 0%, var(--app-surface) 100%) !important;
  background-image: radial-gradient(circle at 92% 8%, rgba(var(--app-primary-rgb), 0.22), transparent 34%), linear-gradient(160deg, #fffdf8 0%, var(--app-surface) 100%) !important;
}
body .service-button-grid .service-record-card .admin-management-card-header *,
body .service-button-grid .promotion-record-card .admin-management-card-header *,
body .employee-button-list .employee-record-card .admin-management-card-header *,
body .admin-record-card .admin-management-card-header *,
body .admin-shell .form-card-header *,
body .admin-shell .admin-collapsible-form-header *,
body .agenda-modal-header.form-card-header *,
body .agenda-modal-header.admin-collapsible-form-header * {
  color: var(--app-text) !important;
}

body .admin-shell strong.is-active,
body .service-button-grid strong.is-active,
body .employee-button-list strong.is-active,
body .admin-record-card strong.is-active,
body .service-card-action,
body .service-button-grid .service-card-action,
body .service-button-grid .agenda-close-button.service-card-action,
body .service-button-grid .agenda-option-button.service-card-action {
  color: var(--app-text) !important;
  border-color: rgba(var(--app-accent-rgb), 0.56) !important;
  background: rgba(var(--app-primary-rgb), 0.14) !important;
  background-image: none !important;
  box-shadow: 0 0 0 1px rgba(var(--app-primary-rgb), 0.1) !important;
}
`;
}

export function hexToRgbTriplet(hex) {
  const clean = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return '247, 183, 51';
  const value = Number.parseInt(clean, 16);
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}
