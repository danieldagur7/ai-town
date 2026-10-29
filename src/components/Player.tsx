import { Character } from './Character.tsx';
import { orientationDegrees } from '../../convex/util/geometry.ts';
import { GOD_CHARACTER, characters, divineCharacter } from '../../data/characters.ts';
import { toast } from 'react-toastify';
import { Player as ServerPlayer } from '../../convex/aiTown/player.ts';
import { GameId } from '../../convex/aiTown/ids.ts';
import { Id } from '../../convex/_generated/dataModel';
import { Location, locationFields, playerLocation } from '../../convex/aiTown/location.ts';
import { useHistoricalValue } from '../hooks/useHistoricalValue.ts';
import { PlayerDescription } from '../../convex/aiTown/playerDescription.ts';
import { WorldMap } from '../../convex/aiTown/worldMap.ts';
import { ServerGame } from '../hooks/serverGame.ts';
import { Look, Quirk, parseLook, quirkOf } from '../../data/looks.ts';
import { houseAt } from '../../convex/aiTown/beds.ts';

export type SelectElement = (element?: { kind: 'player'; id: GameId<'players'> }) => void;

const logged = new Set<string>();
const STILL = ['😴', '🙏', '⚡', '🤕'];

// Players re-render every frame; their looks only change when they do.
const lookCache = new Map<string, { look: Look; quirk: Quirk }>();
function cachedLook(name: string, character: string) {
  const key = `${name}|${character}`;
  let hit = lookCache.get(key);
  if (!hit) {
    hit = { look: parseLook(character), quirk: quirkOf(name, character) };
    lookCache.set(key, hit);
  }
  return hit;
}

export const Player = ({
  game,
  isViewer,
  player,
  onClick,
  historicalTime,
  effects,
  isSpeaking,
  isThinking,
}: {
  game: ServerGame;
  isViewer: boolean;
  player: ServerPlayer;

  onClick: SelectElement;
  historicalTime?: number;
  effects?: string[];
  isSpeaking: boolean;
  isThinking: boolean;
}) => {
  const playerCharacter = game.playerDescriptions.get(player.id)?.character;
  if (!playerCharacter) {
    throw new Error(`Player ${player.id} has no character`);
  }
  const divine = playerCharacter === GOD_CHARACTER;
  const playerName = game.playerDescriptions.get(player.id)?.name ?? '';
  const cached = cachedLook(playerName, playerCharacter);
  const look = divine ? undefined : cached.look;
  const character = divine ? divineCharacter : characters.find((c) => c.name === look!.base);

  const locationBuffer = game.world.historicalLocations?.get(player.id);
  const historicalLocation = useHistoricalValue<Location>(
    locationFields,
    historicalTime,
    playerLocation(player),
    locationBuffer,
  );
  if (!character) {
    if (!logged.has(playerCharacter)) {
      logged.add(playerCharacter);
      toast.error(`Unknown character ${playerCharacter}`);
    }
    return null;
  }

  if (!historicalLocation) {
    return null;
  }

  const activityEmoji =
    player.activity && player.activity.until > (historicalTime ?? Date.now())
      ? player.activity.emoji
      : undefined;
  // Asleep at home: they're inside the house (Beds.tsx draws the snoring).
  if (activityEmoji === '😴' && houseAt(historicalLocation) !== undefined) {
    return null;
  }
  const tileDim = game.worldMap.tileDim;
  const historicalFacing = { dx: historicalLocation.dx, dy: historicalLocation.dy };
  return (
    <>
      <Character
        x={historicalLocation.x * tileDim + tileDim / 2}
        y={historicalLocation.y * tileDim + tileDim / 2}
        orientation={orientationDegrees(historicalFacing)}
        isMoving={historicalLocation.speed > 0}
        isThinking={isThinking}
        isSpeaking={isSpeaking}
        emoji={activityEmoji}
        isViewer={isViewer}
        textureUrl={character.textureUrl}
        spritesheetData={character.spritesheetData}
        speed={character.speed}
        name={playerName}
        divine={divine}
        look={look}
        // Asleep, praying or stunned people keep still.
        quirk={activityEmoji && STILL.includes(activityEmoji) ? 'still' : cached.quirk}
        effects={effects}
        onClick={() => {
          onClick({ kind: 'player', id: player.id });
        }}
      />
    </>
  );
};
