import { describe, expect, it } from 'vitest';
import { buildBuildingModels } from '../src/render/models/buildings';
import { buildUnitModels } from '../src/render/models/units';

const triangles = (g: { getAttribute(name: string): { count: number } | undefined; index: { count: number } | null }): number =>
  (g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)) / 3;

describe('model budgets', () => {
  it('keeps unit models inside their triangle budgets', () => {
    for (const [key, model] of buildUnitModels()) {
      const total =
        triangles(model.hull) + triangles(model.hullTeam) + (model.turret ? triangles(model.turret) : 0) + (model.turretTeam ? triangles(model.turretTeam) : 0);
      const count = model.squad?.length ?? 1;
      expect(total * count, key).toBeLessThanOrEqual(model.squad ? 2400 : 2500);
    }
  });

  it('keeps structures inside their triangle budgets', () => {
    for (const [key, model] of buildBuildingModels()) {
      const total = triangles(model.body) + triangles(model.team) + (model.animated ? triangles(model.animated.geometry) : 0);
      expect(total, key).toBeLessThanOrEqual(8000);
    }
  });
});
