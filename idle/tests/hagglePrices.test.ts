import { describe, expect, it } from 'vitest';
import sourceCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { merchantPrice } from '../shared/prices.js';
import { createInitialState } from '../engine/index.js';
import { executeCommand } from '../engine/commands.js';

const setup = (job = 'rogue') => {
  const c = structuredClone(sourceCatalog) as unknown as Catalog;
  // Metadata seam while the catalog's sole exporter implements support concurrently.
  c.skills.rg_compulsion.implementation = 'supported';
  const s = createInitialState(c, 0, 'haggle-in-memory-test');
  s.job = job;
  s.jobLevel = 50;
  s.learnedSkills = { rg_gangster: 1 };
  return { c, s };
};

describe('pinned Hercules Haggle NPC prices', () => {
  it.each([[1, 91], [2, 87], [3, 83], [4, 79], [5, 75]])(
    'charges %i Haggle at the source NPC buy price %i per 100', (level, price) => {
      const { s, c } = setup();
      s.learnedSkills.rg_compulsion = level;
      expect(merchantPrice(s, c, 100, 'buy')).toBe(price);
    },
  );

  it.each(['rogue', 'stalker'])('uses Haggle from the legal %s tree', job => {
    const { s, c } = setup(job);
    s.learnedSkills.rg_compulsion = 5;
    expect(merchantPrice(s, c, 100, 'buy')).toBe(75);
  });

  it.each(['novice', 'thief', 'merchant', 'missing-class'])('ignores leaked Haggle in %s', job => {
    const { s, c } = setup(job);
    s.learnedSkills.rg_compulsion = 5;
    expect(merchantPrice(s, c, 100, 'buy')).toBe(100);
  });

  it.each(['unsupported', 'missing-support', 'missing-skill', 'excluded-tree', 'unlearned'])(
    'does not discount when Haggle is %s', rejection => {
      const { s, c } = setup();
      s.learnedSkills.rg_compulsion = 5;
      if (rejection === 'unsupported') c.skills.rg_compulsion.implementation = 'unsupported';
      if (rejection === 'missing-support') delete c.skills.rg_compulsion.implementation;
      if (rejection === 'missing-skill') delete c.skills.rg_compulsion;
      if (rejection === 'excluded-tree') c.classes.rogue.skills = c.classes.rogue.skills.filter(id => id !== 'rg_compulsion');
      if (rejection === 'unlearned') delete s.learnedSkills.rg_compulsion;
      expect(merchantPrice(s, c, 100, 'buy')).toBe(100);
    },
  );

  it.each([0, -1, 1.5, NaN, Infinity])('ignores illegal learned level %s', level => {
    const { s, c } = setup();
    s.learnedSkills.rg_compulsion = level;
    expect(merchantPrice(s, c, 100, 'buy')).toBe(100);
  });

  it('caps an integer overflow at both the source and catalog maximum', () => {
    const { s, c } = setup();
    s.learnedSkills.rg_compulsion = 999;
    c.skills.rg_compulsion.maxLevel = 99;
    expect(merchantPrice(s, c, 100, 'buy')).toBe(75);
    c.skills.rg_compulsion.maxLevel = 3;
    expect(merchantPrice(s, c, 100, 'buy')).toBe(83);
  });

  it('uses inherited legacy trees while respecting already resolved source exclusions', () => {
    const { s, c } = setup('stalker');
    s.learnedSkills.rg_compulsion = 5;
    c.classes.stalker.skills = [];
    expect(merchantPrice(s, c, 100, 'buy')).toBe(100);
    c.source.files = [];
    expect(merchantPrice(s, c, 100, 'buy')).toBe(75);
  });

  it('rejects leaked, unsupported and fractional Merchant levels', () => {
    const { s, c } = setup('rogue');
    s.learnedSkills = { mc_discount: 10 };
    expect(merchantPrice(s, c, 100, 'buy')).toBe(100);
    s.job = 'merchant';
    c.skills.mc_discount.implementation = 'unsupported';
    expect(merchantPrice(s, c, 100, 'buy')).toBe(100);
    c.skills.mc_discount.implementation = 'supported';
    s.learnedSkills.mc_discount = 1.5;
    expect(merchantPrice(s, c, 100, 'buy')).toBe(100);
  });

  it('keeps the source buy minimum without a learned discount', () => {
    const { s, c } = setup();
    expect(merchantPrice(s, c, 0, 'buy')).toBe(1);
  });

  it.each([[10, 4, 76], [10, 5, 75], [1, 1, 91]])(
    'uses the higher of Merchant %i and Haggle %i for %i, without adding discounts', (merchant, haggle, price) => {
      const { s, c } = setup();
      // Both source skills may coexist: explicitly make both legal in this comparison seam.
      c.classes.rogue.skills.push('mc_discount');
      s.learnedSkills.mc_discount = merchant;
      s.learnedSkills.rg_compulsion = haggle;
      expect(merchantPrice(s, c, 100, 'buy')).toBe(price);
    },
  );

  it('retains Merchant Discount and Overcharge prices in inherited merchant trees', () => {
    const { s, c } = setup('blacksmith');
    s.learnedSkills = { mc_discount: 10, mc_overcharge: 10 };
    expect(merchantPrice(s, c, 100, 'buy')).toBe(76);
    expect(merchantPrice(s, c, 100, 'sell')).toBe(124);
    expect(merchantPrice(s, c, 101, 'sell')).toBe(125);
    expect(merchantPrice(s, c, 0, 'sell')).toBe(0);
  });

  it('leaves Rogue selling unchanged regardless of Haggle level', () => {
    const { s, c } = setup();
    s.learnedSkills.rg_compulsion = 5;
    expect(merchantPrice(s, c, 100, 'sell')).toBe(100);
    expect(merchantPrice(s, c, 0, 'sell')).toBe(0);
  });

  it('truncates each unit buy price and keeps the default buy minimum at one', () => {
    const { s, c } = setup();
    s.learnedSkills.rg_compulsion = 5;
    expect(merchantPrice(s, c, 101, 'buy')).toBe(75);
    expect(merchantPrice(s, c, 3, 'buy')).toBe(2);
    expect(merchantPrice(s, c, 1, 'buy')).toBe(1);
    expect(merchantPrice(s, c, 0, 'buy')).toBe(1);
  });

  it('learns Gangster and Haggle with points, then buys and restores the discount from saved state in RAM', () => {
    const { s, c } = setup();
    s.learnedSkills = { rg_stripshield: 3 };
    s.skillPoints = 6;
    expect(() => executeCommand(s, c, { type: 'learnSkill', skillId: 'rg_compulsion' }, 0)).toThrow();
    expect(s.skillPoints).toBe(6);
    executeCommand(s, c, { type: 'learnSkill', skillId: 'rg_gangster' }, 0);
    for (let level = 1; level <= 5; level++) {
      executeCommand(s, c, { type: 'learnSkill', skillId: 'rg_compulsion' }, 0);
    }
    expect(s.skillPoints).toBe(0);
    expect(c.skills.rg_gangster.implementation).toBe('unsupported');
    expect(() => executeCommand(s, c, { type: 'setRotation', skillIds: ['rg_compulsion'] }, 0)).toThrow();
    s.status = 'town';
    s.inventory = [];
    s.zeny = 1000;
    c.items[501].buyPrice = 101;
    const sp = s.sp;
    const cooldowns = { ...s.skillReadyAt };
    executeCommand(s, c, { type: 'buy', itemId: 501, quantity: 3 }, 0);
    expect(s.zeny).toBe(775);
    expect(s.inventory.find(item => item.itemId === 501)?.quantity).toBe(3);
    expect(s.sp).toBe(sp);
    expect(s.skillReadyAt).toEqual(cooldowns);
    const restored = JSON.parse(JSON.stringify(s));
    executeCommand(restored, c, { type: 'buy', itemId: 501, quantity: 1 }, 0);
    expect(restored.zeny).toBe(700);
    expect(restored.inventory.find((item: { itemId: number }) => item.itemId === 501)?.quantity).toBe(4);
    expect(s.zeny).toBe(775);
  });
});
