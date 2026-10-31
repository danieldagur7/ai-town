import { useSyncExternalStore } from 'react';

// Whether the town's machinery (Convex backend, Ollama) is on, and Start/Stop
// for it, through the dev server's /ai-town/__power endpoints
// (scripts/backend.mjs). Plain fetch: it has to work while Convex is off.

export type Power = { backend: boolean; ollama: boolean; busy: boolean; known: boolean };

let state: Power = { backend: false, ollama: false, busy: false, known: false };
const listeners = new Set<() => void>();
const set = (next: Partial<Power>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

async function refresh() {
  try {
    const s = await (await fetch('/ai-town/__power/status')).json();
    set({ backend: s.backend, ollama: s.ollama, busy: state.busy || s.busy, known: true });
  } catch {
    set({ known: true });
  }
}

export async function powerSwitch(on: boolean) {
  set({ busy: true });
  try {
    await fetch(`/ai-town/__power/${on ? 'start' : 'stop'}`, { method: 'POST' });
  } finally {
    set({ busy: false });
    await refresh();
  }
  // A fresh page connects to the backend straight away rather than waiting
  // out the client's reconnect back-off.
  if (on) location.reload();
}

let started = false;
function startPolling() {
  if (started || !import.meta.env.DEV) return;
  started = true;
  void refresh();
  setInterval(refresh, 3000);
  // While it's on and this tab is visible, tell the dev server someone's playing.
  const ping = () => {
    if (state.backend && document.visibilityState === 'visible') {
      fetch('/ai-town/__power/ping').catch(() => {});
    }
  };
  setInterval(ping, 15_000);
  document.addEventListener('visibilitychange', ping);
}

export function usePower(): Power {
  startPolling();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
