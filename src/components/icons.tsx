const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export const IconHome = () => (
  <svg {...base}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
)
export const IconUsers = () => (
  <svg {...base}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.4 3.4-5.5 6.5-5.5s5.7 2.1 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14.8c1.8.8 3 2.6 3.5 5.2" /></svg>
)
export const IconDoc = () => (
  <svg {...base}><path d="M6 2.5h8l4 4V21.5H6z" /><path d="M14 2.5v4h4" /><path d="M9 12h6M9 16h6" /></svg>
)
export const IconGear = () => (
  <svg {...base}><path d="M4 21V14M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1.5 14h5M9.5 8h5M17.5 16h5" /></svg>
)
export const IconPlus = () => (
  <svg {...base} strokeWidth={2.5}><path d="M12 5v14M5 12h14" /></svg>
)
export const IconShare = () => (
  <svg {...base}><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 13v8h14v-8" /></svg>
)
export const IconDownload = () => (
  <svg {...base}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
)
export const IconRepeat = () => (
  <svg {...base}><path d="M17 2.5 20.5 6 17 9.5" /><path d="M3.5 12V10a4 4 0 0 1 4-4h13" /><path d="M7 21.5 3.5 18 7 14.5" /><path d="M20.5 12v2a4 4 0 0 1-4 4h-13" /></svg>
)
export const IconPhone = () => (
  <svg {...base}><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2" /></svg>
)
export const IconMail = () => (
  <svg {...base}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6 8.5 7 8.5-7" /></svg>
)
export const IconCar = () => (
  <svg {...base}><path d="M5 17H3v-5l2-5h14l2 5v5h-2" /><circle cx="7.5" cy="17" r="2" /><circle cx="16.5" cy="17" r="2" /><path d="M9.5 17h5M3 12h18" /></svg>
)
export const IconTrash = () => (
  <svg {...base}><path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3" /></svg>
)
export const IconX = () => (
  <svg {...base}><path d="M6 6l12 12M18 6 6 18" /></svg>
)
