// Start/stop for the town's machinery: the local Convex backend and Ollama.
// The page is always reachable (it's served by the Vite dev server); both are off
// until you press Start on it, and Stop turns both off again. A web page can't
// start programs, so the dev server does it through these endpoints (see
// `backendSupervisor`, used in vite.config.ts):
//   GET  /ai-town/__power/status  -> { backend: bool, ollama: bool }
//   POST /ai-town/__power/start   -> starts Ollama, then the backend
//   POST /ai-town/__power/stop    -> stops the backend, then Ollama
// Closing every game tab also stops both after IDLE_MS (pages ping while
// visible), unless the world is on Autorun.
//
// `node scripts/backend.mjs start|stop` does the same from a terminal;
// `npm run dev` starts the backend first so functions can be pushed.
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
function killListener(port, name) {
  let pids = [];
  try {
    pids = execFileSync('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN'])
      .toString()
      .split('\n');
  } catch {
    return; // Nothing listening.
  }
  for (const pid of pids.filter(Boolean)) {
    const command = execFileSync('ps', ['-o', 'command=', '-p', pid]).toString();
    if (command.includes(name)) process.kill(Number(pid), 'SIGTERM');
  }
}

export function stopBackend() {
  killListener(3210, 'convex-local-backend');
}

const OLLAMA = 'http://127.0.0.1:11434';

export async function ollamaUp() {
  try {
    return (await fetch(`${OLLAMA}/api/version`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

// Ollama is started here (not as the Homebrew service) with settings tuned for
// this game. Measured on this Mac (M5, 24 GB): the graphics chip is the limit,
// so N requests at once each take about N times as long as one alone (~6 s). More
// slots don't make anyone faster; what keeps the player's replies fast is the
// town holding its lines while they talk (World.humanTalkingIn). Four slots let
// the town's chatter, memories and prayers overlap the rest of the time; flash
// attention and an 8-bit KV cache halve each slot's memory.
const OLLAMA_ENV = {
  OLLAMA_NUM_PARALLEL: '4',
  OLLAMA_FLASH_ATTENTION: '1',
  OLLAMA_KV_CACHE_TYPE: 'q8_0',
  // Chat and embedding models stay loaded together.
  OLLAMA_MAX_LOADED_MODELS: '2',
  OLLAMA_KEEP_ALIVE: '10m',
};

export async function startOllama() {
  if (await ollamaUp()) return;
  mkdirSync(path.join(ROOT, 'logs'), { recursive: true });
  const log = openSync(path.join(ROOT, 'logs/ollama.log'), 'a');
  console.log('[power] starting Ollama');
  spawn('ollama', ['serve'], {
    env: { ...process.env, ...OLLAMA_ENV },
    stdio: ['ignore', log, log],
    detached: true,
  }).unref();
  for (let i = 0; i < 60 && !(await ollamaUp()); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
}

export function stopOllama() {
  // An older setup ran it as a Homebrew service, which launchd would restart.
  try {
    execFileSync('brew', ['services', 'stop', 'ollama'], { stdio: 'ignore' });
  } catch {
    // Not installed as a service, or already stopped.
  }
  killListener(11434, 'ollama');
}

export async function powerOn() {
  await startOllama();
  await startBackend({ detached: true });
}

export function powerOff() {
  stopBackend();
  stopOllama();
}

/** @returns {import('vite').Plugin} */
export function backendSupervisor() {
  return {
    name: 'power-switch',
    apply: /** @type {const} */ ('serve'),
    configureServer(server) {
      // On only after Start is pressed; `npm run dev` brings the backend up just
      // to push code, and it goes off again after the grace period.
      const startedAt = Date.now();
      let poweredOn = false;
      let lastPing = 0;
      // Restarted while the town was on (Vite reloads when this file changes):
      // carry on as switched on.
      void Promise.all([isUp(), ollamaUp()]).then(([backend, ollama]) => {
        if (backend && ollama) {
          poweredOn = true;
          lastPing = Date.now();
        }
      });
      let busy;
      const reply = (res, value) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(value));
      };
      const status = async () => ({ backend: await isUp(), ollama: await ollamaUp() });
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/ai-town/__power/')) return next();
        const action = url.slice('/ai-town/__power/'.length).split('?')[0];
        if (action === 'ping') {
          lastPing = Date.now();
          res.end('ok');
          return;
        }
        if (action === 'status') {
          status().then((s) => reply(res, { ...s, busy: !!busy }));
          return;
        }
        if ((action === 'start' || action === 'stop') && req.method === 'POST') {
          console.log(`[power] ${action}`);
          poweredOn = action === 'start';
          lastPing = Date.now();
          busy ??= (action === 'start' ? powerOn() : Promise.resolve(powerOff())).finally(
            () => (busy = undefined),
          );
          busy.then(
            async () => reply(res, await status()),
            (e) => {
              res.statusCode = 500;
              res.end(String(e));
            },
          );
          return;
        }
        res.statusCode = 404;
        res.end();
      });
      // Not switched on, or nobody watching, and not on Autorun: switch off.
      const timer = setInterval(async () => {
        if (busy || Date.now() - startedAt < IDLE_MS) return;
        if (poweredOn && Date.now() - lastPing < IDLE_MS) return;
        const [backend, ollama] = [await isUp(), await ollamaUp()];
        if (!backend && !ollama) return;
        if (backend && (await autorunOn())) return;
        console.log('[power] nobody is playing and Autorun is off: switching off');
        poweredOn = false;
        powerOff();
      }, CHECK_MS);
      server.httpServer?.on('close', () => clearInterval(timer));
    },
  };
}

const command = process.argv[1] === fileURLToPath(import.meta.url) ? process.argv[2] : undefined;
if (command === 'start-backend') {
  await startBackend({ detached: true });
} else if (command === 'start') {
  await powerOn();
  console.log(
    (await isUp()) ? '[power] on' : '[power] backend did not come up, see logs/backend.log',
  );
} else if (command === 'stop') {
  powerOff();
  console.log('[power] off');
}
