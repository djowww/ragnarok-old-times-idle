import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import catalog from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import rules from '../content/rules.json';
import baseline from './fixtures/sense234Baseline.json';
import magicRodBaseline from './fixtures/magicRodUnsupportedBaseline.json';
import type { Catalog } from '../shared/types';

const typedCatalog = catalog as unknown as Catalog;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key =>
    JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value);
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

describe('source-closed manual Sense catalog', () => {
  it('promotes Sense and retains every non-Sight Blaster source skill value', () => {
    expect(catalog.skills.sense).toEqual({ ...baseline.sense, implementation: 'supported',
      unsupportedReason: undefined, manualUse: 'inspect' });
    const { sense: _sense, ...otherSkills } = catalog.skills as Record<string, Record<string, unknown>>;
    otherSkills.sight_blaster.implementation = 'unsupported';
    otherSkills.sight_blaster.unsupportedReason = 'Requer carga que detona ao contato com um inimigo.';
    otherSkills.al_ruwach.implementation = 'unsupported';
    otherSkills.al_ruwach.unsupportedReason = 'Requer aura que revela alvos e causa dano ao contato.';
    otherSkills.al_ruwach.name = 'Ruwach';
    otherSkills.al_ruwach.description = 'Ruwach. Dano mágico conforme Hercules pré-renovação. Requer aura que revela alvos e causa dano ao contato.';
    otherSkills.pr_lexdivina.description += ' Ruwach permanece um pré-requisito estudável com pontos, com seu efeito ainda indisponível.';
    otherSkills.dc_dontforgetme.name = 'Slow Grace';
    otherSkills.dc_dontforgetme.implementation = 'unsupported';
    otherSkills.dc_dontforgetme.unsupportedReason = 'Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
    otherSkills.dc_dontforgetme.description = 'Slow Grace. Aplica DONTFORGETME. Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
    // Restore this skill to its historical catalog row before comparing the frozen Sense234 digest.
    otherSkills.lk_jointbeat.name = 'Vital Strike';
    otherSkills.lk_jointbeat.implementation = 'unsupported';
    otherSkills.lk_jointbeat.unsupportedReason = 'Requer seleção aleatória de partes do corpo com penalidades distintas.';
    otherSkills.lk_jointbeat.description = 'Vital Strike. Dano de arma conforme Hercules pré-renovação. Requer seleção aleatória de partes do corpo com penalidades distintas.';
    // Restore Pang Voice's imported-only row before checking the frozen Sense234 catalog.
    otherSkills.ba_pangvoice.implementation = 'unsupported';
    otherSkills.ba_pangvoice.unsupportedReason = 'Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
    otherSkills.ba_pangvoice.description = 'Pang Voice. Habilidade utilitária. Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
    delete otherSkills.ba_pangvoice.statusEffect;
    delete otherSkills.ba_pangvoice.statusChance;
    delete otherSkills.ba_pangvoice.statusDurationMs;
    // Restore Wink of Charm's imported-only row before checking the frozen Sense234 catalog.
    otherSkills.dc_winkcharm.implementation = 'unsupported';
    otherSkills.dc_winkcharm.unsupportedReason = 'Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
    otherSkills.dc_winkcharm.description = 'Wink of Charm. Aplica DC_WINKCHARM. Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
    otherSkills.dc_winkcharm.statusDurationMs = [17000];
    delete otherSkills.dc_winkcharm.statusChance;
    // Restore the Close Confine source row before comparing the frozen Sense234 catalog.
    otherSkills.rg_closeconfine.name = 'Close Confine';
    otherSkills.rg_closeconfine.implementation = 'unsupported';
    otherSkills.rg_closeconfine.unsupportedReason = 'Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
    otherSkills.rg_closeconfine.description = 'Close Confine. Aplica RG_CCONFINE_S. Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
    // The frozen source baseline predates the explicit Idle balance layer.
    // Its independent coverage/hash tests validate those new vectors.
    for (const skill of Object.values(otherSkills)) delete skill.idleDamageMultiplierPct;
    // Restore Magic Rod's pre-promotion export row so the frozen digest continues
    // to verify every unrelated skill value.
    otherSkills.sa_magicrod = structuredClone(magicRodBaseline) as unknown as Record<string, unknown>;
    otherSkills.sa_spellbreaker.description = 'Interrompe a conjuração atual de um monstro em alcance 9. Custa 10 SP e tem conjuração base de 700 ms, reduzida por DEX. Monstro normal perde 2% de HP máximo; nível 5 cura metade do valor calculado. Boss tem 10% de chance e não sofre dano nem cura HP. A rotação só inicia quando pode concluir antes do monstro. Tarou não concede SP; o ramo de Magic Rod e PvP não é simulado.';
    expect(digest(otherSkills)).toBe('e38aa4357b76e6ec1b3cd2b9a7337e963e4d944ad7779371d04e20ab59db75ae');
    expect(catalog.skills.sense).toMatchObject({ id: 'sense', sourceName: 'WZ_ESTIMATION', mechanic: 'WZ_ESTIMATION',
      herculesId: 93, maxLevel: 1, spCost: [10], range: [9], targetType: 'enemy', damageType: 'none',
      power: [0], cooldownMs: 0, castTimeMs: [0], afterCastDelayMs: [0] });
    expect(manifest.skillCoverage).toMatchObject({ classes: 40, skills: 348, supported: 247, unsupported: 101 });
    expect(manifest.skillSources.sense).toMatchObject({ id: 93, name: 'WZ_ESTIMATION', implementation: 'supported',
      sourceRequirements: { SPCost: 10 }, sourceDamageType: { NoDamage: true } });
  });
  it('pins the real monster-info packet and source sense_type default without changing other content', () => {
    for (const row of baseline.sources) expect(manifest.sources).toContainEqual(row);
    expect(manifest.sources).toHaveLength(27);
    expect(manifest.sources).toContainEqual(expect.objectContaining({ path: 'src/map/clif.c',
      sha256: 'ae5fd1e746c1fa4075882762ef8b7ebb24e4022ec776f0a15da7d94464707a42' }));
    expect((rules.sourceHashes as Record<string, string>)['src/map/clif.c']).toBe('ae5fd1e746c1fa4075882762ef8b7ebb24e4022ec776f0a15da7d94464707a42');
    expect((manifest as Record<string, unknown>).senseInspection).toMatchObject({ skill: 'WZ_ESTIMATION',
      packet: 'ZC_MONSTER_INFO', packetId: '0x18c', packetSource: 'src/map/clif.c:6194..6229',
      senseType: 3, senseTypeSource: 'src/map/battle.c:7872', currentHp: true,
      elementalOrder: ['water', 'earth', 'fire', 'wind', 'poison', 'holy', 'dark', 'ghost', 'undead'], manualOnly: true });
    expect(catalog.source.commit).toBe(baseline.commit);
    for (const key of ['classes', 'items', 'monsters', 'areas'] as const) {
      const historical = key === 'monsters' ? structuredClone(typedCatalog.monsters) : catalog[key];
      if (key === 'monsters') for (const monster of Object.values(historical)) {
        if (!monster.npcStatusSkills) continue;
        monster.npcStatusSkills = monster.npcStatusSkills.filter((row: { damageType?: string }) => row.damageType !== 'magic');
        for (const row of monster.npcStatusSkills) {
          delete row.state; delete row.condition; delete row.sourceRowIndex;
        }
        if (!monster.npcStatusSkills.length) delete monster.npcStatusSkills;
      }
      expect(digest(historical)).toBe(baseline[key + 'Sha256' as keyof typeof baseline]);
    }
  });
});
