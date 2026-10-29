import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useServerGame } from '../hooks/serverGame';

// The town's stockpile, next to the clock.
export default function ResourceBar() {
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const game = useServerGame(worldStatus?.worldId);
  if (!game) {
    return null;
  }
  const { wood, stone, food } = game.world.resources;
  const project = game.world.project;
  return (
    <div
      className="pointer-events-auto bg-brown-800 border-4 border-brown-900 text-brown-100 shadow-solid text-xl px-3 py-1 flex gap-4"
      title="Town stockpile: wood, stone, food"
    >
      <span>🪵 {Math.floor(wood)}</span>
      <span>🪨 {Math.floor(stone)}</span>
      <span>🌾 {Math.floor(food)}</span>
      {project && (
        <span title={project.name}>
          {project.kind === 'statue' ? '🗿' : '🏗️'}{' '}
          {Math.floor((100 * project.work) / project.workNeeded)}%
        </span>
      )}
    </div>
  );
}
