import type { Game } from './game';
import { FIELDS } from '../../data/town';
import { GOD_CHARACTER } from '../../data/characters';
import { FIELD_YIELD, FOOD_PER_PERSON, STARVATION_DAYS } from '../constants';

// Each morning (plain game logic): the fields yield, everyone eats, and a town
// that can't feed itself suffers for it.
export function morningMeal(game: Game) {
  const world = game.world;
  const eaters =
    world.agents.size +
    [...world.players.values()].filter(
      (p) => p.human && game.playerDescriptions.get(p.id)?.character !== GOD_CHARACTER,
    ).length;
  const food = world.resources.food + FIELDS.length * FIELD_YIELD - eaters * FOOD_PER_PERSON;
  if (food >= 0) {
    world.resources.food = food;
    world.hungryDays = 0;
    return;
  }
  world.resources.food = 0;
  world.hungryDays = (world.hungryDays ?? 0) + 1;
  game.scheduleOperation('everyoneWellbeing', { worldId: game.worldId, delta: -10 });
  game.scheduleOperation('townEvent', {
    worldId: game.worldId,
    emoji: '🍞',
    text:
      world.hungryDays >= STARVATION_DAYS
        ? 'The town is starving.'
        : 'There was not enough food to go around this morning.',
  });
  if (world.hungryDays >= STARVATION_DAYS) {
    game.scheduleOperation('starve', { worldId: game.worldId });
    world.hungryDays = 0;
  }
}
