import { Game } from './game';
import { GameId } from './ids';
import { Point } from '../util/types';
import { BEDS, SPARE_BEDS } from '../../data/beds';

export function bedFor(game: Game, playerId: GameId<'players'>): Point | undefined {
  const name = game.playerDescriptions.get(playerId)?.name;
  if (name && BEDS[name]) {
    return BEDS[name];
  }
  // Hand out spare beds in a stable order to agents without a named bed.
  const unnamed = [...game.world.agents.values()]
    .map((a) => a.playerId)
    .filter((id) => {
      const n = game.playerDescriptions.get(id)?.name;
      return !n || !BEDS[n];
    })
    .sort();
  const index = unnamed.indexOf(playerId);
  return index >= 0 ? SPARE_BEDS[index % SPARE_BEDS.length] : undefined;
}
