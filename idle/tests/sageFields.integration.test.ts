import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, type Pool } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { createInitialState } from '../engine';
import { derivedStats } from '../engine/stats';
import { GameRepository, migrate } from '../server/repository';
import { SessionStateRepository } from '../server/sessionState';
import { placeSageField } from '../engine/sageFields';
import { captureGroundPlacement } from '../engine/groundUnitOccupancy';
import { BATTLE_HERO } from '../shared/battleSpatial';

describe.skipIf(process.env.IDLE_DB_TEST !== '1')('Sage fields over real MariaDB', () => {
  let pool: Pool;
  const ids: string[] = [];
  beforeAll(async () => {
    pool = createPool({ host: process.env.DB_HOST ?? 'database', port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, charset: 'utf8mb4' });
    await migrate(pool);
  });
  afterAll(async () => {
    for (const id of ids) await pool.execute('DELETE FROM idle_profiles WHERE id = ?', [id]);
    await pool.end();
  });
  it.each([false, true])('preserves session HP and receipts while stripping NoSave (cooperative=%s)', async cooperative => {
    const c = structuredClone(raw) as unknown as Catalog, id = `test-${randomUUID()}`;
    ids.push(id);
    const seed = createInitialState(c, 0);
    seed.job = 'sage'; seed.status = 'hunting'; seed.areaId = 'prontera_south'; seed.rotation = [];
    seed.inventory.push({ uid: 'water-armor', itemId: 2346, quantity: 1, identified: true, refine: 0, cards: [], favorite: false });
    seed.equipment.armor = 'water-armor';
    seed.fieldHero = { areaId: seed.areaId, from: BATTLE_HERO, position: BATTLE_HERO, startedAt: 0, arrivedAt: 0, routeIndex: 0 };
    seed.fieldPopulation = { areaId: seed.areaId, generation: 0, respawns: [], enemies: [{
      id: 'water-mob', monsterId: 1002, hp: 50, maxHp: 50, position: BATTLE_HERO, approachFrom: BATTLE_HERO,
      startedAt: 0, arrivedAt: 0, enemyNextAttackAt: 999999, spawnDirection: 0, fieldSlot: 0 }] };
    const baseHp = derivedStats(seed, c).maxHp;
    seed.hp = baseHp;
    const durable = new GameRepository(pool, () => structuredClone(seed), id);
    const session = new SessionStateRepository(durable, c);
    const transact = (requestId: string | null, action: (s: typeof seed) => typeof seed) => cooperative
      ? session.transactCooperatively!(requestId, async s => action(s), 'field')
      : session.transact(requestId, action, 'field');
    await session.openSession(randomUUID(), s => s);
    const placed = await transact('field-sql', s => {
      expect(placeSageField(s, c, c.skills.sa_deluge, 5, 0, BATTLE_HERO)).toBe(true);
      captureGroundPlacement(s, c, c.skills.pf_fogwall, 1, 0, BATTLE_HERO, BATTLE_HERO);
      s.buffs.pf_fogwall = { expiresAt: 40000, effects: {} };
      s.hp = baseHp + 1; s.fieldPopulation!.enemies[0].hp = 55;
      return s;
    });
    expect(placed.hp).toBe(baseHp + 1);
    expect(placed.elementalField?.sourceName).toBe('SA_DELUGE');
    const saved = await durable.read();
    expect(saved.elementalField).toBeUndefined(); expect(saved.groundPlacements).toBeUndefined();
    expect(saved.buffs.pf_fogwall).toBeUndefined(); expect(saved.hp).toBe(baseHp);
    expect(saved.fieldPopulation!.enemies[0]).toMatchObject({ hp: 50, maxHp: 50 });
    expect((await session.read()).fieldPopulation!.enemies[0]).toMatchObject({ hp: 55, maxHp: 57 });
    const replay = await transact('field-sql', () => { throw Error('receipt must not reapply'); });
    expect(replay.hp).toBe(baseHp + 1); expect(replay.groundPlacements).toHaveLength(1);
    await expect(transact('rollback', s => { s.hp = 1; throw Error('rollback'); })).rejects.toThrow('rollback');
    expect((await session.read()).hp).toBe(baseHp + 1);
    const restarted = await new SessionStateRepository(durable, c).read();
    expect(restarted.elementalField).toBeUndefined(); expect(restarted.hp).toBe(baseHp);
    const reconnect = await session.openSession(randomUUID(), s => s);
    expect(reconnect.elementalField).toBeUndefined(); expect(reconnect.groundPlacements).toBeUndefined();
    expect(reconnect.hp).toBe(baseHp);
    expect(reconnect.fieldPopulation!.enemies[0]).toMatchObject({ hp: 50, maxHp: 50 });
  });
});
