// Thin wrapper around Oat's global toast API (ot.toast), loaded by oat.min.js.
// Falls back to a no-op (or console) if Oat's JS hasn't loaded yet, so calling
// code never has to guard for it. See SITESUI.md > Toast.

function oat() {
  return typeof window !== 'undefined' ? window.ot : undefined
}

export function toast(message, title = '', options = {}) {
  const o = oat()
  if (o && typeof o.toast === 'function') {
    o.toast(message, title, options)
  } else if (typeof console !== 'undefined') {
    console.log(`[toast] ${title ? title + ': ' : ''}${message}`)
  }
}

export const toastSuccess = (msg, title = '') => toast(msg, title, { variant: 'success' })
export const toastDanger = (msg, title = '') => toast(msg, title, { variant: 'danger' })
export const toastWarning = (msg, title = '') => toast(msg, title, { variant: 'warning' })
export const toastInfo = (msg, title = '') => toast(msg, title, { variant: 'info' })
