import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

const THOUGHT_ICONS: Record<string, string> = {
  conversation: '💬',
  reflection: '💭',
  prayer: '🙏',
  godSpeech: '✨',
  punishment: '⚡',
  gathering: '📣',
  relationship: '❤️',
};

function feelingLabel(affinity: number) {
  if (affinity >= 60) return 'close friend';
  if (affinity >= 25) return 'likes';
  if (affinity > -25) return 'neutral';
  if (affinity > -60) return 'dislikes';
  return "can't stand";
}

// What a character has been thinking about lately, and how they feel about everyone.
export function Mind({ worldId, playerId }: { worldId: Id<'worlds'>; playerId: string }) {
  const mind = useQuery(api.agent.relationships.characterMind, { worldId, playerId });
  if (!mind) {
    return null;
  }
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="box">
        <h2 className="bg-brown-700 text-lg text-center">On their mind</h2>
      </div>
      {mind.feelings.length > 0 && (
        <div className="bg-brown-200 text-black p-2 text-sm flex flex-col gap-1">
          {mind.feelings.map((f) => (
            <div key={f.name} className="flex items-center gap-2">
              <span className="w-16 font-bold">{f.name}</span>
              <div className="flex-1 h-2 bg-brown-300 relative">
                <div
                  className={
                    'absolute top-0 h-full ' + (f.affinity >= 0 ? 'bg-green-600' : 'bg-red-600')
                  }
                  style={
                    f.affinity >= 0
                      ? { left: '50%', width: `${f.affinity / 2}%` }
                      : { right: '50%', width: `${-f.affinity / 2}%` }
                  }
                />
              </div>
              <span className="w-24 text-right text-xs">
                {f.crush ? '💘 crush' : feelingLabel(f.affinity)}
              </span>
            </div>
          ))}
        </div>
      )}
      {mind.thoughts.map((t) => (
        <details key={t.id} className="bg-brown-200 text-black p-2 text-xs">
          <summary className="cursor-pointer leading-snug">
            {THOUGHT_ICONS[t.type] ?? '•'} {t.text.length > 90 ? t.text.slice(0, 90) + '…' : t.text}
          </summary>
          <p className="leading-snug mt-1">{t.text}</p>
        </details>
      ))}
    </div>
  );
}
