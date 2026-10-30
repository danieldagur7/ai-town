// While this tab is visible, tell the dev server someone is playing, so it
// starts the local Convex backend if it's off and keeps it on
// (scripts/backend.mjs). Plain fetch: it has to work before Convex is up.
const PING_MS = 15_000;

export function keepBackendAwake() {
  if (!import.meta.env.DEV) return;
  const ping = () => {
    if (document.visibilityState === 'visible') {
      fetch('/ai-town/__backend/ping').catch(() => {});
    }
  };
  ping();
  setInterval(ping, PING_MS);
  document.addEventListener('visibilitychange', ping);
}
