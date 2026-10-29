import * as PIXI from 'pixi.js';
import { Container, Graphics, Sprite } from '@pixi/react';
import { useCallback, useMemo } from 'react';
import { Project as ProjectState, projectStage } from '../../convex/aiTown/project';
import { STATUE_SITE } from '../../data/town';

// Stage art, generated locally with ../imagegen (see CLAUDE.md).
const STAGE_ART = [0, 1, 2].map((i) => `/ai-town/assets/projects/statue_${i}.png`);

// The town's statue on the plaza: its current build stage, and a progress bar
// while it's going up.
export function ProjectSite({ project, tileDim }: { project: ProjectState; tileDim: number }) {
  const stage = projectStage(project);
  const texture = useMemo(() => {
    const t = PIXI.Texture.from(STAGE_ART[stage]);
    t.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    return t;
  }, [stage]);
  const done = project.finishedDay !== undefined;
  const fraction = project.work / project.workNeeded;
  const x = (STATUE_SITE.x + 0.5) * tileDim;
  const y = (STATUE_SITE.y + 1) * tileDim;
  const drawBar = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      if (done) return;
      const w = tileDim * 3;
      g.beginFill(0x1a1423, 0.85);
      g.drawRoundedRect(-w / 2 - 2, 0, w + 4, 10, 3);
      g.endFill();
      g.beginFill(0xf2c14e);
      g.drawRoundedRect(-w / 2, 2, Math.max(2, w * fraction), 6, 2);
      g.endFill();
    },
    [done, fraction, tileDim],
  );
  return (
    <Container x={x} y={y}>
      <Sprite texture={texture} anchor={{ x: 0.5, y: 1 }} />
      <Graphics draw={drawBar} y={4} />
    </Container>
  );
}
