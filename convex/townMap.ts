import { internalMutation } from './_generated/server';
import * as map from '../data/town';

// One-off: swap the default world's map for the 16:9 town map in place, keeping
// characters, memories and everything else. Freeze the world first
// (testing:stop) so the running engine can't write the old map back.
export const applyTownMap = internalMutation({
  handler: async (ctx) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .first();
    if (!worldStatus) {
      throw new Error('No default world');
    }
    const existing = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', worldStatus.worldId))
      .unique();
    if (!existing) {
      throw new Error('No map for the default world');
    }
    await ctx.db.patch(existing._id, {
      width: map.mapwidth,
      height: map.mapheight,
      bgTiles: map.bgtiles,
      objectTiles: map.objmap,
      animatedSprites: map.animatedsprites,
    });
    return { width: map.mapwidth, height: map.mapheight };
  },
});
