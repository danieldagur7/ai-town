import { FAITH_MAX } from '../constants';

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
