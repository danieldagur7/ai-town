import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useSendInput } from '../hooks/sendInput';
import { toastOnError } from '../toasts';
import Button from './buttons/Button';
import sunImg from '../../assets/sun.svg';
import skipImg from '../../assets/skip.svg';
import closeImg from '../../assets/close.svg';
import { Id } from '../../convex/_generated/dataModel';

// The god's toolbox: a pop-up menu that collects the god-mode features.
export default function GodMenu() {
  const [open, setOpen] = useState(false);
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  return (
    <>
      <Button imgUrl={sunImg} title="Open the god menu" onClick={() => setOpen(!open)}>
        God Mode
      </Button>
      {open && worldStatus && (
        <GodMenuPanel engineId={worldStatus.engineId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function GodMenuPanel({ engineId, onClose }: { engineId: Id<'engines'>; onClose: () => void }) {
  const skipToNextPhase = useSendInput(engineId, 'skipToNextPhase');
  return (
    <div className="pointer-events-auto absolute left-3 top-full z-20 w-80 max-w-[calc(100vw-1.5rem)] border-8 border-brown-900 bg-brown-800 text-brown-100 shadow-2xl p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-display game-title">God Mode</h2>
        <a className="button text-white shadow-solid cursor-pointer" onClick={onClose}>
          <span className="inline-block bg-clay-700">
            <img className="w-4 h-4 sm:w-5 sm:h-5" src={closeImg} />
          </span>
        </a>
      </div>
      <section className="flex flex-col gap-2">
        <h3 className="text-xl">Time</h3>
        <Button
          imgUrl={skipImg}
          title="Jump to the start of the next phase of the day"
          onClick={() => void toastOnError(skipToNextPhase({}))}
        >
          Skip to next phase
        </Button>
      </section>
    </div>
  );
}
