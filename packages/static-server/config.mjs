// Browser configuration and security headers, both derived from the
// environment so one image works in every deployment.

const DEFAULT_API_URL = "http://127.0.0.1:8000";

// window.__MINNUMST_ENV__ with the variables named in RUNTIME_CONFIG_KEYS.
// Every browser receives this script, so only list values that are public.
export function runtimeConfigScript(env) {
  const keys = (env.RUNTIME_CONFIG_KEYS ?? "VITE_API_URL").split(/\s+/);
  const config = Object.fromEntries(
    keys.filter(Boolean).map((key) => [key, env[key] ?? ""]),
  );
  return `window.__MINNUMST_ENV__ = ${JSON.stringify(config)};\n`;
}

export function apiOrigin(env) {
  return new URL(env.VITE_API_URL?.trim() || DEFAULT_API_URL).origin;
}

// Same-origin everything: the bundle loads no third-party scripts, styles,
// fonts or frames, and only talks to its own origin and the API.
export function securityHeaders(env) {
  const contentSecurityPolicy = [
    "default-src 'self'",
    `connect-src 'self' ${apiOrigin(env)}`,
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  return {
    "Content-Security-Policy": contentSecurityPolicy,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy":
      "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}
