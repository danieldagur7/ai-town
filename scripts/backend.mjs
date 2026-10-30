// Runs the local Convex backend only while someone is playing (or the town is
// on Autorun). A web page can't start programs, so the Vite dev server does it
// (see `backendSupervisor` below, used in vite.config.ts): open game tabs ping
// /ai-town/__backend/ping while visible; a ping starts the backend if it's down,
// and once nobody has pinged for IDLE_MS it is shut down unless the world is on
// Autorun. By then the world has paused itself and Ollama has unloaded.
//
// `node scripts/backend.mjs start` starts it (detached) and waits until it's up;
// `npm run dev` runs this first so functions can be pushed.
import { execFileSync, spawn } from 'child_process';
import { mkdirSync, openSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BINARY = path.resolve(ROOT, '../convex-backend-dl/convex-local-backend');
const URL = 'http://127.0.0.1:3210';
const IDLE_MS = 90_000;
const CHECK_MS = 15_000;
// The old public local-dev defaults; they must match the admin key in Justfile.
const ARGS = [
  '--interface',
  '127.0.0.1',
  '--instance-name',
  'carnitas',
  '--instance-secret',
  '4361726e697461732c206c69746572616c6c79206d65616e696e6720226c6974',
];

export async function isUp() {
  try {
    return (await fetch(`${URL}/version`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

// Starts the backend unless it's already up, and waits for it. Returns the
// child process when this call started it.
export async function startBackend({ detached }) {
  if (await isUp()) return undefined;
  mkdirSync(path.join(ROOT, 'logs'), { recursive: true });
  const log = openSync(path.join(ROOT, 'logs/backend.log'), 'a');
  console.log('[backend] starting the Convex backend');
  const child = spawn(BINARY, ARGS, {
    cwd: ROOT,
    env: { ...process.env, DISABLE_BEACON: '1' },
    stdio: ['ignore', log, log],
    detached,
  });
  if (detached) child.unref();
  for (let i = 0; i < 120 && !(await isUp()); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  return child;
}

async function autorunOn() {
  try {
    const res = await fetch(`${URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'world:defaultWorldStatus', args: {}, format: 'json' }),
      signal: AbortSignal.timeout(3000),
    });
    return !!(await res.json())?.value?.autorun;
  } catch {
    // Can't tell: leave it running rather than cut off a running town.
    return true;
  }
}

// Stops whichever convex-local-backend listens on the port (ours, or one
// started by hand in a terminal).
export function stopBackend() {
  let pids = [];
  try {
    pids = execFileSync('lsof', ['-tiTCP:3210', '-sTCP:LISTEN']).toString().split('\n');
  } catch {
    return; // Nothing listening.
  }
  for (const pid of pids.filter(Boolean)) {
    const command = execFileSync('ps', ['-o', 'command=', '-p', pid]).toString();
    if (command.includes('convex-local-backend')) process.kill(Number(pid), 'SIGTERM');
  }
}

/** @returns {import('vite').Plugin} */
export function backendSupervisor() {
  return {
    name: 'backend-supervisor',
    apply: /** @type {const} */ ('serve'),
    configureServer(server) {
      // Starting the dev server counts as a visit, so the backend gets the
      // same grace period as a just-closed tab.
      let lastPing = Date.now();
      let starting;
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/ai-town/__backend/ping')) return next();
        lastPing = Date.now();
        starting ??= startBackend({ detached: true }).finally(() => (starting = undefined));
        starting.then(
          () => res.end('ok'),
          (e) => {
            res.statusCode = 500;
            res.end(String(e));
          },
        );
      });
      const timer = setInterval(async () => {
        if (Date.now() - lastPing < IDLE_MS || starting) return;
        if ((await isUp()) && !(await autorunOn())) {
          console.log('[backend] nobody is playing and Autorun is off: stopping the backend');
          stopBackend();
        }
      }, CHECK_MS);
      server.httpServer?.on('close', () => clearInterval(timer));
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === 'start') {
  await startBackend({ detached: true });
  console.log((await isUp()) ? '[backend] up' : '[backend] did not come up, see logs/backend.log');
}
