// Response headers for every HTML page the Worker renders (static files get the same set from public/_headers).
//
// The CSP here is deliberately the part that cannot break the site: no plugins, no <base> hijacking, no form
// posts to other origins. A script/style allow-list is not set because pages still use inline scripts and styles,
// Firebase sign-in popups, and YouTube/Vimeo/itch.io embeds — see README "보안" for the next step.
// Pages are not given frame-ancestors: ChatGPT Sites previews may frame the site. /admin is never framed.
const CSP = "object-src 'none'; base-uri 'self'; form-action 'self'";

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  // Firebase's Google sign-in popup needs to talk back to this window
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Content-Security-Policy': CSP,
};

/** The operator dashboard: same set, and it may never be shown inside another page (clickjacking). */
export const ADMIN_HEADERS: Record<string, string> = {
  ...SECURITY_HEADERS,
  'Content-Security-Policy': `${CSP}; frame-ancestors 'none'`,
  'X-Frame-Options': 'DENY',
};

/** Cache-busting token for /ds.css, /app.js … — changes with every build (vite `define`, see vite.config.ts). */
declare const __ASSET_VERSION__: string;
export const ASSET_VERSION = typeof __ASSET_VERSION__ === 'string' ? __ASSET_VERSION__ : 'dev';
/** `/ds.css` → `/ds.css?v=<build>`; versioned files may be cached for a long time (public/_headers). */
export const asset = (path: string) => `${path}?v=${ASSET_VERSION}`;
/** Adds the build version to local .css/.js references in a static HTML document (site.html, admin.html). */
export const versionAssets = (html: string) =>
  html.replace(/(\s(?:href|src)=")(\/?[\w./-]+\.(?:css|js))(")/g, (_m, pre: string, path: string, post: string) => `${pre}${path.startsWith('/') ? path : '/' + path}?v=${ASSET_VERSION}${post}`);
