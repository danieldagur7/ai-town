import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useServerGame } from '../hooks/serverGame';
import { townLooks } from '../../convex/aiTown/townView';

// The town's stockpile, next to the clock.
export default function ResourceBar() {
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const game = useServerGame(worldStatus?.worldId);
  if (!game) {
    return null;
  }
  const { wood, stone, food } = game.world.resources;
  const project = game.world.project;
  const looks = townLooks(game.world.structures);
  return (
    <div
      className="pointer-events-auto bg-brown-800 border-4 border-brown-900 text-brown-100 shadow-solid text-xl px-3 py-1 flex gap-4"
      title="Town stockpile: wood, stone, food"
    >
      <span>🪵 {Math.floor(wood)}</span>
      <span>🪨 {Math.floor(stone)}</span>
      <span>🌾 {Math.floor(food)}</span>
      <span title={`How lovely the town looks: ${looks.notes.join('; ')}`}>✨ {looks.beauty}</span>
      {project && (
        <span title={project.name}>
          {project.kind === 'statue' ? '🗿' : '🏗️'}{' '}
          {Math.floor((100 * project.work) / project.workNeeded)}%
        </span>
      )}
    </div>
  );
}
