import { powerSwitch, usePower } from '../power';
import Button from './buttons/Button';
import stopImg from '../../assets/close.svg';

// While everything is off: a screen with Start, over the (empty) game.
export function PowerScreen() {
  const power = usePower();
  if (!import.meta.env.DEV || !power.known || (power.backend && !power.busy)) return null;
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[#181425]/85 p-4">
      <div className="max-w-sm border-8 border-brown-900 bg-brown-800 p-6 text-center text-brown-100 shadow-2xl">
        <h2 className="font-display text-3xl">🌙 The town is asleep</h2>
        <p className="mt-3 text-sm text-brown-300">
          The town's server and the AI (Ollama) are off, so nothing runs and nothing uses your
          computer. Start them to play.
        </p>
        <p className="mt-3 text-sm">
          {power.ollama ? '🟢' : '⚪️'} AI &nbsp; {power.backend ? '🟢' : '⚪️'} Town server
        </p>
        <button
          className="mt-4 w-full bg-clay-700 py-2 text-xl text-white disabled:opacity-60"
          disabled={power.busy}
          onClick={() => void powerSwitch(true)}
        >
          {power.busy ? 'Waking the town…' : '▶ Start'}
        </button>
      </div>
    </div>
  );
}

// While it's on: Stop, in the toolbar.
export function StopButton() {
  const power = usePower();
  if (!import.meta.env.DEV || !power.backend) return null;
  return (
    <Button
      imgUrl={stopImg}
      title="Switch off the town's server and the AI. The page stays open; press Start to come back."
      onClick={() => void powerSwitch(false)}
    >
      {power.busy ? 'Stopping…' : 'Stop'}
    </Button>
  );
}
