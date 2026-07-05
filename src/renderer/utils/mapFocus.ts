const PORTAL_MODAL_SELECTORS = [
  '.create-sector-modal',
  '.edit-sector-modal',
  '.export-kml-modal',
] as const;

export function blurLeafletMaps() {
  document.querySelectorAll<HTMLElement>('.leaflet-container').forEach((el) => {
    el.blur();
    el.tabIndex = -1;
  });

  const active = document.activeElement;
  if (active instanceof HTMLElement && active.closest('.leaflet-container')) {
    active.blur();
  }
}

export function setSectorMapKeyboardEnabled(enabled: boolean) {
  document.querySelectorAll<HTMLElement>('.sector-map-card .leaflet-container').forEach((el) => {
    el.tabIndex = enabled ? 0 : -1;
  });
}

export function purgeOrphanModalNodes(selector: string) {
  document.querySelectorAll(selector).forEach((node) => node.remove());
}

export function purgeOrphanPortalModals() {
  for (const selector of PORTAL_MODAL_SELECTORS) {
    purgeOrphanModalNodes(selector);
  }
}

/** Удаляет «зависшие» popup/tooltip Leaflet после unmount слоя или confirm(). */
export function dismissLeafletPopups() {
  document.querySelectorAll('.leaflet-popup, .leaflet-tooltip').forEach((node) => node.remove());
}

function hasOpenModalLayer(): boolean {
  return Boolean(
    document.querySelector('.modal-overlay') ||
      document.querySelector('.create-sector-modal') ||
      document.querySelector('.edit-sector-modal') ||
      document.querySelector('.export-kml-modal'),
  );
}

function runInputCleanup() {
  blurLeafletMaps();
  dismissLeafletPopups();

  if (!hasOpenModalLayer()) {
    document.body.style.overflow = '';
    document.querySelectorAll('.modal-overlay').forEach((node) => node.remove());
    purgeOrphanPortalModals();
  }
}

/** Перед window.confirm / alert — снять popup и фокус с карты, иначе после диалога ввод блокируется. */
export function prepareForNativeDialog() {
  blurLeafletMaps();
  dismissLeafletPopups();
}

/** Сбрасывает блокировки ввода после операций с картой (удаление сектора, confirm и т.д.). */
export function restorePageInput() {
  runInputCleanup();

  requestAnimationFrame(() => {
    runInputCleanup();
    requestAnimationFrame(runInputCleanup);
  });

  window.setTimeout(runInputCleanup, 0);
  window.setTimeout(runInputCleanup, 50);
  window.setTimeout(runInputCleanup, 150);
}
