// Guarded PWA service-worker registration.
// Registers /sw.js ONLY on the published app — never in the Lovable editor
// preview, an iframe, or dev — so previews never serve stale HTML.
export function registerPWA() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const host = window.location.hostname;
  const inIframe = window.self !== window.top;
  const swOff = new URLSearchParams(window.location.search).get("sw") === "off";

  const blocked =
    !import.meta.env.PROD ||
    inIframe ||
    swOff ||
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev");

  if (blocked) {
    navigator.serviceWorker
      .getRegistrations?.()
      .then((regs) => {
        regs.forEach((r) => {
          if (r.active?.scriptURL.endsWith("/sw.js")) r.unregister();
        });
      })
      .catch(() => {});
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
