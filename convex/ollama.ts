import { v } from 'convex/values';
import { internalAction, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { LLM_CONFIG, ollamaUrl } from './util/llm';

// When the world pauses (tab hidden/closed) or is frozen, free the memory the
// local models hold. The Ollama server itself keeps running (it's tiny when
// idle) so the world can wake up on its own; models reload on the next request.
export const unloadModels = internalAction({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    // Woken up again meanwhile: leave the models loaded.
    if (await ctx.runQuery(internal.ollama.worldRunning, { worldId })) return;
    const chat = process.env.LLM_MODEL ?? process.env.OLLAMA_MODEL ?? LLM_CONFIG.chatModel;
    const requests = [
      fetch(ollamaUrl('/api/generate'), {
        method: 'POST',
        body: JSON.stringify({ model: chat, keep_alive: 0 }),
      }),
      fetch(ollamaUrl('/api/embed'), {
        method: 'POST',
        body: JSON.stringify({ model: LLM_CONFIG.embeddingModel, input: '', keep_alive: 0 }),
      }),
    ];
    const results = await Promise.allSettled(requests);
    console.log(
      `World paused: unloaded Ollama models (${results.map((r) => r.status).join(', ')})`,
    );
  },
});

export const worldRunning = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, { worldId }) => {
    const status = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .first();
    return status?.status === 'running';
  },
});
