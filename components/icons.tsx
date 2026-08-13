/** Ein einziger Strichstil für alle Symbole – 24er-Raster, 1.7 Strichstärke. */
type P = { className?: string };

export const IconPlus = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconSearch = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </svg>
);

export const IconClose = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconHeart = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path d="M12 4.6c1.7-2 4.6-2 6.3 0 1.6 1.9 1.5 4.8-.3 6.6L12 18l-6-6.8c-1.8-1.8-1.9-4.7-.3-6.6 1.7-2 4.6-2 6.3 0Z" />
  </svg>
);

export const IconTrash = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path d="M4 7h16M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7M6.5 7l.8 12.1A2 2 0 0 0 9.3 21h5.4a2 2 0 0 0 2-1.9L17.5 7" />
  </svg>
);

export const IconBook = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path d="M6 4h9a3 3 0 0 1 3 3v13H8a2 2 0 0 1-2-2V4Z" />
    <path d="M6 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2" />
  </svg>
);

export const IconChart = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path d="M4 15.5 9 10l3.5 3.5L20 6" />
    <path d="M4 20h16" />
  </svg>
);

export const IconGear = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1.1Z" />
  </svg>
);

export const IconDrop = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path d="M12 3.6c2.6 3.1 4.4 5.6 4.4 7.9a4.4 4.4 0 0 1-8.8 0c0-2.3 1.8-4.8 4.4-7.9Z" />
  </svg>
);

export const IconComment = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.5 9.5 0 0 1-3.2-.6L4 21l1.4-4.2A8.2 8.2 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.5a8.4 8.4 0 0 1 9 8Z" />
  </svg>
);

export const IconUsers = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <circle cx="9" cy="8" r="3.4" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M17.5 14.6A5.5 5.5 0 0 1 20.5 20" />
  </svg>
);

export const IconCompass = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="m15 9-1.8 4.2L9 15l1.8-4.2L15 9Z" />
  </svg>
);

export const IconBack = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </svg>
);

export const IconLock = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <rect x="4.8" y="10.4" width="14.4" height="9.4" rx="2.6" />
    <path d="M8.4 10.4V7.8a3.6 3.6 0 0 1 7.2 0v2.6" />
  </svg>
);

export const IconGlobe = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M3.4 12h17.2M12 3.4c2.2 2.4 3.4 5.4 3.4 8.6S14.2 18.2 12 20.6c-2.2-2.4-3.4-5.4-3.4-8.6S9.8 5.8 12 3.4Z" />
  </svg>
);

export const IconSend = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <path d="M20 12 4.5 5.5 7 12l-2.5 6.5L20 12Z" />
    <path d="M7 12h13" />
  </svg>
);
