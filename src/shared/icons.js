/**
 * Hugeicons (https://hugeicons.com) SVG bodies used by the extension, so it
 * matches the QVault app icon set without an icon runtime.
 */

const ICON_BODIES = {
  search: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m17 17l4 4m-2-10a8 8 0 1 0-16 0a8 8 0 0 0 16 0"/>',
  add: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4"/>',
  lock: '<g fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.496 9V6.5a4.5 4.5 0 1 0-9 0V9"/><path stroke-linecap="round" d="M13.496 9h-3c-2.334 0-3.502 0-4.386.472a4 4 0 0 0-1.642 1.643c-.472.883-.472 2.05-.472 4.386c0 2.334 0 3.501.473 4.385a4 4 0 0 0 1.642 1.642C6.995 22 8.162 22 10.496 22h3c2.334 0 3.502 0 4.385-.472a4 4 0 0 0 1.642-1.642c.473-.884.473-2.051.473-4.386s0-3.502-.473-4.386a4 4 0 0 0-1.642-1.642C16.998 9 15.831 9 13.496 9Z"/><circle cx="11.996" cy="15.5" r="2"/></g>',
  disconnect: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M18 18c0 .464 0 .697-.022.892a3.5 3.5 0 0 1-3.086 3.086C14.697 22 14.464 22 14 22h-3c-3.3 0-4.95 0-5.975-1.025S4 18.3 4 15V9c0-3.3 0-4.95 1.025-5.975S7.7 2 11 2h3c.464 0 .697 0 .892.022a3.5 3.5 0 0 1 3.086 3.086C18 5.303 18 5.536 18 6"/><path d="M8.076 11.118C8 11.302 8 11.535 8 12.001s0 .699.076.883a1 1 0 0 0 .541.54c.184.077.417.077.883.077h5c0 1.75.011 2.629.562 2.885q.03.015.063.026c.58.223 1.275-.398 2.666-1.64c1.467-1.312 2.2-1.987 2.209-2.815c-.009-.828-.742-1.503-2.21-2.814c-1.39-1.243-2.085-1.864-2.665-1.641l-.063.026c-.56.26-.562 1.165-.562 2.973h-5c-.466 0-.699 0-.883.076a1 1 0 0 0-.54.541"/></g>',
  copy: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M7.5 14.5c0-3.3 0-4.95 1.025-5.975S11.2 7.5 14.5 7.5s4.95 0 5.975 1.025S21.5 11.2 21.5 14.5s0 4.95-1.025 5.975S17.8 21.5 14.5 21.5s-4.95 0-5.975-1.025S7.5 17.8 7.5 14.5"/><path d="M7.5 16.5c-1.396 0-2.095 0-2.656-.196a3.5 3.5 0 0 1-2.148-2.148C2.5 13.595 2.5 12.896 2.5 11.5v-2c0-3.3 0-4.95 1.025-5.975S6.2 2.5 9.5 2.5h2c1.396 0 2.095 0 2.656.196a3.5 3.5 0 0 1 2.148 2.148c.196.561.196 1.26.196 2.656"/></g>',
  fill: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18 9s-4.419 6-6 6s-6-6-6-6"/>',
  open: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 6.65s6.938-.542 7.915.435S17.35 15 17.35 15m-.85-7.5l-10 10"/>',
  close: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18 6L6 18m12 0L6 6"/>',
  view: '<g fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21.544 11.045c.304.426.456.64.456.955c0 .316-.152.529-.456.955C20.178 14.871 16.689 19 12 19c-4.69 0-8.178-4.13-9.544-6.045C2.152 12.529 2 12.315 2 12c0-.316.152-.529.456-.955C3.822 9.129 7.311 5 12 5c4.69 0 8.178 4.13 9.544 6.045Z"/><path d="M15 12a3 3 0 1 0-6 0a3 3 0 0 0 6 0Z"/></g>',
  hide: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><path d="M22 8s-4 6-10 6S2 8 2 8"/><path stroke-linejoin="round" d="m15 13.5l1.5 2.5m3.5-5l2 2M2 13l2-2m5 2.5L7.5 16"/></g>',
  generate: '<g fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9.414 13.586C8.828 13 7.886 13 6 13s-2.828 0-3.414.586m6.828 0C10 14.172 10 15.114 10 17s0 2.828-.586 3.414m0-6.828Zm-6.828 0C2 14.172 2 15.114 2 17s0 2.828.586 3.414m0-6.828Zm0 6.828C3.172 21 4.114 21 6 21s2.828 0 3.414-.586m-6.828 0Zm6.828 0Zm5.808-15.136C16.74 6.797 17.5 7.556 17.5 8.5s-.76 1.703-2.278 3.222S12.944 14 12 14s-1.703-.76-3.222-2.278S6.5 9.444 6.5 8.5s.76-1.703 2.278-3.222S11.056 3 12 3s1.703.76 3.222 2.278Zm6.192 8.308C20.828 13 19.886 13 18 13s-2.828 0-3.414.586m6.828 0C22 14.172 22 15.114 22 17s0 2.828-.586 3.414m0-6.828Zm-6.828 0C14 14.172 14 15.114 14 17s0 2.828.586 3.414m0-6.828Zm0 6.828C15.172 21 16.114 21 18 21s2.828 0 3.414-.586m-6.828 0Zm6.828 0Z"/><path stroke-linecap="round" d="M12.125 8.5H12m.25 0a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0Z"/></g>',
  success: '<g fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12s4.477 10 10 10s10-4.477 10-10Z"/><path stroke-linecap="round" stroke-linejoin="round" d="m8 12.5l2.5 2.5L16 9"/></g>',
  error: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M13.925 21h-3.85c-4.63 0-6.945 0-7.799-1.506c-.853-1.506.331-3.503 2.7-7.495L6.9 8.753C9.176 4.918 10.313 3 12 3s2.824 1.918 5.1 5.753L19.023 12c2.369 3.992 3.553 5.989 2.7 7.495C20.87 21 18.555 21 13.924 21M12 9v4"/><path d="M12.125 16.75H12m.25 0a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0"/></g>',
}

export function icon(name, size = 18) {
  const body = ICON_BODIES[name]
  if (!body) return ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" color="currentColor" aria-hidden="true">${body}</svg>`
}
