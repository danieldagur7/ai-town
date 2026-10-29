import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { toastOnError } from '../toasts';
import Button from './buttons/Button';
import runImg from '../../assets/skip.svg';

// Autorun keeps the town living with no tab open, so it can advance for hours
// in the background. Off, the world pauses shortly after you stop watching.
export default function AutorunButton() {
  const world = useQuery(api.world.defaultWorldStatus);
  const setAutorun = useMutation(api.world.setAutorun);
  if (!world) return null;
  const on = !!world.autorun;
  return (
    <Button
      imgUrl={runImg}
      title={
        on
          ? 'The town keeps living while this tab is closed. Click to pause it when nobody is watching.'
          : 'Keep the town living in the background, even with this tab closed.'
      }
      onClick={() => void toastOnError(setAutorun({ worldId: world.worldId, autorun: !on }))}
    >
      {on ? 'Autorun: on' : 'Autorun: off'}
    </Button>
  );
}
