import { inputHandler } from './inputHandler';
import { clockState } from './clock';

// God mode controls, sent from the God menu in the UI.
export const godModeInputs = {
  skipToNextPhase: inputHandler({
    args: {},
    handler: (game, now, _args) => {
      const clock = game.world.clock ?? { elapsed: 0, lastTick: now };
      // Land just past the boundary so the new phase is unambiguous.
      clock.elapsed += clockState(clock.elapsed).msUntilNextPhase + 1;
      game.world.clock = clock;
      return clockState(clock.elapsed).phase;
    },
  }),
};
