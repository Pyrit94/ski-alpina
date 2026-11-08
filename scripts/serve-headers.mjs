/**
 * Response headers for the production server (`vite preview` in Docker).
 *
 * Caching: built files carry a content hash in their name, so a phone may keep
 * them for a year and never ask again; images and map pictures change rarely
 * and keep a day; the page itself is always checked, so a deploy is seen at
 * once. Without these, every visit downloaded the whole game again.
 *
 * Hardening: no MIME sniffing, no full URLs in referrers, no camera or
 * microphone, and — on a self-hosted deployment, where nobody needs to embed
 * the game — no framing by other sites (clickjacking of confirm buttons).
 */
export function headersFor(pathname, env = process.env) {
  const out = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
  if (env.DOCKER_PREVIEW === "1" && env.BETTER_AUTH_URL?.trim()) {
    out["content-security-policy"] = "frame-ancestors 'self'";
    out["x-frame-options"] = "SAMEORIGIN";
  }
  if (pathname.startsWith("/assets/")) {
    out["cache-control"] = "public, max-age=31536000, immutable";
  } else if (pathname.startsWith("/models/")) {
    // The manifest says which models exist; an hour keeps a new one close.
    out["cache-control"] = "public, max-age=3600";
  } else if (/\.(?:png|jpe?g|webp|avif|svg|ico|woff2?|glb)$/i.test(pathname)) {
    out["cache-control"] = "public, max-age=86400";
  }
  return out;
}

/** The Vite plugin: sets the headers before the preview server answers. */
export function serveHeadersPlugin() {
  return {
    name: "ski-serve-headers",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        let pathname = "/";
        try {
          pathname = new URL(req.url ?? "/", "http://x").pathname;
        } catch {
          // A malformed URL gets the safe defaults and no caching.
        }
        for (const [k, v] of Object.entries(headersFor(pathname))) res.setHeader(k, v);
        next();
      });
    },
  };
}
