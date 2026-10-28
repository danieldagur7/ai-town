import { DatabaseWriter } from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { FAITH_MAX, FAITH_START } from '../constants';

export async function adjustFaith(
  db: DatabaseWriter,
  worldId: Id<'worlds'>,
  playerId: string,
  delta: number,
) {
  const faith = await db
    .query('faith')
    .withIndex('playerId', (q) => q.eq('worldId', worldId).eq('playerId', playerId))
    .first();
  const score = Math.min(FAITH_MAX, Math.max(0, (faith?.score ?? FAITH_START) + delta));
  if (faith) {
    await db.patch(faith._id, { score });
  } else {
    await db.insert('faith', { worldId, playerId, score });
  }
}

// How a character feels about the god, for prayer and conversation prompts.
export function faithDescription(score: number) {
  const f = score / FAITH_MAX;
  if (f >= 0.75) {
    return 'You trust the unseen god deeply; you feel it has listened to you.';
  }
  if (f >= 0.4) {
    return "You believe in the unseen god, though you're not sure how closely it listens.";
  }
  if (f >= 0.15) {
    return "Your faith in the unseen god has been shaken; you're not sure anyone is listening.";
  }
  return 'You barely believe in the unseen god anymore and feel ignored by it.';
}
