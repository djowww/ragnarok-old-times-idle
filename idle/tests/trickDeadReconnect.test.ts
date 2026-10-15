import { describe, expect, it } from 'vitest';
import raw from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types';
import { applyCommand, advanceState, createInitialState } from '../engine';
import { beginBattle } from '../engine/encounters';
import { BATTLE_HERO } from '../shared/battleSpatial';
import { SessionStateRepository } from '../server/sessionState';
import type { StateRepository } from '../server/repository';

function fixture() {
  const c = structuredClone(raw) as unknown as Catalog;
  const s = createInitialState(c, 0, 'isolated reconnect');
  c.classes.novice.hp[0] = 100000; c.classes.novice.sp[0] = 1000;
  s.hp = 100000; s.sp = 100;
  s.status = 'hunting'; s.areaId = 'prontera-field'; s.rotation = [];
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  s.learnedSkills.nv_trickdead = 1;
  Object.assign(c.monsters[1002], { hp: 100000, attack: [0,0], baseExp: 0, jobExp: 0 });
  beginBattle(s, c, 1002, 0);
  const e = s.battle!.enemies![0]; s.battle!.enemies = [e];
  Object.assign(e, { hp: 100000, maxHp: 100000, position: { ...BATTLE_HERO }, approachFrom: { ...BATTLE_HERO }, arrivedAt: 0 });
  s.battle!.targetId = e.id;
  let saved = JSON.stringify(s);
  const durable: StateRepository = {
    read: async () => JSON.parse(saved), health: async () => true,
    transact: async (_id, action) => { const next = action(JSON.parse(saved) as GameState); saved = JSON.stringify(next); return JSON.parse(saved); },
  };
  return { c, repository: new SessionStateRepository(durable), durable, enemyId: e.id };
}

describe('Trick Dead NoSave offensive clocks', () => {
  it.each(['reconnect', 'restart'] as const)('resumes the existing battle after %s, without a stop/start or death', async mode => {
    const { c, repository, durable, enemyId } = fixture();
    await repository.openSession('before', state => state);
    const active = await repository.transact(null, state => applyCommand(state, c, { type: 'toggleBuff', skillId: 'nv_trickdead' }, 0));
    expect(active.buffs.nv_trickdead).toBeDefined();
    const current = mode === 'restart' ? new SessionStateRepository(durable) : repository;
    const resumed = await current.openSession('after', state => advanceState(state, c, 5000));
    expect(resumed.buffs.nv_trickdead).toBeUndefined();
    expect(resumed.hp).toBeGreaterThan(0);
    expect(resumed.events.some(event => event.sourceActorId === resumed.id && event.actorAction === 'attack' && event.targetActorId === enemyId)).toBe(true);
    expect(resumed.battle?.enemies?.some(enemy => enemy.id === enemyId)).toBe(true);
  });
});
