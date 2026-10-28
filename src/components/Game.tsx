import { useEffect, useRef, useState } from 'react';
import PixiGame from './PixiGame.tsx';

import { useElementSize } from 'usehooks-ts';
import { Stage } from '@pixi/react';
import { ConvexProvider, useConvex, useQuery } from 'convex/react';
import PlayerDetails from './PlayerDetails.tsx';
import { api } from '../../convex/_generated/api';
import { useWorldHeartbeat } from '../hooks/useWorldHeartbeat.ts';
import { useHistoricalTime } from '../hooks/useHistoricalTime.ts';
import { DebugTimeManager } from './DebugTimeManager.tsx';
import { GameId } from '../../convex/aiTown/ids.ts';
import { useServerGame } from '../hooks/serverGame.ts';
import { DayNightOverlay, LightningFlash } from './DayNightOverlay.tsx';
import { useGodUi } from '../godUi.tsx';

export const SHOW_DEBUG_UI = !!import.meta.env.VITE_SHOW_DEBUG_UI;

export default function Game() {
  const convex = useConvex();
  const [selectedElement, setSelectedElement] = useState<{
    kind: 'player';
    id: GameId<'players'>;
  }>();
  const [gameWrapperRef, { width, height }] = useElementSize();

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const engineId = worldStatus?.engineId;

  const game = useServerGame(worldId);

  // Send a periodic heartbeat to our world to keep it alive.
  useWorldHeartbeat();

  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const { historicalTime, timeManager } = useHistoricalTime(worldState?.engine);

  const scrollViewRef = useRef<HTMLDivElement>(null);
  // Pixi doesn't see React context, so pass the god UI state in as a prop.
  const { speechRadius } = useGodUi();
  const humanTokenIdentifier = useQuery(api.world.userStatus, worldId ? { worldId } : 'skip');

  // PlayerDetails follows the human's conversation even with nothing selected,
  // so keep the pop-up open while the human is talking to someone.
  const humanPlayer =
    game && [...game.world.players.values()].find((p) => p.human === humanTokenIdentifier);
  const humanConversation = humanPlayer && game.world.playerConversation(humanPlayer);
  const humanInConversation = !!humanConversation;
  // Select whoever the human is talking to, so the pop-up stays on them after
  // the conversation ends and a reply that arrives late still shows up.
  const partnerId =
    humanConversation &&
    [...humanConversation.participants.keys()].find((id) => id !== humanPlayer!.id);
  useEffect(() => {
    if (partnerId) {
      setSelectedElement({ kind: 'player', id: partnerId });
    }
  }, [partnerId]);

  if (!worldId || !engineId || !game) {
    return null;
  }
  const showDetails = !!selectedElement || humanInConversation;
  return (
    <>
      {SHOW_DEBUG_UI && <DebugTimeManager timeManager={timeManager} width={200} height={100} />}
      <div className="relative h-full w-full">
        {/* Game area */}
        <div className="absolute inset-0 overflow-hidden bg-brown-900" ref={gameWrapperRef}>
          <div className="absolute inset-0">
            <div className="container">
              <Stage width={width} height={height} options={{ backgroundColor: 0x7ab5ff }}>
                {/* Re-propagate context because contexts are not shared between renderers.
https://github.com/michalochman/react-pixi-fiber/issues/145#issuecomment-531549215 */}
                <ConvexProvider client={convex}>
                  <PixiGame
                    game={game}
                    worldId={worldId}
                    engineId={engineId}
                    width={width}
                    height={height}
                    historicalTime={historicalTime}
                    setSelectedElement={setSelectedElement}
                    speechRadius={speechRadius}
                  />
                </ConvexProvider>
              </Stage>
            </div>
          </div>
          {game.world.clock && <DayNightOverlay clock={game.world.clock} />}
          {game.world.godSmite && <LightningFlash time={game.world.godSmite.time} />}
        </div>
        {/* Pop-up details panel, shown when an agent is selected */}
        {showDetails && (
          <div
            className="absolute right-4 top-20 bottom-4 z-10 w-[calc(100%-2rem)] sm:w-96 flex flex-col overflow-y-auto px-4 py-6 sm:px-6 border-8 border-brown-900 bg-brown-800 text-brown-100 shadow-2xl"
            ref={scrollViewRef}
          >
            <PlayerDetails
              worldId={worldId}
              engineId={engineId}
              game={game}
              playerId={selectedElement?.id}
              setSelectedElement={setSelectedElement}
              scrollViewRef={scrollViewRef}
            />
          </div>
        )}
      </div>
    </>
  );
}
