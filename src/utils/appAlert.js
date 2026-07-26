// Bus simple para mostrar avisos (reemplazo de window.alert) mediante un modal.
// Los componentes llaman showAppAlert(mensaje) y el host montado en App lo renderiza.
let listener = null;
const pending = [];

export function registerAppAlertListener(fn) {
  listener = fn;
  if (fn && pending.length) {
    pending.splice(0).forEach((payload) => fn(payload));
  }
  return () => {
    if (listener === fn) listener = null;
  };
}

export function showAppAlert(message) {
  const payload = { message: String(message ?? '') };
  if (listener) {
    listener(payload);
  } else {
    pending.push(payload);
  }
}
