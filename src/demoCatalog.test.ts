import { expect, it } from 'vitest';
import { emptyDemoSeed } from './demoCatalog';
import { convertToV3 } from './hub';
it('boots with fictional examples and no preloaded business records or connection addresses', () => {
  const state = convertToV3(emptyDemoSeed());
  expect(state.agents).toHaveLength(3);
  expect(state.agents.filter(a => a.intake)).toHaveLength(1);
  expect(state.agents.every(a => a.name.startsWith('샘플 ') && !a.link1 && !a.link2 && !a.defaultModel)).toBe(true);
  expect(state.profiles.every(p => p.mode === 'demo' && !p.baseUrl)).toBe(true);
  for (const key of ['works','threads','messages','artifacts','requests','tags','taskInputs'] as const) expect(state[key]).toEqual([]);
});
